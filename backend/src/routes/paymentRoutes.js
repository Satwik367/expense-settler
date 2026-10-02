const express = require('express');
const { z } = require('zod');
const { createOrder, verifyClientCallback } = require('../controllers/paymentController');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(requireAuth);

router.post('/create-order/:settlementId', paymentLimiter, createOrder);

const callbackSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

router.post('/verify-callback', validateBody(callbackSchema), verifyClientCallback);

module.exports = router;