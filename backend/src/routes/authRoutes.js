const express = require('express');
const { z } = require('zod');
const { register, login, logout, me, updateProfile } = require('../controllers/authController');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().toLowerCase(),
  // Deliberately just a length floor, not a complexity regex
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

const profileSchema = z.object({
  upiId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{2,64}@[a-z]{2,32}$/, 'Enter a valid UPI ID, like name@bank')
    .or(z.literal(''))
    .optional(),
});

router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, validateBody(profileSchema), updateProfile);

module.exports = router;