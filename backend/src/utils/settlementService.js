const Settlement = require('../models/Settlement');
const { minimizeTransactions } = require('./settlementAlgorithm');
const { getOutstandingBalances } = require('./balances');

const keyOf = (from, to, amount) => `${from}|${to}|${amount.toFixed(2)}`;

/**
 * Rebuilds the active settlement list from current balances.
 * Settlements that are unchanged are kept as they are (so a payment in
 * progress isn't invalidated by an unrelated edit). Only the ones that no
 * longer match are marked stale, and only new ones are inserted.
 * Settlements awaiting confirmation are left alone and counted as paid.
 */
async function recomputeSettlements(groupId) {
  const balances = await getOutstandingBalances(groupId, { countAwaiting: true });
  const transactions = minimizeTransactions(balances);

  const active = await Settlement.find({
    group: groupId,
    status: { $in: ['pending', 'processing'] },
  });

  const reusable = new Map();
  for (const s of active) {
    const key = keyOf(s.from, s.to, s.amount);
    if (!reusable.has(key)) reusable.set(key, []);
    reusable.get(key).push(s);
  }

  const keep = new Set();
  const toInsert = [];
  for (const t of transactions) {
    const bucket = reusable.get(keyOf(t.from, t.to, t.amount));
    if (bucket && bucket.length > 0) {
      keep.add(bucket.pop()._id.toString());
    } else {
      toInsert.push(t);
    }
  }

  const staleIds = active.filter((s) => !keep.has(s._id.toString())).map((s) => s._id);
  if (staleIds.length > 0) {
    await Settlement.updateMany({ _id: { $in: staleIds } }, { $set: { status: 'stale' } });
  }

  if (toInsert.length > 0) {
    const computedAt = new Date();
    await Settlement.insertMany(
      toInsert.map((t) => ({
        group: groupId,
        from: t.from,
        to: t.to,
        amount: t.amount,
        status: 'pending',
        computedAt,
      }))
    );
  }
}

// Used after a write that has already succeeded: a recompute failure is
// logged but must not turn a saved expense into an error response.
async function safeRecompute(groupId) {
  try {
    await recomputeSettlements(groupId);
  } catch (err) {
    console.error('[settlements] auto-recompute failed:', err.message);
  }
}

module.exports = { recomputeSettlements, safeRecompute };