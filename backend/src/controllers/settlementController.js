const Group = require('../models/Group');
const Settlement = require('../models/Settlement');
const { minimizeTransactions } = require('../utils/settlementAlgorithm');
const { getOutstandingBalances } = require('../utils/balances');
const { AppError } = require('../middleware/errorHandler');

async function assertMember(groupId, userId) {
  const group = await Group.findById(groupId);
  if (!group) throw new AppError(404, 'Group not found');
  if (!group.members.map(String).includes(userId)) {
    throw new AppError(403, 'You are not a member of this group');
  }
  return group;
}

/**
 * Recomputes the minimal settlement set from the group's OUTSTANDING
 * balances (expenses minus already-paid settlements) and replaces any
 * unpaid settlements. Paid settlements are never touched.
 */
async function computeSettlements(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMember(groupId, req.user.id);

    const balances = await getOutstandingBalances(groupId);
    const transactions = minimizeTransactions(balances);

    // Mark previous unpaid settlements stale rather than deleting them,
    // so there's an audit trail of how the graph evolved.
    await Settlement.updateMany(
      { group: groupId, status: { $in: ['pending', 'processing'] } },
      { $set: { status: 'stale' } }
    );

    const computedAt = new Date();
    const created = await Settlement.insertMany(
      transactions.map((t) => ({
        group: groupId,
        from: t.from,
        to: t.to,
        amount: t.amount,
        status: 'pending',
        computedAt,
      }))
    );

    const populated = await Settlement.find({ _id: { $in: created.map((c) => c._id) } })
      .populate('from', 'name email')
      .populate('to', 'name email');

    res.status(201).json({ settlements: populated });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists settlements that still need action. 'processing' is included so a
 * payment that was started but abandoned (closed checkout) can be retried.
 */
async function listSettlements(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMember(groupId, req.user.id);

    const settlements = await Settlement.find({
      group: groupId,
      status: { $in: ['pending', 'processing'] },
    })
      .populate('from', 'name email')
      .populate('to', 'name email')
      .sort({ amount: -1 });

    res.json({ settlements });
  } catch (err) {
    next(err);
  }
}

module.exports = { computeSettlements, listSettlements };