import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import People from "./models/People.js";
import Tea from "./models/Tea.js";
import PaymentLog from "./models/PaymentLog.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  console.error("❌ MONGO_URL is not defined in .env file");
  process.exit(1);
}

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
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
};

/* ─── Helper: upsert person into People collection ─── */
const upsertPerson = async (name) => {
  try {
    const result = await People.findOneAndUpdate(
      {
        name: {
          $regex: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        },
      },
      {
        $setOnInsert: {
          name: name,
          role: "employee",
          drinkPreference: "tea",
          isActive: true,
          phone: "",
          notes: "",
        },
      },
      { upsert: true, new: true }
    );
    return result;
  } catch (err) {
    console.warn("upsertPerson warning:", err.message);
  }
};

/* ══════════════════════════════════════
   PEOPLE ROUTES
══════════════════════════════════════ */

app.get("/api/people", async (req, res) => {
  try {
    const { isActive, role, search } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (role) filter.role = { $regex: new RegExp(role, "i") };
    if (search) filter.name = { $regex: new RegExp(search, "i") };
    const people = await People.find(filter).sort({ name: 1 }).lean();
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/people/:id", async (req, res) => {
  try {
    const person = await People.findById(req.params.id).lean();
    if (!person) return res.status(404).json({ error: "Person not found" });
    res.json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/people", async (req, res) => {
  try {
    const { name, role, drinkPreference, phone, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const duplicate = await People.findOne({
      name: {
        $regex: new RegExp(
          `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
      },
    });
    if (duplicate) return res.status(400).json({ error: `"${name.trim()}" already exists.` });

    const person = new People({
      name: name.trim(),
      role: role?.trim() || "employee",
      drinkPreference: drinkPreference || "tea",
      phone: phone?.trim() || "",
      notes: notes?.trim() || "",
    });
    await person.save();
    res.status(201).json(person);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Name must be unique" });
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/people/:id", async (req, res) => {
  try {
    const { name, role, drinkPreference, phone, notes, isActive } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const person = await People.findById(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });

    const nameChanged = person.name.toLowerCase() !== name.trim().toLowerCase();
    if (nameChanged) {
      const duplicate = await People.findOne({
        name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        _id: { $ne: req.params.id },
      });
      if (duplicate) return res.status(400).json({ error: `"${name.trim()}" already exists.` });
    }

    const updated = await People.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        role: role?.trim() || person.role,
        drinkPreference: drinkPreference || person.drinkPreference,
        phone: phone?.trim() ?? person.phone,
        notes: notes?.trim() ?? person.notes,
        isActive: isActive !== undefined ? Boolean(isActive) : person.isActive,
      },
      { new: true, runValidators: true }
    );
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Name must be unique" });
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/people/:id/toggle-active", async (req, res) => {
  try {
    const person = await People.findById(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });
    person.isActive = !person.isActive;
    await person.save();
    res.json({ message: `${person.name} is now ${person.isActive ? "active" : "inactive"}`, person });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/people/:id", async (req, res) => {
  try {
    const person = await People.findByIdAndDelete(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });
    res.json({ message: `"${person.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/people/:id/history", async (req, res) => {
  try {
    const person = await People.findById(req.params.id).lean();
    if (!person) return res.status(404).json({ error: "Person not found" });

    const entries = await Tea.find({
      name: { $regex: new RegExp(`^${person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).sort({ date: -1 }).lean();

    const summary = entries.reduce(
      (acc, e) => {
        const amt = e.teaCount * (PRICES[e.drinkType] || PRICES.tea);
        acc.totalAmount += amt;
        if (e.paid) acc.paidAmount += amt;
        if (e.drinkType === "coffee") acc.coffeeCount += e.teaCount;
        else acc.teaCount += e.teaCount;
        return acc;
      },
      { totalAmount: 0, paidAmount: 0, teaCount: 0, coffeeCount: 0 }
    );
    summary.pendingAmount = summary.totalAmount - summary.paidAmount;
    res.json({ person, entries, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   TEA ROUTES
══════════════════════════════════════ */

app.get("/api/tea", async (req, res) => {
  try {
    const data = await Tea.find().sort({ date: -1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST new entry → ALLOWS multiple entries per person per day ── */
app.post("/api/tea", async (req, res) => {
  try {
    const { name, teaCount, drinkType = "tea", date, allowDuplicate = false } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!teaCount || teaCount < 1) return res.status(400).json({ error: "teaCount must be ≥ 1" });

    const entryDate = date ? new Date(date) : new Date();
    const price = PRICES[drinkType] || PRICES.tea;

    // Only check for duplicates if allowDuplicate is false (for today's regular entries)
    if (!allowDuplicate) {
      const { start, end } = getDayRange(entryDate);
      const existing = await Tea.findOne({
        name: {
          $regex: new RegExp(
            `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        },
        drinkType,
        date: { $gte: start, $lte: end },
      });

      if (existing) {
        return res.status(400).json({
          error: `A ${drinkType} entry for "${name.trim()}" already exists on this date. Use 'Add Previous Entry' for multiple entries.`,
        });
      }
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
    await upsertPerson(name.trim());

    // Log creation
    await PaymentLog.create({
      entryId: newEntry._id,
      name: newEntry.name,
      entryDate: newEntry.date,
      action: "created",
      changedBy: "user",
      details: `Added ${teaCount} ${drinkType}(s) — ${formatAmount(Number(teaCount) * price)}`,
    });

    res.status(201).json(newEntry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatAmount(n) {
  return "₹" + n.toLocaleString("en-IN");
}

app.put("/api/tea/:id", async (req, res) => {
  try {
    const { name, teaCount, drinkType = "tea" } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!teaCount || teaCount < 1) return res.status(400).json({ error: "teaCount must be ≥ 1" });

    const existing = await Tea.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Entry not found" });

    const price = PRICES[drinkType] || PRICES.tea;
    const { start, end } = getDayRange(existing.date);
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
        return res.status(400).json({ error: `A ${drinkType} entry for "${name.trim()}" already exists on this date.` });
      }
    }

    const oldCount = existing.teaCount;
    const oldDrink = existing.drinkType;

    const updated = await Tea.findByIdAndUpdate(
      req.params.id,
      { name: name.trim(), teaCount: Number(teaCount), drinkType, amount: Number(teaCount) * price },
      { new: true }
    );

    if (nameChanged) await upsertPerson(name.trim());

    // Log edit
    await PaymentLog.create({
      entryId: updated._id,
      name: updated.name,
      entryDate: updated.date,
      action: "edited",
      changedBy: "user",
      details: `Changed from ${oldCount} ${oldDrink}(s) to ${teaCount} ${drinkType}(s)`,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE entry with logging ── */
app.delete("/api/tea/:id", async (req, res) => {
  try {
    const entry = await Tea.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    // Log deletion BEFORE deleting
    await PaymentLog.create({
      entryId: entry._id,
      name: entry.name,
      entryDate: entry.date,
      action: "deleted",
      changedBy: req.body?.changedBy || "user",
      details: `Deleted ${entry.teaCount} ${entry.drinkType}(s) — ${formatAmount(entry.amount)} — ${entry.paid ? "was paid" : "was pending"}`,
    });

    await Tea.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully", deletedEntry: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PATCH toggle payment ── */
app.patch("/api/tea/:id/pay", async (req, res) => {
  try {
    const { paid, changedBy = "system" } = req.body;
    const entry = await Tea.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    const newPaidStatus = paid !== undefined ? Boolean(paid) : !entry.paid;
    if (entry.paid === newPaidStatus) return res.json(entry);

    entry.paid = newPaidStatus;
    await entry.save();

    await PaymentLog.create({
      entryId: entry._id,
      name: entry.name,
      entryDate: entry.date,
      action: newPaidStatus ? "paid" : "unpaid",
      changedBy,
      details: `${entry.teaCount} ${entry.drinkType}(s) — ${formatAmount(entry.amount)}`,
    });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PATCH mark ALL entries of a person as paid ── */
app.patch("/api/tea/pay-all-by-name", async (req, res) => {
  try {
    const { name, changedBy = "user" } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const unpaidEntries = await Tea.find({
      name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      paid: false,
    });

    if (unpaidEntries.length === 0) {
      return res.json({ message: "No unpaid entries found", updated: 0 });
    }

    let totalAmount = 0;
    const bulkOps = [];
    const logOps = [];

    for (const entry of unpaidEntries) {
      totalAmount += entry.amount;
      bulkOps.push({
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { paid: true } },
        },
      });
      logOps.push({
        entryId: entry._id,
        name: entry.name,
        entryDate: entry.date,
        action: "paid",
        changedBy,
        details: `Bulk paid — ${entry.teaCount} ${entry.drinkType}(s) — ${formatAmount(entry.amount)}`,
      });
    }

    await Tea.bulkWrite(bulkOps);
    await PaymentLog.insertMany(logOps);

    // Also log a summary entry
    await PaymentLog.create({
      entryId: null,
      name: name.trim(),
      entryDate: new Date(),
      action: "bulk_paid",
      changedBy,
      details: `All ${unpaidEntries.length} unpaid entries marked as paid — Total: ${formatAmount(totalAmount)}`,
    });

    res.json({
      message: `All ${unpaidEntries.length} unpaid entries for "${name.trim()}" marked as paid`,
      updated: unpaidEntries.length,
      totalAmount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   PAYMENT LOG ROUTES
══════════════════════════════════════ */

app.get("/api/payment-logs", async (req, res) => {
  try {
    const { entryId, name, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (entryId) filter.entryId = entryId;
    if (name) filter.name = { $regex: new RegExp(name, "i") };

    const total = await PaymentLog.countDocuments(filter);
    const logs = await PaymentLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.json({
      logs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   STATS ROUTE
══════════════════════════════════════ */

app.get("/api/stats", async (req, res) => {
  try {
    const entries = await Tea.find().lean();
    const today = new Date();
    const { start, end } = getDayRange(today);
    const todayEntries = entries.filter((e) => e.date >= start && e.date <= end);

    const calc = (list) => {
      let tea = 0, coffee = 0, amount = 0, paid = 0;
      const people = new Set();
      list.forEach((e) => {
        if (e.drinkType === "coffee") coffee += e.teaCount;
        else tea += e.teaCount;
        const amt = e.teaCount * (PRICES[e.drinkType] || PRICES.tea);
        amount += amt;
        if (e.paid) paid += amt;
        people.add(e.name.toLowerCase().trim());
      });
      return { tea, coffee, amount, paid, pending: amount - paid, people: people.size };
    };

    res.json({ today: calc(todayEntries), allTime: calc(entries) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));