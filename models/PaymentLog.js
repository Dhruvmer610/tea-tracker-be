import mongoose from "mongoose";

const paymentLogSchema = new mongoose.Schema(
  {
    entryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tea",
      required: true,
    },
    name: {
      type: String,
    },
    entryDate: {
      type: Date,
    },
    action: {
      type: String,
      enum: ["paid", "unpaid"],
    },
    changedBy: {
      type: String,
      default: "system",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

const PaymentLog = mongoose.model("PaymentLog", paymentLogSchema);

export default PaymentLog;