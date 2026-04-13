import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Tea from "./models/Tea.js";

dotenv.config();

const app = express();
const PORT = 5000
const MONGO_URL="mongodb+srv://sujaltechnocomet_db_user:fWLJFAHaSXc9Nx15@cluster0.snx0qjb.mongodb.net/tea-tracker"
app.use(cors());
app.use(express.json());

// DB Connect
mongoose
  .connect(MONGO_URL)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log(err));

// Add Entry
app.post("/api/tea", async (req, res) => {
  try {
    const { name, teaCount } = req.body;

    const newTea = new Tea({
      name,
      teaCount,
      amount: teaCount * 10,
    });

    await newTea.save();
    res.json(newTea);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Entries
app.get("/api/tea", async (req, res) => {
  try {
    const data = await Tea.find().sort({ date: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Entry
app.delete("/api/tea/:id", async (req, res) => {
  try {
    await Tea.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`Server running on ${PORT}`)
);