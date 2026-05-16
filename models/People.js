import mongoose from "mongoose";

const peopleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      unique: true,       // ✅ this already creates an index on `name`
    },
    role: {
      type: String,
      trim: true,
      default: "employee",
    },
    drinkPreference: {
      type: String,
      enum: ["tea", "coffee", "both", "none"],
      default: "tea",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

const People = mongoose.model("People", peopleSchema);

export default People;