const Expense = require('../models/Expense');
const Group = require('../models/Group');
const Settlement = require('../models/Settlement');
const getRedis = require('../config/redis');
const { computeMinimalSettlements } = require('../utils/settlementAlgorithm');
const { AppError } = require('../middleware/errorHandler');

const CACHE_TTL_SECONDS = 60; // short TTL - balances change any time a new expense is added

function cacheKey(groupId) {
  return `settlements:${groupId}`;
}

/**
 * Recomputes the minimal settlement set for a group from scratch and
 * persists it, superseding any previous *unpaid* settlements. Paid
 * settlements are left untouched - a recompute should never erase the
 * record of money that already changed hands.
 */
async function computeSettlements(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) throw new AppError(404, 'Group not found');
    if (!group.members.map(String).includes(req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }

    const expenses = await Expense.find({ group: groupId });
    const minimalTransactions = computeMinimalSettlements(expenses);

    // Net out already-paid settlements so recompute doesn't ask someone
    // to pay again for a debt already cleared.
    const paidSettlements = await Settlement.find({ group: groupId, status: 'paid' });
    const paidMap = new Map(); // key: `${from}->${to}` => amount already paid
    for (const s of paidSettlements) {
      const key = `${s.from}->${s.to}`;
      paidMap.set(key, (paidMap.get(key) || 0) + s.amount);
    }

    const adjusted = minimalTransactions
      .map((t) => {
        const key = `${t.from}->${t.to}`;
        const alreadyPaid = paidMap.get(key) || 0;
        const remaining = Math.round((t.amount - alreadyPaid) * 100) / 100;
        return { ...t, amount: remaining };
      })
      .filter((t) => t.amount > 0.01);

    // Mark previous pending/processing settlements as stale rather than
    // deleting them - keeps an audit trail of how the graph evolved.
    await Settlement.updateMany(
      { group: groupId, status: { $in: ['pending', 'processing'] } },
      { $set: { status: 'stale' } }
    );

    const computedAt = new Date();
    const created = await Settlement.insertMany(
      adjusted.map((t) => ({
        group: groupId,
        from: t.from,
        to: t.to,
        amount: t.amount,
        status: 'pending',
        computedAt,
      }))
    );

    // Best-effort cache invalidation/refresh - failures here must never
    // block the response, MongoDB is the source of truth.
    try {
      const redis = getRedis();
      await redis.set(cacheKey(groupId), JSON.stringify(created), 'EX', CACHE_TTL_SECONDS);
    } catch (cacheErr) {
      console.warn('[settlements] cache write failed (non-fatal):', cacheErr.message);
    }

    const populated = await Settlement.find({ _id: { $in: created.map((c) => c._id) } })
      .populate('from', 'name email')
      .populate('to', 'name email');

    res.status(201).json({ settlements: populated });
  } catch (err) {
    next(err);
  }
}

async function listSettlements(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) throw new AppError(404, 'Group not found');
    if (!group.members.map(String).includes(req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }

    // Try cache first for the common "just computed it, immediately
    // reloading the page" path; fall through to Mongo on any cache miss/error.
    try {
      const redis = getRedis();
      const cached = await redis.get(cacheKey(groupId));
      if (cached) {
        const parsed = JSON.parse(cached);
        const stillPendingCount = await Settlement.countDocuments({
          group: groupId,
          status: 'pending',
        });
        if (stillPendingCount === parsed.length) {
          return res.json({ settlements: parsed, source: 'cache' });
        }
      }
    } catch (cacheErr) {
      console.warn('[settlements] cache read failed (non-fatal):', cacheErr.message);
    }

    const settlements = await Settlement.find({ group: groupId, status: 'pending' })
      .populate('from', 'name email')
      .populate('to', 'name email')
      .sort({ amount: -1 });

    res.json({ settlements, source: 'db' });
  } catch (err) {
    next(err);
  }
}

module.exports = { computeSettlements, listSettlements };