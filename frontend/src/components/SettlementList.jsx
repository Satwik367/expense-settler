import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SettlementList({ settlements, onPaid }) {
  const { user } = useAuth();
  const [payingId, setPayingId] = useState(null);
  const [error, setError] = useState('');

  const pay = async (settlement) => {
    setError('');
    setPayingId(settlement._id);
    try {
      const order = await api.createOrder(settlement._id);

      if (!window.Razorpay) {
        setError('Razorpay checkout script did not load. Check your network/adblocker.');
        return;
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Expense Settler',
        description: `Settling up with ${order.settlement.payTo}`,
        handler: async (response) => {
          try {
            await api.verifyCallback(response);
          } catch {
            // non-fatal - webhook is still the source of truth
          }
          onPaid?.();
        },
        modal: {
          ondismiss: () => setPayingId(null),
        },
        theme: { color: '#2f6f4f' },
      });

      rzp.open();
    } catch (err) {
      setError(err.message);
    } finally {
      setPayingId(null);
    }
  };

  if (settlements.length === 0) {
    return <p className="muted">Everyone is settled up.</p>;
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <ul className="settlement-list">
        {settlements.map((s) => (
          <li key={s._id} className="settlement-row">
            <span>
              <strong>{s.from.name}</strong> owes <strong>{s.to.name}</strong>
            </span>
            <span>₹{s.amount.toFixed(2)}</span>
            {s.from._id === user?._id ? (
              <button onClick={() => pay(s)} disabled={payingId === s._id}>
                {payingId === s._id ? 'Processing...' : 'Pay now'}
              </button>
            ) : (
              <span className="muted">awaiting payment</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}