import mongoose from "mongoose";

const teaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    teaCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
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
      required: true,
      default: Date.now,
    },
    paid: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

teaSchema.index({ name: 1, drinkType: 1, date: 1 });

const Tea = mongoose.model("Tea", teaSchema);

export default Tea;