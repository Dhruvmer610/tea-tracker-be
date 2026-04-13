import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Tea from "./models/Tea.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// DB Connect
mongoose
  .connect(process.env.MONGO_URL)
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

app.listen(process.env.PORT, () =>
  console.log(`Server running on ${process.env.PORT}`)
);