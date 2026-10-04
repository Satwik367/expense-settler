const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { computeNetBalances } = require('./settlementAlgorithm');

/**
 * Net outstanding balance per user for a group.
 * Positive = is still owed money. Negative = still owes money.
 *
 * Starts from the (non-deleted) expenses, then treats PAID settlements as
 * real transfers. With countAwaiting, settlements the debtor has reported
 * but the creditor hasn't confirmed yet also count - used when recomputing
 * the settlement list so the same debt isn't listed twice. Leave checks and
 * the balances view leave it off, so nothing looks settled before the
 * creditor confirms.
 */
async function getOutstandingBalances(groupId, { countAwaiting = false } = {}) {
  const expenses = await Expense.find({ group: groupId, deletedAt: null });

  const normalized = expenses.map((e) => ({
    amount: e.amount,
    paidBy: e.paidBy.toString(),
    participants: e.participants.map((p) => ({
      user: p.user.toString(),
      share: p.share,
    })),
  }));

  const balances = computeNetBalances(normalized);

  const counted = countAwaiting ? ['paid', 'awaiting_confirmation'] : ['paid'];
  const transfers = await Settlement.find({ group: groupId, status: { $in: counted } });
  for (const s of transfers) {
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