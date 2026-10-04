export default function Balance({ amount, you = false }) {
  if (amount > 0.005) {
    return (
      <span className="positive">
        {you ? 'You are owed' : 'is owed'} ₹{amount.toFixed(2)}
      </span>
    );
  }
  if (amount < -0.005) {
    return (
      <span className="negative">
        {you ? 'You owe' : 'owes'} ₹{(-amount).toFixed(2)}
      </span>
    );
  }
  return <span className="muted">{you ? 'Settled up' : 'is settled up'}</span>;
}