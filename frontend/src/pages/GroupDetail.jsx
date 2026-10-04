import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ExpenseForm from '../components/ExpenseForm';
import SettlementList from '../components/SettlementList';
import Balance from '../components/Balance';

export default function GroupDetail() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [balances, setBalances] = useState([]);
  const [editing, setEditing] = useState(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const isAdmin = Boolean(group && user && group.createdBy === user._id);
  const canModify = (e) => isAdmin || e.createdBy === user?._id;
  const wasEdited = (e) => new Date(e.updatedAt) - new Date(e.createdAt) > 1000;

  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [{ group }, { expenses }, { settlements }, { balances }] = await Promise.all([
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.listSettlements(groupId),
        api.getBalances(groupId),
      ]);
      setGroup(group);
      setExpenses(expenses);
      setSettlements(settlements);
      setBalances(balances);
    } catch (err) {
      setLoadError(err.message);
    }
  }, [groupId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // The backend recomputes settlements after every expense change,
  // so reloading everything is all that's needed here.
  const onAddExpense = async (payload) => {
    await api.createExpense(groupId, payload);
    await loadAll();
  };

  const onUpdateExpense = async (payload) => {
    await api.updateExpense(groupId, editing._id, payload);
    setEditing(null);
    await loadAll();
  };

  const onDeleteExpense = async (expense) => {
    if (!window.confirm(`Delete "${expense.description}"? Balances will be recalculated.`)) return;
    setError('');
    try {
      await api.deleteExpense(groupId, expense._id);
      if (editing && editing._id === expense._id) setEditing(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
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
          <ExpenseForm
            key={editing ? editing._id : 'new'}
            members={group.members}
            initial={editing || undefined}
            onSubmit={editing ? onUpdateExpense : onAddExpense}
            onCancel={editing ? () => setEditing(null) : undefined}
          />

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
            <h3>Balances</h3>
            <ul>
              {balances.map((b) => (
                <li key={b.user._id} className="balance-row">
                  <strong>{b.user.name}</strong>
                  <Balance amount={b.amount} />
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Settlements</h3>
            <SettlementList groupId={groupId} settlements={settlements} onChange={loadAll} />
          </div>

          <div className="card">
            <h3>Expenses</h3>
            {expenses.length === 0 ? (
              <p className="muted">No expenses logged yet.</p>
            ) : (
              <ul className="expense-list">
                {expenses.map((e) => (
                  <li key={e._id}>
                    <div>
                      <strong>{e.description}</strong> — ₹{e.amount.toFixed(2)} paid by {e.paidBy.name}
                      <span className="muted">
                        {' '}
                        ({e.splitType} split{wasEdited(e) ? ', edited' : ''})
                      </span>
                    </div>
                    {canModify(e) && (
                      <div className="actions">
                        <button className="link-button" onClick={() => setEditing(e)}>
                          Edit
                        </button>
                        <button className="link-button danger-text" onClick={() => onDeleteExpense(e)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
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