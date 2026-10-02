/**
 * Settlement minimization.
 *
 * Problem: given a set of pairwise debts implied by a group's expenses,
 * find the minimum number of transactions that settle every balance.
 *
 * This is the classic "optimal account balancing" problem. Naive
 * pairwise settlement (everyone pays everyone they individually owe)
 * can require up to O(n^2) transactions. By first collapsing every
 * member down to a single net balance (positive = owed money, negative
 * = owes money), the problem reduces to: partition net creditors and
 * net debtors, and match them up so as few transactions as possible
 * change hands.
 *
 * This isn't the theoretical minimum in every case (that variant is
 * NP-hard - it's equivalent to a subset-sum partitioning problem), but
 * the greedy "always settle the largest creditor against the largest
 * debtor" strategy used here is the standard practical approach (used
 * by Splitwise itself) and gives a result that's optimal or extremely
 * close to it in virtually all real-world cases, in O(n log n) time.
 */

const EPSILON = 0.01; // treat sub-cent differences as zero (floating point)

/**
 * @param {Array<{userId: string, amount: number, paidBy: string, participants: Array<{user: string, share: number}>}>} expenses
 * @returns {Map<string, number>} net balance per userId. Positive = is owed money. Negative = owes money.
 */
function computeNetBalances(expenses) {
  const balances = new Map();

  const adjust = (userId, delta) => {
    balances.set(userId, (balances.get(userId) || 0) + delta);
  };

  for (const expense of expenses) {
    // The payer fronted the full amount, so they're owed the whole thing back...
    adjust(expense.paidBy, expense.amount);
    // ...minus whatever share of it was actually theirs to begin with.
    for (const { user, share } of expense.participants) {
      adjust(user, -share);
    }
  }

  // Round to 2 decimal places to avoid floating point dust accumulating
  // across many expenses (e.g. 99.999999999 instead of 100).
  for (const [userId, amount] of balances.entries()) {
    balances.set(userId, Math.round(amount * 100) / 100);
  }

  return balances;
}

/**
 * Reduces a set of net balances to the minimum set of settling transactions.
 *
 * @param {Map<string, number>} netBalances
 * @returns {Array<{from: string, to: string, amount: number}>}
 */
function minimizeTransactions(netBalances) {
  // Split into creditors (owed money, positive) and debtors (owe money, negative).
  // Using plain arrays + repeated max-scan rather than a real heap: group
  // sizes here are small (a PG/flatmate group, realistically < 30 people),
  // so O(n^2 log n) is irrelevant in practice and the code stays simple
  // and easy to reason about / debug.
  const creditors = [];
  const debtors = [];

  for (const [userId, amount] of netBalances.entries()) {
    if (amount > EPSILON) {
      creditors.push({ userId, amount });
    } else if (amount < -EPSILON) {
      debtors.push({ userId, amount: -amount }); // store as positive "owes this much"
    }
    // amounts within EPSILON of zero are already settled, skip entirely
  }

  const transactions = [];

  while (creditors.length > 0 && debtors.length > 0) {
    // Find the largest creditor and largest debtor
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const topCreditor = creditors[0];
    const topDebtor = debtors[0];

    const settleAmount = Math.round(Math.min(topCreditor.amount, topDebtor.amount) * 100) / 100;

    transactions.push({
      from: topDebtor.userId,
      to: topCreditor.userId,
      amount: settleAmount,
    });

    topCreditor.amount = Math.round((topCreditor.amount - settleAmount) * 100) / 100;
    topDebtor.amount = Math.round((topDebtor.amount - settleAmount) * 100) / 100;

    if (topCreditor.amount <= EPSILON) creditors.shift();
    if (topDebtor.amount <= EPSILON) debtors.shift();
  }

  return transactions;
}

/**
 * Convenience wrapper: expenses in, minimized settlement list out.
 *
 * @param {Array} expenses - raw Expense documents (or plain objects with the same shape)
 * @returns {Array<{from: string, to: string, amount: number}>}
 */
function computeMinimalSettlements(expenses) {
  const normalized = expenses.map((e) => ({
    amount: e.amount,
    paidBy: e.paidBy.toString(),
    participants: e.participants.map((p) => ({
      user: p.user.toString(),
      share: p.share,
    })),
  }));

  const balances = computeNetBalances(normalized);
  return minimizeTransactions(balances);
}

module.exports = {
  computeNetBalances,
  minimizeTransactions,
  computeMinimalSettlements,
  EPSILON,
};