const Expense = require('../models/Expense');
const Group = require('../models/Group');
const { AppError } = require('../middleware/errorHandler');

const EPSILON = 0.01;

/**
 * Resolves whatever split shape the client sent into a concrete list
 * of {user, share} amounts that always sum to the expense total.
 * Keeping this resolution server-side (never trusting a client-computed
 * share) is deliberate - a client could otherwise submit an expense
 * where the shares don't add up to the amount, silently corrupting
 * every balance calculation downstream.
 */
function resolveShares({ splitType, amount, participants }) {
  if (splitType === 'equal') {
    const userIds = participants.map((p) => p.user);
    const n = userIds.length;
    const base = Math.floor((amount / n) * 100) / 100;
    const shares = userIds.map((user) => ({ user, share: base }));
    // Distribute the leftover paise/cents from rounding onto the first
    // participant so the total always matches `amount` exactly.
    const distributed = base * n;
    const remainder = Math.round((amount - distributed) * 100) / 100;
    shares[0].share = Math.round((shares[0].share + remainder) * 100) / 100;
    return shares;
  }

  if (splitType === 'custom') {
    // participants already carry explicit `share` amounts - just validate they sum correctly.
    const total = participants.reduce((sum, p) => sum + p.share, 0);
    if (Math.abs(total - amount) > EPSILON) {
      throw new AppError(
        400,
        `Custom shares sum to ${total.toFixed(2)} but the expense amount is ${amount.toFixed(2)}`
      );
    }
    return participants.map((p) => ({ user: p.user, share: Math.round(p.share * 100) / 100 }));
  }

  if (splitType === 'percentage') {
    const totalPct = participants.reduce((sum, p) => sum + p.percentage, 0);
    if (Math.abs(totalPct - 100) > EPSILON) {
      throw new AppError(400, `Percentages sum to ${totalPct}% but must sum to 100%`);
    }
    return participants.map((p) => ({
      user: p.user,
      share: Math.round(amount * (p.percentage / 100) * 100) / 100,
    }));
  }

  throw new AppError(400, `Unsupported splitType: ${splitType}`);
}

async function createExpense(req, res, next) {
  try {
    const { groupId } = req.params;
    const { description, amount, paidBy, splitType, participants } = req.body;

    const group = await Group.findById(groupId);
    if (!group) throw new AppError(404, 'Group not found');

    const memberIds = group.members.map(String);
    if (!memberIds.includes(req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }
    if (!memberIds.includes(paidBy)) {
      throw new AppError(400, 'paidBy must be a member of this group');
    }
    for (const p of participants) {
      if (!memberIds.includes(p.user)) {
        throw new AppError(400, `Participant ${p.user} is not a member of this group`);
      }
    }

    const resolvedParticipants = resolveShares({ splitType, amount, participants });

    const expense = await Expense.create({
      group: groupId,
      description,
      amount,
      paidBy,
      splitType,
      participants: resolvedParticipants,
      createdBy: req.user.id,
    });

    const populated = await expense.populate([
      { path: 'paidBy', select: 'name email' },
      { path: 'participants.user', select: 'name email' },
    ]);

    res.status(201).json({ expense: populated });
  } catch (err) {
    next(err);
  }
}

async function listExpenses(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) throw new AppError(404, 'Group not found');
    if (!group.members.map(String).includes(req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }

    const expenses = await Expense.find({ group: groupId })
      .populate('paidBy', 'name email')
      .populate('participants.user', 'name email')
      .sort({ createdAt: -1 });

    res.json({ expenses });
  } catch (err) {
    next(err);
  }
}

module.exports = { createExpense, listExpenses, resolveShares };