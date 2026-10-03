import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ExpenseForm from '../components/ExpenseForm';
import SettlementList from '../components/SettlementList';

export default function GroupDetail() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [computing, setComputing] = useState(false);

  const isAdmin = Boolean(group && user && group.createdBy === user._id);

  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [{ group }, { expenses }, { settlements }] = await Promise.all([
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.listSettlements(groupId),
      ]);
      setGroup(group);
      setExpenses(expenses);
      setSettlements(settlements);
    } catch (err) {
      setLoadError(err.message);
    }
  }, [groupId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onAddExpense = async (payload) => {
    await api.createExpense(groupId, payload);
    const { expenses } = await api.listExpenses(groupId);
    setExpenses(expenses);
  };

  const onCompute = async () => {
    setComputing(true);
    setError('');
    try {
      await api.computeSettlements(groupId);
      const { settlements } = await api.listSettlements(groupId);
      setSettlements(settlements);
    } catch (err) {
      setError(err.message);
    } finally {
      setComputing(false);
    }
  };

  const onAddMember = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { group } = await api.addMember(groupId, memberEmail);
      setGroup(group);
      setMemberEmail('');
    } catch (err) {
      setError(err.message);
    }
  };

  const onLeave = async () => {
    if (!window.confirm('Leave this group? You can only leave once you have no outstanding balance.')) return;
    setError('');
    try {
      await api.leaveGroup(groupId);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loadError) {
    return (
      <div className="page">
        <p className="error">{loadError}</p>
        <Link to="/">&larr; Back to all groups</Link>
      </div>
    );
  }

  if (!group) return <p className="page">Loading...</p>;

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <Link to="/">&larr; All groups</Link>
          <h1>{group.name}</h1>
          <p className="muted">
            {group.members
              .map((m) => (m._id === group.createdBy ? `${m.name} (admin)` : m.name))
              .join(', ')}
          </p>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="grid">
        <div>
          <ExpenseForm members={group.members} onSubmit={onAddExpense} />

          <form onSubmit={onAddMember} className="card">
            <h3>Add a flatmate</h3>
            <label>
              Email (must already be registered)
              <input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required />
            </label>
            <button type="submit">Add to group</button>
          </form>
        </div>

        <div>
          <div className="card">
            <h3>Expenses</h3>
            {expenses.length === 0 ? (
              <p className="muted">No expenses logged yet.</p>
            ) : (
              <ul className="expense-list">
                {expenses.map((e) => (
                  <li key={e._id}>
                    <strong>{e.description}</strong> — ₹{e.amount.toFixed(2)} paid by {e.paidBy.name}
                    <span className="muted"> ({e.splitType} split)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Settlements</h3>
              <button onClick={onCompute} disabled={computing}>
                {computing ? 'Computing...' : 'Recompute settlements'}
              </button>
            </div>
            <SettlementList settlements={settlements} onPaid={loadAll} />
          </div>

          <div className="card">
            <h3>Leave group</h3>
            {isAdmin ? (
              <p className="muted">
                You created this group, so you're its admin and can't leave it. The group and its
                history stay as a permanent record.
              </p>
            ) : (
              <>
                <p className="muted">
                  You can leave once you have no outstanding balance. The group's history stays for
                  the other members.
                </p>
                <button className="danger" onClick={onLeave}>
                  Leave group
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}