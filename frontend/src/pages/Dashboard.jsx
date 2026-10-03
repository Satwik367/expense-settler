import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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
                </li>
              ))}
            </ul>
          )}
        </div>

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
      </div>
    </div>
  );
}