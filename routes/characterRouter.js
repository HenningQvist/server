import express from "express";
import pool from "../db.js";
import { authenticate } from "../server.js"; // eller från authMiddleware.js

const router = express.Router();

// -------------------- Spara eller uppdatera karaktär --------------------
router.post("/save", authenticate, async (req, res) => {
  const { seed, name, avatarSvg } = req.body;

  if (!seed || !name || !avatarSvg) {
    return res.status(400).json({ error: "Seed, namn och avatarSvg krävs" });
  }

  try {
    // Kontrollera om användaren redan har en karaktär
    const existing = await pool.query(
      "SELECT * FROM characters WHERE user_id=$1",
      [req.user.id]
    );

    let result;
    if (existing.rows.length > 0) {
      // Uppdatera befintlig karaktär
      result = await pool.query(
        "UPDATE characters SET seed=$1, name=$2, avatar_svg=$3 WHERE user_id=$4 RETURNING id, user_id, seed, name, avatar_svg",
        [seed, name, avatarSvg, req.user.id]
      );
    } else {
      // Skapa ny karaktär
      result = await pool.query(
        "INSERT INTO characters (user_id, seed, name, avatar_svg) VALUES ($1,$2,$3,$4) RETURNING id, user_id, seed, name, avatar_svg",
        [req.user.id, seed, name, avatarSvg]
      );
    }

    // Mappa om avatar_svg till camelCase
    const row = result.rows[0];
    const character = {
      id: row.id,
      user_id: row.user_id,
      seed: row.seed,
      name: row.name,
      avatarSvg: row.avatar_svg, // <-- camelCase
    };

    res.json({ message: "Karaktär sparad", character });
  } catch (err) {
    console.error("❌ Serverfel vid sparande av karaktär:", err.message);
    res.status(500).json({ error: "Serverfel vid sparande av karaktär" });
  }
});

// -------------------- Hämta karaktär(er) --------------------
router.get("/get", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, user_id, seed, name, avatar_svg FROM characters WHERE user_id=$1 LIMIT 1",
      [req.user.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Ingen karaktär hittades" });

    // Mappa om avatar_svg till camelCase
    const row = result.rows[0];
    const character = {
      id: row.id,
      user_id: row.user_id,
      seed: row.seed,
      name: row.name,
      avatarSvg: row.avatar_svg, // <-- camelCase
    };

    res.json({ character });
  } catch (err) {
    console.error("❌ Serverfel vid hämtning av karaktär:", err.message);
    res.status(500).json({ error: "Serverfel vid hämtning av karaktär" });
  }
});

export default router;
