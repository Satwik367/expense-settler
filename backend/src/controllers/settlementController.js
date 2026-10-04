const mongoose = require('mongoose');
const Group = require('../models/Group');
const Settlement = require('../models/Settlement');
const { recomputeSettlements, safeRecompute } = require('../utils/settlementService');
const { AppError } = require('../middleware/errorHandler');

const ACTIVE_STATUSES = ['pending', 'processing', 'awaiting_confirmation'];

async function assertMember(groupId, userId) {
  if (!mongoose.isValidObjectId(groupId)) throw new AppError(404, 'Group not found');
  const group = await Group.findById(groupId);
  if (!group) throw new AppError(404, 'Group not found');
  if (!group.members.map(String).includes(userId)) {
    throw new AppError(403, 'You are not a member of this group');
  }
  return group;
}

// The creditor's UPI ID is only sent to the person who has to pay them.
function serialize(settlement, viewerId) {
  const obj = settlement.toJSON();
  const viewerIsDebtor = obj.from && obj.from._id && obj.from._id.toString() === viewerId;
  if (obj.to && !viewerIsDebtor) delete obj.to.upiId;
  return obj;
}

async function fetchActive(groupId, viewerId) {
  const settlements = await Settlement.find({ group: groupId, status: { $in: ACTIVE_STATUSES } })
    .populate('from', 'name email')
    .populate('to', 'name email upiId')
    .sort({ amount: -1 });
  return settlements.map((s) => serialize(s, viewerId));
}

async function loadSettlement(req) {
  const { groupId, settlementId } = req.params;
  await assertMember(groupId, req.user.id);
  if (!mongoose.isValidObjectId(settlementId)) throw new AppError(404, 'Settlement not found');
  const settlement = await Settlement.findOne({ _id: settlementId, group: groupId });
  if (!settlement) throw new AppError(404, 'Settlement not found');
  return settlement;
}

// Manual recompute (the app now does this automatically after expense changes).
async function computeSettlements(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMember(groupId, req.user.id);
    await recomputeSettlements(groupId);
    res.status(201).json({ settlements: await fetchActive(groupId, req.user.id) });
  } catch (err) {
    next(err);
  }
}

async function listSettlements(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMember(groupId, req.user.id);
    res.json({ settlements: await fetchActive(groupId, req.user.id) });
  } catch (err) {
    next(err);
  }
}

// Debtor: "I've paid" (via UPI, cash, anything outside the app).
async function reportPayment(req, res, next) {
  try {
    const settlement = await loadSettlement(req);
    if (settlement.from.toString() !== req.user.id) {
      throw new AppError(403, 'Only the person who owes this amount can report a payment');
    }
    if (!['pending', 'processing'].includes(settlement.status)) {
      throw new AppError(409, 'This settlement can no longer be updated. Refresh the page.');
    }
    settlement.status = 'awaiting_confirmation';
    settlement.paymentMethod = 'manual';
    settlement.reportedAt = new Date();
    await settlement.save();
    res.json({ message: 'Payment reported. Waiting for confirmation.' });
  } catch (err) {
    next(err);
  }
}

// Creditor: confirms they received the money. Also works directly from
// 'pending' (e.g. they were paid in cash).
async function confirmPayment(req, res, next) {
  try {
    const settlement = await loadSettlement(req);
    if (settlement.to.toString() !== req.user.id) {
      throw new AppError(403, 'Only the person who is owed this amount can confirm receipt');
    }
    if (!['pending', 'processing', 'awaiting_confirmation'].includes(settlement.status)) {
      throw new AppError(409, 'This settlement can no longer be updated. Refresh the page.');
    }
    settlement.status = 'paid';
    settlement.paidAt = new Date();
    settlement.paymentMethod = settlement.paymentMethod || 'manual';
    await settlement.save();
    res.json({ message: 'Payment confirmed' });
  } catch (err) {
    next(err);
  }
}

// Creditor: "I didn't receive this". Back to pending.
async function rejectPayment(req, res, next) {
  try {
    const settlement = await loadSettlement(req);
    if (settlement.to.toString() !== req.user.id) {
      throw new AppError(403, 'Only the person who is owed this amount can reject a payment report');
    }
    if (settlement.status !== 'awaiting_confirmation') {
      throw new AppError(409, 'There is no payment report to reject');
    }
    settlement.status = 'pending';
    settlement.reportedAt = undefined;
    settlement.paymentMethod = undefined;
    await settlement.save();
    await safeRecompute(settlement.group);
    res.json({ message: 'Payment report rejected' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  computeSettlements,
  listSettlements,
  reportPayment,
  confirmPayment,
  rejectPayment,
};