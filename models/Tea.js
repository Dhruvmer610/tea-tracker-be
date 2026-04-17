import mongoose from "mongoose";

const TeaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  teaCount: {
    type: Number,
    required: true,
  },
  drinkType: {
    type: String,
    enum: ["tea", "coffee"],
    default: "tea",
  },
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  paid: {
    type: Boolean,
    default: false,       // NEW: track payment status
  },
});

export default mongoose.model("Tea", TeaSchema);