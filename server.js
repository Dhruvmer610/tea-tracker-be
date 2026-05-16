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
      // match by name (case-insensitive)
      {
        name: {
          $regex: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        },
      },
      {
        // only set these fields if document is being INSERTED (not on update)
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
    // Non-blocking warning — tea entry still saves even if this fails
    console.warn("upsertPerson warning:", err.message);
  }
};

/* ══════════════════════════════════════
   PEOPLE ROUTES
══════════════════════════════════════ */

/* ── GET all people ── */
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

/* ── GET single person ── */
app.get("/api/people/:id", async (req, res) => {
  try {
    const person = await People.findById(req.params.id).lean();
    if (!person) return res.status(404).json({ error: "Person not found" });
    res.json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST create person manually ── */
app.post("/api/people", async (req, res) => {
  try {
    const { name, role, drinkPreference, phone, notes } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const duplicate = await People.findOne({
      name: {
        $regex: new RegExp(
          `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
      },
    });

    if (duplicate) {
      return res.status(400).json({
        error: `A person named "${name.trim()}" already exists.`,
      });
    }

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
    if (err.code === 11000) {
      return res.status(400).json({ error: "Name must be unique" });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT update person ── */
app.put("/api/people/:id", async (req, res) => {
  try {
    const { name, role, drinkPreference, phone, notes, isActive } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const person = await People.findById(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });

    const nameChanged =
      person.name.toLowerCase() !== name.trim().toLowerCase();

    if (nameChanged) {
      const duplicate = await People.findOne({
        name: {
          $regex: new RegExp(
            `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        },
        _id: { $ne: req.params.id },
      });
      if (duplicate) {
        return res.status(400).json({
          error: `A person named "${name.trim()}" already exists.`,
        });
      }
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
    if (err.code === 11000) {
      return res.status(400).json({ error: "Name must be unique" });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ── PATCH toggle isActive ── */
app.patch("/api/people/:id/toggle-active", async (req, res) => {
  try {
    const person = await People.findById(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });

    person.isActive = !person.isActive;
    await person.save();

    res.json({
      message: `${person.name} is now ${person.isActive ? "active" : "inactive"}`,
      person,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE person ── */
app.delete("/api/people/:id", async (req, res) => {
  try {
    const person = await People.findByIdAndDelete(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });
    res.json({ message: `"${person.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET person history ── */
app.get("/api/people/:id/history", async (req, res) => {
  try {
    const person = await People.findById(req.params.id).lean();
    if (!person) return res.status(404).json({ error: "Person not found" });

    const entries = await Tea.find({
      name: {
        $regex: new RegExp(
          `^${person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
      },
    })
      .sort({ date: -1 })
      .lean();

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

/* ── GET all entries ── */
app.get("/api/tea", async (req, res) => {
  try {
    const data = await Tea.find().sort({ date: -1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST new entry → also upserts person ── */
app.post("/api/tea", async (req, res) => {
  try {
    const { name, teaCount, drinkType = "tea", date } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!teaCount || teaCount < 1) return res.status(400).json({ error: "teaCount must be ≥ 1" });

    const entryDate = date ? new Date(date) : new Date();
    const price = PRICES[drinkType] || PRICES.tea;
    const { start, end } = getDayRange(entryDate);

    // Duplicate check
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
        error: `A ${drinkType} entry for "${name.trim()}" already exists on this date.`,
      });
    }

    // Save tea entry
    const newEntry = new Tea({
      name: name.trim(),
      teaCount: Number(teaCount),
      drinkType,
      amount: Number(teaCount) * price,
      date: entryDate,
      paid: false,
    });

    await newEntry.save();

    // ✅ Auto-register person in People table (non-blocking)
    await upsertPerson(name.trim());

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
    const { start, end } = getDayRange(existing.date);

    const nameChanged = existing.name.toLowerCase() !== name.trim().toLowerCase();
    const drinkChanged = existing.drinkType !== drinkType;

    if (nameChanged || drinkChanged) {
      const duplicate = await Tea.findOne({
        name: {
          $regex: new RegExp(
            `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        },
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

    const updated = await Tea.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        teaCount: Number(teaCount),
        drinkType,
        amount: Number(teaCount) * price,
      },
      { new: true }
    );

    // ✅ If name changed, upsert the new name into People too
    if (nameChanged) {
      await upsertPerson(name.trim());
    }

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
    });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   PAYMENT LOG ROUTES
══════════════════════════════════════ */

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

/* ══════════════════════════════════════
   STATS ROUTE
══════════════════════════════════════ */

app.get("/api/stats", async (req, res) => {
  try {
    const entries = await Tea.find().lean();
    const today = new Date();
    const { start, end } = getDayRange(today);
    const todayEntries = entries.filter(
      (e) => e.date >= start && e.date <= end
    );

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
      return {
        tea, coffee, amount, paid,
        pending: amount - paid,
        people: people.size,
      };
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
app.get("/health", (_, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));