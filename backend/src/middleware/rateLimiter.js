const rateLimit = require('express-rate-limit');

// Auth endpoints (login/register) are the classic brute-force target -
// keep the window tight and the ceiling low.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Payment-order creation hits an external API and, if left unbounded,
// is a way to rack up cost or spam a payment gateway - rate limit
// separately from general API traffic.
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PAYMENT_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Please slow down.' },
});

// General API traffic - generous, mostly a backstop against runaway clients/bots.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, paymentLimiter, generalLimiter };