import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Opens the debtor's UPI app on a phone, pre-filled. UPI IDs only contain
// URL-safe characters, so pa is left as is.
const upiLink = (s) =>
  `upi://pay?pa=${s.to.upiId}&pn=${encodeURIComponent(s.to.name)}&am=${s.amount.toFixed(
    2
  )}&cu=INR&tn=${encodeURIComponent('Expense Settler')}`;

export default function SettlementList({ groupId, settlements, onChange }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const run = async (id, fn) => {
    setError('');
    setBusyId(id);
    try {
      await fn();
      await onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  // Secondary option: Razorpay test-mode card checkout (demo only).
  const payByCard = (s) =>
    run(s._id, async () => {
      const order = await api.createOrder(s._id);
      if (!window.Razorpay) {
        throw new Error('Razorpay checkout script did not load. Check your network/adblocker.');
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
            // non-fatal - the webhook is the source of truth
          }
          onChange?.();
        },
        modal: { ondismiss: () => setBusyId(null) },
        theme: { color: '#2f6f4f' },
      });
      rzp.open();
    });

  if (settlements.length === 0) {
    return <p className="muted">Everyone is settled up.</p>;
  }

  const iOweSomeone = settlements.some((s) => s.from._id === user?._id);

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <ul className="settlement-list">
        {settlements.map((s) => {
          const iAmDebtor = s.from._id === user?._id;
          const iAmCreditor = s.to._id === user?._id;
          const awaiting = s.status === 'awaiting_confirmation';
          const busy = busyId === s._id;

          return (
            <li key={s._id} className="settlement-item">
              <div className="settlement-row">
                <span>
                  <strong>{s.from.name}</strong> owes <strong>{s.to.name}</strong>
                </span>
                <span>₹{s.amount.toFixed(2)}</span>
              </div>

              {awaiting && (
                <p className="muted">
                  {iAmCreditor
                    ? `${s.from.name} says they've paid you. Please check and confirm.`
                    : iAmDebtor
                    ? `Waiting for ${s.to.name} to confirm.`
                    : 'Payment reported, awaiting confirmation.'}
                </p>
              )}
              {s.status === 'processing' && <p className="muted">Card payment started.</p>}

              {iAmDebtor && !awaiting && (
                <div className="actions">
                  {s.to.upiId ? (
                    <>
                      <a className="btn" href={upiLink(s)}>
                        Pay via UPI
                      </a>
                      <span className="muted">UPI ID: {s.to.upiId}</span>
                    </>
                  ) : (
                    <span className="muted">{s.to.name} hasn't added a UPI ID yet.</span>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => run(s._id, () => api.reportPayment(groupId, s._id))}
                  >
                    I've paid
                  </button>
                  <button className="secondary" disabled={busy} onClick={() => payByCard(s)}>
                    Pay by card (test mode)
                  </button>
                </div>
              )}

              {iAmCreditor && !awaiting && (
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => run(s._id, () => api.confirmPayment(groupId, s._id))}
                  >
                    Mark as received
                  </button>
                </div>
              )}

              {iAmCreditor && awaiting && (
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => run(s._id, () => api.confirmPayment(groupId, s._id))}
                  >
                    Confirm received
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => run(s._id, () => api.rejectPayment(groupId, s._id))}
                  >
                    Not received
                  </button>
                </div>
              )}

              {!iAmDebtor && !iAmCreditor && !awaiting && (
                <p className="muted">awaiting payment</p>
              )}
            </li>
          );
        })}
      </ul>
      {iOweSomeone && (
        <p className="muted">
          The UPI link opens your UPI app on a phone. On a computer, pay the UPI ID shown from your
          phone, then tap "I've paid".
        </p>
      )}
    </div>
  );
}