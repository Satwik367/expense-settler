const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    from: {
      // the debtor - the person who needs to pay
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    to: {
      // the creditor - the person who should receive money
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'stale'],
      default: 'pending',
      index: true,
    },
    // Populated once a Razorpay order is created for this settlement
    razorpayOrderId: {
      type: String,
      default: null,
      index: true,
    },
    // Populated once the webhook confirms payment
    razorpayPaymentId: {
      type: String,
      default: null,
      unique: true,
      sparse: true, // allows many nulls, but no two settlements can share a real payment id
    },
    paidAt: {
      type: Date,
      default: null,
    },
    // Which "settlement run" this belongs to - lets us tell current
    // pending settlements apart from ones superseded by a recompute
    computedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

settlementSchema.index({ group: 1, status: 1 });

module.exports = mongoose.model('Settlement', settlementSchema);