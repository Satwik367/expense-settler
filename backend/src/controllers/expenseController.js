const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const { safeRecompute } = require('../utils/settlementService');
const { AppError } = require('../middleware/errorHandler');

const EPSILON = 0.01;
const round2 = (n) => Math.round(n * 100) / 100;

// Rounding can leave shares a cent or two off the total. Put the leftover
// on the largest share so the shares always add up to the amount exactly.
function reconcile(shares, amount) {
  const sum = shares.reduce((s, p) => s + p.share, 0);
  const diff = round2(amount - sum);
  if (diff !== 0) {
    const target = shares.reduce((a, b) => (b.share > a.share ? b : a));
    target.share = round2(target.share + diff);
  }
  return shares;
}

/**
 * Resolves whatever split shape the client sent into concrete {user, share}
 * amounts that always sum to the expense total. Done server-side so a client
 * can never submit shares that don't add up.
 */
function resolveShares({ splitType, amount, participants }) {
  if (splitType === 'equal') {
    const each = Math.floor((amount * 100) / participants.length) / 100;
    return reconcile(participants.map((p) => ({ user: p.user, share: each })), amount);
  }

  if (splitType === 'custom') {
    if (participants.some((p) => typeof p.share !== 'number')) {
      throw new AppError(400, 'Every participant needs a share amount');
    }
    const total = participants.reduce((sum, p) => sum + p.share, 0);
    if (Math.abs(total - amount) > EPSILON) {
      throw new AppError(
        400,
        `Custom shares sum to ${total.toFixed(2)} but the expense amount is ${amount.toFixed(2)}`
      );
    }
    return reconcile(participants.map((p) => ({ user: p.user, share: round2(p.share) })), amount);
  }

  if (splitType === 'percentage') {
    if (participants.some((p) => typeof p.percentage !== 'number')) {
      throw new AppError(400, 'Every participant needs a percentage');
    }
    const totalPct = participants.reduce((sum, p) => sum + p.percentage, 0);
    if (Math.abs(totalPct - 100) > EPSILON) {
      throw new AppError(400, `Percentages sum to ${totalPct}% but must sum to 100%`);
    }
    return reconcile(
      participants.map((p) => ({ user: p.user, share: round2((amount * p.percentage) / 100) })),
      amount
    );
  }

  throw new AppError(400, `Unsupported splitType: ${splitType}`);
}

async function loadGroupForMember(groupId, userId) {
  if (!mongoose.isValidObjectId(groupId)) throw new AppError(404, 'Group not found');
  const group = await Group.findById(groupId);
  if (!group) throw new AppError(404, 'Group not found');
  if (!group.members.map(String).includes(userId)) {
    throw new AppError(403, 'You are not a member of this group');
  }
  return group;
}

async function findActiveExpense(groupId, expenseId) {
  if (!mongoose.isValidObjectId(expenseId)) throw new AppError(404, 'Expense not found');
  const expense = await Expense.findOne({ _id: expenseId, group: groupId, deletedAt: null });
  if (!expense) throw new AppError(404, 'Expense not found');
  return expense;
}

// Only whoever added the expense, or the group admin, may change it.
function assertCanModify(expense, group, userId) {
  const isCreator = expense.createdBy.toString() === userId;
  const isAdmin = group.createdBy.toString() === userId;
  if (!isCreator && !isAdmin) {
    throw new AppError(403, 'Only the person who added this expense or the group admin can change it');
  }
}

// Shared by create and update: validates membership and resolves shares.
function buildExpenseFields(group, body) {
  const { description, amount, splitType } = body;
  const paidBy = body.paidBy.toLowerCase();
  const participants = body.participants.map((p) => ({ ...p, user: p.user.toLowerCase() }));

  const memberIds = group.members.map(String);
  if (!memberIds.includes(paidBy)) {
    throw new AppError(400, 'paidBy must be a member of this group');
  }

  const ids = participants.map((p) => p.user);
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, 'Each participant can only appear once');
  }
  if (ids.some((id) => !memberIds.includes(id))) {
    throw new AppError(400, 'Every participant must be a member of this group');
  }

  return {
    description,
    amount,
    paidBy,
    splitType,
    participants: resolveShares({ splitType, amount, participants }),
  };
}

const populateExpense = (expense) =>
  expense.populate([
    { path: 'paidBy', select: 'name email' },
    { path: 'participants.user', select: 'name email' },
  ]);

async function createExpense(req, res, next) {
  try {
    const group = await loadGroupForMember(req.params.groupId, req.user.id);
    const fields = buildExpenseFields(group, req.body);

    const expense = await Expense.create({
      ...fields,
      group: group._id,
      createdBy: req.user.id,
    });

    await safeRecompute(group._id);
    res.status(201).json({ expense: await populateExpense(expense) });
  } catch (err) {
    next(err);
  }
}

async function updateExpense(req, res, next) {
  try {
    const group = await loadGroupForMember(req.params.groupId, req.user.id);
    const expense = await findActiveExpense(group._id, req.params.expenseId);
    assertCanModify(expense, group, req.user.id);

    expense.set(buildExpenseFields(group, req.body));
    await expense.save();

    await safeRecompute(group._id);
    res.json({ expense: await populateExpense(expense) });
  } catch (err) {
    next(err);
  }
}

// Soft delete: the record stays for history but no longer counts.
async function deleteExpense(req, res, next) {
  try {
    const group = await loadGroupForMember(req.params.groupId, req.user.id);
    const expense = await findActiveExpense(group._id, req.params.expenseId);
    assertCanModify(expense, group, req.user.id);

    expense.deletedAt = new Date();
    expense.deletedBy = req.user.id;
    await expense.save();

    await safeRecompute(group._id);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    next(err);
  }
}

async function listExpenses(req, res, next) {
  try {
    const group = await loadGroupForMember(req.params.groupId, req.user.id);
    const expenses = await Expense.find({ group: group._id, deletedAt: null })
      .populate('paidBy', 'name email')
      .populate('participants.user', 'name email')
      .sort({ createdAt: -1 });
    res.json({ expenses });
  } catch (err) {
    next(err);
  }
}

module.exports = { createExpense, updateExpense, deleteExpense, listExpenses, resolveShares };