const Group = require('../models/Group');
const User = require('../models/User');
const { getOutstandingBalances } = require('../utils/balances');
const { AppError } = require('../middleware/errorHandler');

const EPSILON = 0.01;

async function createGroup(req, res, next) {
  try {
    const { name, memberEmails } = req.body;

    // The creator is added automatically and is the admin (createdBy).
    const members = new Set([req.user.id]);
    const unresolved = [];

    if (memberEmails?.length) {
      const users = await User.find({ email: { $in: memberEmails } });
      const foundEmails = new Set(users.map((u) => u.email));
      users.forEach((u) => members.add(u._id.toString()));
      memberEmails.forEach((e) => {
        if (!foundEmails.has(e)) unresolved.push(e);
      });
    }

    const group = await Group.create({
      name,
      members: Array.from(members),
      createdBy: req.user.id,
    });

    const populated = await group.populate('members', 'name email');
    res.status(201).json({ group: populated, unresolvedEmails: unresolved });
  } catch (err) {
    next(err);
  }
}

// Each group comes with the caller's own outstanding balance.
async function listMyGroups(req, res, next) {
  try {
    const groups = await Group.find({ members: req.user.id })
      .populate('members', 'name email')
      .sort({ updatedAt: -1 });

    const withBalances = await Promise.all(
      groups.map(async (g) => {
        const balances = await getOutstandingBalances(g._id);
        return { ...g.toJSON(), myBalance: balances.get(req.user.id) || 0 };
      })
    );

    res.json({ groups: withBalances });
  } catch (err) {
    next(err);
  }
}

async function getGroup(req, res, next) {
  try {
    const group = await Group.findById(req.params.groupId).populate('members', 'name email');
    if (!group) throw new AppError(404, 'Group not found');
    if (!group.members.some((m) => m._id.toString() === req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }
    res.json({ group });
  } catch (err) {
    next(err);
  }
}

// Net balance of every current member.
async function getBalances(req, res, next) {
  try {
    const group = await Group.findById(req.params.groupId).populate('members', 'name email');
    if (!group) throw new AppError(404, 'Group not found');
    if (!group.members.some((m) => m._id.toString() === req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }

    const balances = await getOutstandingBalances(group._id);
    res.json({
      balances: group.members.map((m) => ({
        user: { _id: m._id, name: m.name },
        amount: balances.get(m._id.toString()) || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function addMember(req, res, next) {
  try {
    const { email } = req.body;
    const group = await Group.findById(req.params.groupId);
    if (!group) throw new AppError(404, 'Group not found');
    if (!group.members.map(String).includes(req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }

    const user = await User.findOne({ email });
    if (!user) throw new AppError(404, 'No registered user with that email');

    if (group.members.map(String).includes(user._id.toString())) {
      throw new AppError(409, 'User is already a member of this group');
    }

    group.members.push(user._id);
    await group.save();

    const populated = await group.populate('members', 'name email');
    res.json({ group: populated });
  } catch (err) {
    next(err);
  }
}

// A member can leave only at a zero balance. The admin cannot leave.
async function leaveGroup(req, res, next) {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) throw new AppError(404, 'Group not found');
    if (!group.members.map(String).includes(req.user.id)) {
      throw new AppError(403, 'You are not a member of this group');
    }
    if (group.createdBy.toString() === req.user.id) {
      throw new AppError(400, 'The group admin cannot leave this group');
    }

    const balances = await getOutstandingBalances(group._id);
    const mine = balances.get(req.user.id) || 0;
    if (Math.abs(mine) > EPSILON) {
      throw new AppError(409, 'Settle your outstanding balance before leaving this group');
    }

    group.members.pull(req.user.id);
    await group.save();

    res.json({ message: 'You left the group' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createGroup, listMyGroups, getGroup, getBalances, addMember, leaveGroup };