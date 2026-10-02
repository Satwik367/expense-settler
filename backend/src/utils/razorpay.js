const Razorpay = require('razorpay');
const crypto = require('crypto');

let instance = null;

function getRazorpayClient() {
  if (instance) return instance;
  instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return instance;
}

/**
 * Verifies that a webhook payload actually came from Razorpay by
 * recomputing the HMAC-SHA256 signature over the raw request body
 * using the webhook secret, and comparing it to the signature Razorpay
 * sent in the `X-Razorpay-Signature` header.
 *
 * This MUST be run against the raw, unparsed request body - not a
 * re-serialized JSON object - because any difference in whitespace or
 * key ordering will produce a different signature and either falsely
 * reject legitimate webhooks or (worse, if you skip verification
 * entirely) accept forged ones. This is the single most commonly
 * skipped security step in student payment integrations.
 *
 * Uses a timing-safe comparison so response time can't be used to
 * leak information about how much of the signature was correct.
 *
 * @param {Buffer|string} rawBody - the unmodified request body
 * @param {string} signatureHeader - value of X-Razorpay-Signature
 * @param {string} webhookSecret
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Verifies the signature Razorpay returns after a successful checkout
 * on the frontend (order_id|payment_id signed with the KEY SECRET, not
 * the webhook secret - these are two different verification paths for
 * two different events, and the webhook is the one that's actually
 * trustworthy since it comes server-to-server. This one is a
 * defense-in-depth check on the client's immediate callback, never a
 * substitute for waiting on the webhook to actually mark something paid).
 */
function verifyPaymentSignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signature || '', 'utf8');

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

module.exports = { getRazorpayClient, verifyWebhookSignature, verifyPaymentSignature };