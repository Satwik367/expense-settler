import { useState } from 'react';

export default function ExpenseForm({ members, onSubmit }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(members[0]?._id || '');
  const [splitType, setSplitType] = useState('equal');
  const [selected, setSelected] = useState(() => new Set(members.map((m) => m._id)));
  const [customShares, setCustomShares] = useState({});
  const [percentages, setPercentages] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleMember = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const buildParticipants = () => {
    const ids = Array.from(selected);
    if (splitType === 'equal') {
      return ids.map((user) => ({ user }));
    }
    if (splitType === 'custom') {
      return ids.map((user) => ({ user, share: Number(customShares[user] || 0) }));
    }
    return ids.map((user) => ({ user, percentage: Number(percentages[user] || 0) }));
  };

  const onSubmitForm = async (e) => {
    e.preventDefault();
    setError('');

    if (selected.size === 0) {
      setError('Select at least one participant');
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        description,
        amount: Number(amount),
        paidBy,
        splitType,
        participants: buildParticipants(),
      });
      setDescription('');
      setAmount('');
      setCustomShares({});
      setPercentages({});
    } catch (err) {
      setError(err.details ? err.details.map((d) => d.message).join(', ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmitForm} className="card">
      <h3>Add expense</h3>
      {error && <p className="error">{error}</p>}

      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>

      <label>
        Amount (INR)
        <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>

      <label>
        Paid by
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {members.map((m) => (
            <option key={m._id} value={m._id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Split type
        <select value={splitType} onChange={(e) => setSplitType(e.target.value)}>
          <option value="equal">Equal</option>
          <option value="custom">Custom amounts</option>
          <option value="percentage">Percentage</option>
        </select>
      </label>

      <fieldset>
        <legend>Participants</legend>
        {members.map((m) => (
          <div key={m._id} className="participant-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={selected.has(m._id)}
                onChange={() => toggleMember(m._id)}
              />
              {m.name}
            </label>
            {splitType === 'custom' && selected.has(m._id) && (
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={customShares[m._id] || ''}
                onChange={(e) => setCustomShares((s) => ({ ...s, [m._id]: e.target.value }))}
              />
            )}
            {splitType === 'percentage' && selected.has(m._id) && (
              <input
                type="number"
                step="0.01"
                placeholder="%"
                value={percentages[m._id] || ''}
                onChange={(e) => setPercentages((s) => ({ ...s, [m._id]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </fieldset>

      <button type="submit" disabled={busy}>
        {busy ? 'Adding...' : 'Add expense'}
      </button>
    </form>
  );
}