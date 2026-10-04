import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Balance from '../components/Balance';

export default function Dashboard() {
  const { user, logout, refresh } = useAuth();
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [upiId, setUpiId] = useState(user?.upiId || '');
  const [upiMsg, setUpiMsg] = useState('');

  const loadGroups = async () => {
    const { groups } = await api.listGroups();
    setGroups(groups);
    setLoading(false);
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const memberEmails = emails
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { unresolvedEmails } = await api.createGroup({ name, memberEmails });
      if (unresolvedEmails?.length) {
        setError(`Note: no registered user found for: ${unresolvedEmails.join(', ')}`);
      }
      setName('');
      setEmails('');
      loadGroups();
    } catch (err) {
      setError(err.message);
    }
  };

  const onSaveUpi = async (e) => {
    e.preventDefault();
    setUpiMsg('');
    try {
      await api.updateProfile({ upiId: upiId.trim() });
      await refresh();
      setUpiMsg('Saved');
    } catch (err) {
      setUpiMsg(err.details ? err.details.map((d) => d.message).join(', ') : err.message);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>Expense Settler</h1>
        <div>
          <span className="muted">{user?.name}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      <div className="grid">
        <div>
          <h2>Your groups</h2>
          {loading ? (
            <p>Loading...</p>
          ) : groups.length === 0 ? (
            <p className="muted">No groups yet - create one to get started.</p>
          ) : (
            <ul className="group-list">
              {groups.map((g) => (
                <li key={g._id}>
                  <Link to={`/groups/${g._id}`}>{g.name}</Link>
                  <span className="muted"> · {g.members.length} members</span>
                  <div>
                    <Balance amount={g.myBalance} you />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <form onSubmit={onCreate} className="card">
            <h3>Create a group</h3>
            {error && <p className="error">{error}</p>}
            <label>
              Group name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Other members' emails (comma separated, must already be registered). You're added
              automatically as the group admin.
              <input
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="raj@example.com, priya@example.com"
              />
            </label>
            <button type="submit">Create group</button>
          </form>

          <form onSubmit={onSaveUpi} className="card">
            <h3>Your UPI ID</h3>
            <p className="muted">
              Flatmates who owe you will see this so they can pay you directly. It is only shown to
              the person who has to pay you.
            </p>
            <label>
              UPI ID
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@bank"
              />
            </label>
            <button type="submit">Save</button>
            {upiMsg && <p className={upiMsg === 'Saved' ? 'positive' : 'error'}>{upiMsg}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}