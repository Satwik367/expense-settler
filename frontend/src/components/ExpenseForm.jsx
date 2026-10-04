import { useState } from 'react';

export default function ExpenseForm({ members, onSubmit, initial, onCancel }) {
  const editing = Boolean(initial);

  const [description, setDescription] = useState(initial?.description || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [paidBy, setPaidBy] = useState(initial ? initial.paidBy._id : members[0]?._id || '');
  const [splitType, setSplitType] = useState(initial?.splitType || 'equal');
  const [selected, setSelected] = useState(
    () => new Set(initial ? initial.participants.map((p) => p.user._id) : members.map((m) => m._id))
  );
  const [customShares, setCustomShares] = useState(() =>
    initial && initial.splitType === 'custom'
      ? Object.fromEntries(initial.participants.map((p) => [p.user._id, String(p.share)]))
      : {}
  );
  const [percentages, setPercentages] = useState(() =>
    initial && initial.splitType === 'percentage'
      ? Object.fromEntries(
          initial.participants.map((p) => [
            p.user._id,
            String(Math.round((p.share / initial.amount) * 1000000) / 10000),
          ])
        )
      : {}
  );
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
      if (!editing) {
        setDescription('');
        setAmount('');
        setCustomShares({});
        setPercentages({});
      }
    } catch (err) {
      setError(err.details ? err.details.map((d) => d.message).join(', ') : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmitForm} className="card">
      <h3>{editing ? 'Edit expense' : 'Add expense'}</h3>
      {error && <p className="error">{error}</p>}

      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>

      <label>
        Amount (INR)
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
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

      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving...' : editing ? 'Save changes' : 'Add expense'}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}