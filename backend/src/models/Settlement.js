const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // debtor
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // creditor
    amount: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      // pending -> awaiting_confirmation (debtor says paid) -> paid (creditor confirms)
      // processing = a Razorpay card checkout was started
      enum: ['pending', 'processing', 'awaiting_confirmation', 'paid', 'stale'],
      default: 'pending',
      index: true,
    },
    paymentMethod: { type: String, enum: ['razorpay', 'manual'] },
    reportedAt: { type: Date },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String },
    paidAt: { type: Date, default: null },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

settlementSchema.index({ group: 1, status: 1 });

// Unique only when a real payment id exists.
settlementSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { razorpayPaymentId: { $type: 'string' } },
  }
);

module.exports = mongoose.model('Settlement', settlementSchema);