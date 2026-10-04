const express = require('express');
const { z } = require('zod');
const {
  createExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
} = require('../controllers/expenseController');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

const objectIdString = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// share / percentage depend on splitType, so the controller validates those.
const participantSchema = z.object({
  user: objectIdString,
  share: z.number().min(0).optional(),
  percentage: z.number().min(0).max(100).optional(),
});

const expenseSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(10000000),
  paidBy: objectIdString,
  splitType: z.enum(['equal', 'custom', 'percentage']),
  participants: z.array(participantSchema).min(1),
});

router.post('/', validateBody(expenseSchema), createExpense);
router.get('/', listExpenses);
router.put('/:expenseId', validateBody(expenseSchema), updateExpense);
router.delete('/:expenseId', deleteExpense);

module.exports = router;