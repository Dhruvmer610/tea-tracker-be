import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URL = process.env.MONGO_URL

app.use(cors());
app.use(express.json());

/* ─── Mongoose Connection ─── */
mongoose
  .connect(MONGO_URL)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.error("MongoDB error:", err));

/* ─── Prices ─── */
const PRICES = { tea: 10, coffee: 20 };

/* ─── Helper: get UTC day range ─── */
const getDayRange = (dateInput) => {
  // Accept ISO string or Date object
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
};

/* ─── Tea Schema ─── */
const teaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    teaCount: { type: Number, required: true, min: 1, default: 1 },
    drinkType: { type: String, enum: ["tea", "coffee"], default: "tea" },
    amount: { type: Number, required: true },
    date: { type: Date, required: true, default: Date.now },
    paid: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index: unique name+drinkType per day (enforced at app level, not DB level, to allow IST flexibility)
teaSchema.index({ name: 1, drinkType: 1, date: 1 });

const Tea = mongoose.model("Tea", teaSchema);

/* ─── PaymentLog Schema ─── */
const paymentLogSchema = new mongoose.Schema(
  {
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: "Tea", required: true },
    name: String,
    entryDate: Date,
    action: { type: String, enum: ["paid", "unpaid"] },
    changedBy: { type: String, default: "system" },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const PaymentLog = mongoose.model("PaymentLog", paymentLogSchema);

/* ══════════════════════════════════════
   ROUTES
══════════════════════════════════════ */

/* ── GET all entries ── */
app.get("/api/tea", async (req, res) => {
  try {
    const data = await Tea.find().sort({ date: -1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST new entry ── */
app.post("/api/tea", async (req, res) => {
  try {
    const { name, teaCount, drinkType = "tea", date } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!teaCount || teaCount < 1) return res.status(400).json({ error: "teaCount must be ≥ 1" });

    const entryDate = date ? new Date(date) : new Date();
    const price = PRICES[drinkType] || PRICES.tea;
    const { start, end } = getDayRange(entryDate);

    // Duplicate check: same name + same drinkType on same day
    const existing = await Tea.findOne({
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      drinkType,
      date: { $gte: start, $lte: end },
    });

    if (existing) {
      return res.status(400).json({
        error: `A ${drinkType} entry for "${name.trim()}" already exists on this date. Edit the existing entry instead.`,
      });
    }

    const newEntry = new Tea({
      name: name.trim(),
      teaCount: Number(teaCount),
      drinkType,
      amount: Number(teaCount) * price,
      date: entryDate,
      paid: false,
    });

    await newEntry.save();
    res.status(201).json(newEntry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT update entry ── */
app.put("/api/tea/:id", async (req, res) => {
  try {
    const { name, teaCount, drinkType = "tea" } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!teaCount || teaCount < 1) return res.status(400).json({ error: "teaCount must be ≥ 1" });

    const existing = await Tea.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Entry not found" });

    const price = PRICES[drinkType] || PRICES.tea;
    const entryDate = existing.date;
    const { start, end } = getDayRange(entryDate);

    // Check duplicate only if name OR drinkType changed
    const nameChanged = existing.name.toLowerCase() !== name.trim().toLowerCase();
    const drinkChanged = existing.drinkType !== drinkType;

    if (nameChanged || drinkChanged) {
      const duplicate = await Tea.findOne({
        name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        drinkType,
        date: { $gte: start, $lte: end },
        _id: { $ne: req.params.id },
      });
      if (duplicate) {
        return res.status(400).json({
          error: `A ${drinkType} entry for "${name.trim()}" already exists on this date.`,
        });
      }
    }

    // IMPORTANT: preserve `paid` status — only update name, teaCount, drinkType, amount
    const updated = await Tea.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        teaCount: Number(teaCount),
        drinkType,
        amount: Number(teaCount) * price,
        // `paid` is NOT touched here — it is updated only via /pay endpoint
      },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE entry ── */
app.delete("/api/tea/:id", async (req, res) => {
  try {
    const deleted = await Tea.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Entry not found" });
    await PaymentLog.deleteMany({ entryId: req.params.id });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PATCH toggle payment + log ── */
app.patch("/api/tea/:id/pay", async (req, res) => {
  try {
    const { paid, changedBy = "system" } = req.body;

    const entry = await Tea.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    // Determine new paid status: use explicit value from body, or toggle
    const newPaidStatus = paid !== undefined ? Boolean(paid) : !entry.paid;

    // No-op if already in that state
    if (entry.paid === newPaidStatus) {
      return res.json(entry);
    }

    entry.paid = newPaidStatus;
    await entry.save();

    // Log the change
    await PaymentLog.create({
      entryId: entry._id,
      name: entry.name,
      entryDate: entry.date,
      action: newPaidStatus ? "paid" : "unpaid",
      changedBy,
    });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET payment logs ── */
app.get("/api/payment-logs", async (req, res) => {
  try {
    const { entryId, name } = req.query;
    const filter = {};
    if (entryId) filter.entryId = entryId;
    if (name) filter.name = { $regex: new RegExp(name, "i") };
    const logs = await PaymentLog.find(filter).sort({ timestamp: -1 }).lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET summary stats ── */
app.get("/api/stats", async (req, res) => {
  try {
    const entries = await Tea.find().lean();
    const today = new Date();
    const { start, end } = getDayRange(today);
    const todayEntries = entries.filter(e => e.date >= start && e.date <= end);

    const calc = (list) => {
      let tea = 0, coffee = 0, amount = 0, paid = 0;
      const people = new Set();
      list.forEach(e => {
        if (e.drinkType === "coffee") coffee += e.teaCount;
        else tea += e.teaCount;
        const amt = e.teaCount * (PRICES[e.drinkType] || PRICES.tea);
        amount += amt;
        if (e.paid) paid += amt;
        people.add(e.name.toLowerCase().trim());
      });
      return { tea, coffee, amount, paid, pending: amount - paid, people: people.size };
    };

    res.json({
      today: calc(todayEntries),
      allTime: calc(entries),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Health check ── */
app.get("/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
