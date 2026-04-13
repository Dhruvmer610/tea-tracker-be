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
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Tea", TeaSchema);