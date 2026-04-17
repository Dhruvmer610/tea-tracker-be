import mongoose from "mongoose";

const PaymentLogSchema = new mongoose.Schema({
  entryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tea",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  entryDate: {
    type: Date,
    required: true,
  },
  action: {
    type: String,
    enum: ["paid", "unpaid"],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  changedBy: {
    type: String,
    default: "system",
  },
});

export default mongoose.model("PaymentLog", PaymentLogSchema);