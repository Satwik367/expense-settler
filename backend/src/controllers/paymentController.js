const Settlement = require('../models/Settlement');
const getRedis = require('../config/redis');
const { getRazorpayClient, verifyWebhookSignature, verifyPaymentSignature } = require('../utils/razorpay');
const { AppError } = require('../middleware/errorHandler');

/**
 * Creates a Razorpay order for a pending settlement. The order amount
 * is always read from the Settlement record in our own database - it
 * is NEVER accepted from the request body. If a client could pass its
 * own amount here, it could pay ₹1 for a ₹5000 debt and we'd have no
 * way to know the difference once the webhook confirms "payment succeeded".
 */
async function createOrder(req, res, next) {
  try {
    const { settlementId } = req.params;

    const settlement = await Settlement.findById(settlementId).populate('from to', 'name email');
    if (!settlement) throw new AppError(404, 'Settlement not found');
    if (!['pending', 'processing'].includes(settlement.status)) {
    throw new AppError(409, 'This settlement can no longer be paid. Refresh the page and try again.');
    }
    // Only the debtor can initiate payment for their own debt.
    if (settlement.from._id.toString() !== req.user.id) {
      throw new AppError(403, 'Only the person who owes this amount can initiate payment');
    }

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: Math.round(settlement.amount * 100), // Razorpay expects paise, not rupees
      currency: 'INR',
      receipt: settlement._id.toString(),
      notes: {
        settlementId: settlement._id.toString(),
        from: settlement.from.email,
        to: settlement.to.email,
      },
    });

    settlement.razorpayOrderId = order.id;
    settlement.status = 'processing';
    await settlement.save();

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // safe to expose - this is the public key
      settlement: {
        id: settlement._id,
        payTo: settlement.to.name,
        amount: settlement.amount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles Razorpay's server-to-server webhook. This is the ONLY event
 * that actually marks a settlement as paid - the frontend's immediate
 * post-checkout callback is a nice UX nicety but is never trusted on
 * its own, since a client-side response can be spoofed or simply never
 * arrive (closed tab, network drop).
 *
 * Must be mounted with express.raw() BEFORE the global express.json()
 * middleware - signature verification requires the exact raw bytes
 * Razorpay signed, not a re-serialized copy.
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const isValid = verifyWebhookSignature(
      req.body, // raw Buffer, thanks to express.raw()
      signature,
      process.env.RAZORPAY_WEBHOOK_SECRET
    );

    if (!isValid) {
      console.warn('[webhook] rejected - invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    const event = payload.event;

    if (event !== 'payment.captured') {
      return res.status(200).json({ received: true, ignored: event });
    }

    const paymentEntity = payload.payload.payment.entity;
    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;

    // Idempotency: Razorpay can and does redeliver webhooks. Use Redis
    // as a fast dedupe lock keyed on payment id; even if that lock
    // fails or expires, the unique index on Settlement.razorpayPaymentId
    // is the real backstop that prevents double-processing at the DB level.
    let alreadyProcessing = false;
    try {
      const redis = getRedis();
      const lockKey = `webhook:lock:${paymentId}`;
      const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 300);
      alreadyProcessing = acquired === null;
    } catch (lockErr) {
      console.warn('[webhook] redis lock unavailable, relying on DB unique index:', lockErr.message);
    }

    if (alreadyProcessing) {
      return res.status(200).json({ received: true, deduped: true });
    }

    const settlement = await Settlement.findOne({ razorpayOrderId: orderId });
    if (!settlement) {
      console.error(`[webhook] no settlement found for order ${orderId}`);
      return res.status(200).json({ received: true, matched: false });
    }

    if (settlement.status === 'paid') {
      return res.status(200).json({ received: true, alreadyPaid: true });
    }

    settlement.status = 'paid';
    settlement.razorpayPaymentId = paymentId;
    settlement.paidAt = new Date();

    try {
      await settlement.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return res.status(200).json({ received: true, deduped: true });
      }
      throw saveErr;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Optional immediate UX check right after Razorpay's client-side
 * checkout succeeds - lets the frontend show "Payment successful!"
 * without waiting for the webhook round trip. This NEVER writes
 * settlement status itself - only the webhook does that.
 */
async function verifyClientCallback(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const valid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!valid) {
      return res.status(400).json({ verified: false });
    }

    res.json({ verified: true, message: 'Payment recognized, awaiting final confirmation.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, handleWebhook, verifyClientCallback };