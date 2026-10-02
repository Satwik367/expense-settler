const express = require('express');
const { z } = require('zod');
const { register, login, logout, me } = require('../controllers/authController');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().toLowerCase(),
  // Deliberately just a length floor, not a complexity regex - complexity
  // rules push users toward predictable patterns ("Password1!") more than
  // they improve real entropy. Length is the stronger signal.
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

module.exports = router;