// src/routes/authRoutes.js
import express from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { authenticate, requireRole } from "../server.js";
import jwt from "jsonwebtoken";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const JWT_EXPIRES = "1h";

// -------------------- Token-skapare --------------------
const createToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });

// -------------------- Rate limiter --------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "För många inloggningsförsök. Försök igen om 15 minuter.",
});

// -------------------- Register --------------------
router.post("/register", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.status(400).json({ error: "Alla fält krävs" });
  if (password.length < 8)
    return res.status(400).json({ error: "Lösenord minst 8 tecken" });

  try {
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );
    if (existingUser.rows.length > 0)
      return res.status(400).json({ error: "E-post finns redan" });

    const hashed = await bcrypt.hash(password, 12);

    const result = await pool.query(
      "INSERT INTO users (email, password_hash, role, status) VALUES ($1,$2,$3,'pending') RETURNING id,email,role,status",
      [email, hashed, role]
    );

    res.status(201).json({
      message: "Registrering mottagen. Väntar på godkännande av coach.",
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Serverfel" });
  }
});

// -------------------- Login --------------------
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email och lösenord krävs" });

  try {
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [
      email,
    ]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Felaktiga uppgifter" });
    if (user.status !== "active")
      return res
        .status(403)
        .json({ error: "Konto väntar på godkännande av coach" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Felaktiga uppgifter" });

    const token = createToken(user);

    res.json({
      message: "Inloggning lyckades",
      user: { id: user.id, email: user.email, role: user.role },
      token, // ← Returnerar token istället för cookie
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Serverfel vid login" });
  }
});

// -------------------- Logout --------------------
router.post("/logout", (req, res) => {
  // Inget cookie längre – frontend kan bara "glömma" token
  res.json({ message: "Utloggad" });
});

// -------------------- Me --------------------
router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

// -------------------- Pending users (coach) --------------------
router.get("/pending", authenticate, requireRole("coach"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id,email,role,status,created_at FROM users WHERE status='pending'"
    );
    res.json({ pendingUsers: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Serverfel" });
  }
});

// -------------------- Approve user (coach) --------------------
router.post(
  "/approve/:id",
  authenticate,
  requireRole("coach"),
  async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE users SET status='active' WHERE id=$1 RETURNING id,email,role,status",
        [id]
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Användare hittades inte" });
      res.json({ message: "✅ Användare godkänd", user: result.rows[0] });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: "Serverfel" });
    }
  }
);

export default router;
