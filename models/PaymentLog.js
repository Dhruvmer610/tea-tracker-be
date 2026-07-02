import mongoose from "mongoose";

const PaymentLogSchema = new mongoose.Schema({
  entryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tea",
    default: null,  // null for bulk operations
  },
  name: {
    type: String,
    required: true,
  },
  entryDate: {
    type: Date,
    default: Date.now,
  },
  action: {
    type: String,
    required: true,
    enum: ["paid", "unpaid", "created", "edited", "deleted", "bulk_paid"],
  },
  changedBy: {
    type: String,
    default: "system",
  },
  details: {
    type: String,
    default: "",
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("PaymentLog", PaymentLogSchema);