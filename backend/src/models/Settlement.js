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
      enum: ['pending', 'awaiting_confirmation', 'paid', 'stale'],
      default: 'pending',
      index: true,
    },
    paymentMethod: { type: String, enum: ['manual'] },
    reportedAt: { type: Date },
    paidAt: { type: Date, default: null },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

settlementSchema.index({ group: 1, status: 1 });

module.exports = mongoose.model('Settlement', settlementSchema);