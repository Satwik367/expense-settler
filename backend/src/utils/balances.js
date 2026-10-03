const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { computeNetBalances } = require('./settlementAlgorithm');

/**
 * Net outstanding balance per user for a group.
 * Positive = is still owed money. Negative = still owes money.
 *
 * Starts from what the expenses imply, then treats every PAID settlement
 * as a real transfer: the payer owes less, the receiver is owed less.
 * Both recompute and the leave check use this, so "settled" has
 * exactly one definition.
 */
async function getOutstandingBalances(groupId) {
  const expenses = await Expense.find({ group: groupId });

  const normalized = expenses.map((e) => ({
    amount: e.amount,
    paidBy: e.paidBy.toString(),
    participants: e.participants.map((p) => ({
      user: p.user.toString(),
      share: p.share,
    })),
  }));

  const balances = computeNetBalances(normalized);

  const paid = await Settlement.find({ group: groupId, status: 'paid' });
  for (const s of paid) {
    const from = s.from.toString();
    const to = s.to.toString();
    balances.set(from, (balances.get(from) || 0) + s.amount);
    balances.set(to, (balances.get(to) || 0) - s.amount);
  }

  for (const [userId, amount] of balances.entries()) {
    balances.set(userId, Math.round(amount * 100) / 100);
  }

  return balances;
}

module.exports = { getOutstandingBalances };