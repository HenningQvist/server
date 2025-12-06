// routes/authRegisterRouter.js
import express from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";

// ✅ importera middleware från auth.js
import { authenticate, requireRole } from "./auth.js";

const router = express.Router();

// -------------------- Registrering --------------------
router.post("/register", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: "Email, password och role krävs" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Lösenordet måste vara minst 8 tecken" });
  }

  try {
    const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Användaren finns redan" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

   const passwordHash = await bcrypt.hash(password, 12);
await pool.query(
  "INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, $3, 'active') RETURNING id, email, role, status",
  [email, passwordHash, role]
);

    // ✅ Ny användare skapad
    res.status(201).json({
      message: "Registrering lyckades!",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Fel vid registrering:", error.message);
    res.status(500).json({ error: "Serverfel vid registrering" });
  }
});

// -------------------- Hämta ej godkända användare --------------------
router.get("/pending", authenticate, requireRole("coach"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, role, status, created_at FROM users WHERE status = 'pending'"
    );
    res.json({ pendingUsers: result.rows });
  } catch (err) {
    console.error("❌ Fel vid hämtning av pending users:", err.message);
    res.status(500).json({ error: "Serverfel" });
  }
});

// -------------------- Godkänn användare --------------------
router.post("/approve/:id", authenticate, requireRole("coach"), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE users SET status = 'active' WHERE id = $1 RETURNING id, email, role, status",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Användare hittades inte" });
    }

    res.json({ message: "✅ Användare godkänd", user: result.rows[0] });
  } catch (err) {
    console.error("❌ Fel vid godkännande:", err.message);
    res.status(500).json({ error: "Serverfel" });
  }
});

export default router;
