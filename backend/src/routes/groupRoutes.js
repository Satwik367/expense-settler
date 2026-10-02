const express = require('express');
const { z } = require('zod');
const { createGroup, listMyGroups, getGroup, addMember } = require('../controllers/groupController');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  memberEmails: z.array(z.string().trim().email().toLowerCase()).max(50).optional().default([]),
});

const addMemberSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

router.post('/', validateBody(createGroupSchema), createGroup);
router.get('/', listMyGroups);
router.get('/:groupId', getGroup);
router.post('/:groupId/members', validateBody(addMemberSchema), addMember);

module.exports = router;