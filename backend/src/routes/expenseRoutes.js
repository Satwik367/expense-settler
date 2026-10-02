const express = require('express');
const { z } = require('zod');
const { createExpense, listExpenses } = require('../controllers/expenseController');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

const objectIdString = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// participants shape differs slightly by splitType (custom needs `share`,
// percentage needs `percentage`, equal needs neither) - keep it loose here
// and let the controller's resolveShares() do the real validation.
const participantSchema = z.object({
  user: objectIdString,
  share: z.number().min(0).optional(),
  percentage: z.number().min(0).max(100).optional(),
});

const createExpenseSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  paidBy: objectIdString,
  splitType: z.enum(['equal', 'custom', 'percentage']),
  participants: z.array(participantSchema).min(1),
});

router.post('/', validateBody(createExpenseSchema), createExpense);
router.get('/', listExpenses);

module.exports = router;