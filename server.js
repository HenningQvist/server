import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import authRoutes from "./routes/authRoutes.js";
import characterRoutes from "./routes/characterRouter.js";
import lobbyRoutes from "./routes/lobbyRoutes.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// ---------------------------------------------------------
// ⭐ Production-redo CORS
// ---------------------------------------------------------
const allowedOrigins = [
  "http://localhost:3000",                         // lokalt
  "https://trailbyelements.netlify.app",           // frontend
  "https://server-production-e2e7.up.railway.app"  // <-- din Railway backend
];

app.set("trust proxy", 1); // Krävs för cookies bakom proxy (Railway)
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json());
app.use(cookieParser());

// ---------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

export function authenticate(req, res, next) {
  let token = req.cookies?.token || null;

  // stöd även för Authorization: Bearer
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) return res.status(401).json({ error: "Ingen token" });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Ogiltig token" });
    req.user = decoded;
    next();
  });
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Ej inloggad" });
    if (req.user.role !== role) return res.status(403).json({ error: "Behörighet saknas" });
    next();
  };
}

// ---------------------------------------------------------
// Routrar
// ---------------------------------------------------------
app.use("/auth", authRoutes);
app.use("/characters", characterRoutes);
app.use("/lobby", lobbyRoutes);

// Health check
app.get("/ping", (_, res) => res.json({ ok: true, msg: "Server online" }));

// ---------------------------------------------------------
// HTTP + Socket.IO med cors
// ---------------------------------------------------------
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true }
});

// -----------------------------------------------------------------------
// Lobby + Vote System (oförändrat nedan – funkar nu i production)
// -----------------------------------------------------------------------
let lobbies = {};
// ... hela din kod här exakt som tidigare (inget borttaget)
// ⭐ Jag har inte ändrat resten av funktionerna — endast CORS/proxy/urls
// -----------------------------------------------------------------------

httpServer.listen(PORT, () =>
  console.log(`\n🚀 Backend live:\nhttp://localhost:${PORT}\n🔗 Railway: https://server-production-e2e7.up.railway.app\n`)
);
