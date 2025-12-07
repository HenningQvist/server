// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import authRoutes from "./routes/authRoutes.js";
import characterRoutes from "./routes/characterRouter.js";
import lobbyRoutes from "./routes/lobbyRoutes.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// -------------------- CORS --------------------
const allowedOrigins = [
  "http://localhost:3000",                         // lokal frontend
  "https://trailbyelements.netlify.app",           // Netlify
  "https://server-production-e2e7.up.railway.app"  // Railway backend
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// -------------------- JWT helpers --------------------
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

export function authenticate(req, res, next) {
  let token = null;

  // Token hämtas från Authorization-header
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
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

// -------------------- Routrar --------------------
app.use("/auth", authRoutes);
app.use("/characters", characterRoutes);
app.use("/lobby", lobbyRoutes);

// Health check
app.get("/ping", (_, res) => res.json({ ok: true, msg: "Server online" }));

// -------------------- HTTP + Socket.IO --------------------
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true }
});

// -------------------- Socket.IO autentisering --------------------
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Ingen token"));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Ogiltig token"));
    socket.user = decoded;
    next();
  });
});

// -------------------- Lobby-system --------------------
let lobbies = {};
// Format: { lobbyId: { players: [{name, avatarSvg, socketId, stats}], turnIndex: 0, vote: { target, voters:{} } } }

io.on("connection", (socket) => {
  console.log("Ny anslutning:", socket.id);

  // --- Gå med i lobby ---
  socket.on("joinLobby", ({ lobbyId, player }) => {
    if (!lobbies[lobbyId]) lobbies[lobbyId] = { players: [], turnIndex: 0, vote: null };

    lobbies[lobbyId].players = lobbies[lobbyId].players.filter(p => p.socketId !== socket.id);
    lobbies[lobbyId].players.push({ ...player, socketId: socket.id });
    socket.join(lobbyId);
    io.to(lobbyId).emit("lobbyUpdate", lobbies[lobbyId]);
  });

  // --- Lämna lobby ---
  socket.on("leaveLobby", ({ lobbyId }) => {
    if (!lobbies[lobbyId]) return;
    const lobby = lobbies[lobbyId];
    lobby.players = lobby.players.filter(p => p.socketId !== socket.id);

    if (lobby.vote) {
      for (const voterName of Object.keys(lobby.vote.voters)) {
        const stillPresent = lobby.players.some(p => p.name === voterName);
        if (!stillPresent) delete lobby.vote.voters[voterName];
      }
      checkAndFinalizeVote(lobbyId);
    }

    socket.leave(lobbyId);
    io.to(lobbyId).emit("lobbyUpdate", lobbies[lobbyId]);
  });

  // --- Starta spel ---
  socket.on("startGame", ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.players.length === 0) return;

    const startIndex = Math.floor(Math.random() * lobby.players.length);
    lobby.turnIndex = startIndex;
    const firstPlayer = lobby.players[startIndex];

    io.to(lobbyId).emit("gameStarted", { lobby });
    io.to(lobbyId).emit("turnUpdate", { currentPlayerName: firstPlayer.name });
  });

  // --- Walk-action ---
  socket.on("walkAction", ({ lobbyId, moveAmount, statsUpdates }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    if (Array.isArray(statsUpdates)) {
      statsUpdates.forEach((update) => {
        const player = lobby.players.find(p => p.name === update.name);
        if (player) player.stats = update.newStats;
      });
    }

    io.to(lobbyId).emit("walkUpdate", { moveAmount, statsUpdates });
  });

  // --- Make Fire-action ---
  socket.on("makeFireAction", ({ lobbyId, statsUpdates }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    if (Array.isArray(statsUpdates)) {
      statsUpdates.forEach((update) => {
        const player = lobby.players.find((p) => p.name === update.name);
        if (player) player.stats = update.newStats;
      });
    }

    io.to(lobbyId).emit("makeFireUpdate", { statsUpdates });
  });

  // --- Nästa tur ---
  socket.on("nextTurn", ({ lobbyId, nextPlayerName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    const idx = lobby.players.findIndex(p => p.name === nextPlayerName);
    if (idx !== -1) lobby.turnIndex = idx;
    io.to(lobbyId).emit("turnUpdate", { currentPlayerName: nextPlayerName });
  });

  // --- EndTurn ---
  socket.on("endTurn", ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.players.length === 0) return;

    lobby.turnIndex = (lobby.turnIndex + 1) % lobby.players.length;
    const nextPlayer = lobby.players[lobby.turnIndex];

    io.to(lobbyId).emit("turnUpdate", { currentPlayerName: nextPlayer.name });
    io.to(lobbyId).emit("lobbyUpdate", lobby);
  });

  // --- Chat ---
  socket.on("chatMessage", (msg) => {
    const { lobbyId } = msg;
    if (!lobbyId) return;
    io.to(lobbyId).emit("chatMessage", msg);
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    Object.keys(lobbies).forEach((lobbyId) => {
      const lobby = lobbies[lobbyId];
      lobby.players = lobby.players.filter(p => p.socketId !== socket.id);

      if (lobby.vote) {
        for (const voterName of Object.keys(lobby.vote.voters)) {
          const stillPresent = lobby.players.some(p => p.name === voterName);
          if (!stillPresent) delete lobby.vote.voters[voterName];
        }
        checkAndFinalizeVote(lobbyId);
      }

      if (lobby.turnIndex >= lobby.players.length) lobby.turnIndex = 0;
      io.to(lobbyId).emit("lobbyUpdate", lobby);
    });
  });

  // ---------- Helpers ----------
  function checkAndFinalizeVote(lobbyId) {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.vote) return;

    const votersCount = Object.keys(lobby.vote.voters).length;
    const required = lobby.players.length;
    if (votersCount < required) return;

    const voteCount = {};
    Object.values(lobby.vote.voters).forEach(name => {
      voteCount[name] = (voteCount[name] || 0) + 1;
    });

    const sorted = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
    const highestVotes = sorted[0][1];
    const topCandidates = sorted.filter(([_, count]) => count === highestVotes);

    let voteResult;
    if (topCandidates.length > 1) {
      voteResult = "Oavgjort";
      io.to(lobbyId).emit("voteTie", { message: "Oavgjort! Ingen röstas ut.", vote: lobby.vote });
    } else {
      voteResult = topCandidates[0][0];
      lobby.players = lobby.players.filter(p => p.name !== voteResult);
      io.to(lobbyId).emit("playerEliminated", { name: voteResult });
    }

    io.to(lobbyId).emit("voteResult", voteResult);
    lobby.vote = null;
    io.to(lobbyId).emit("lobbyUpdate", lobby);

    if (lobby.players.length > 0) {
      lobby.turnIndex = lobby.turnIndex % lobby.players.length;
      const nextPlayer = lobby.players[lobby.turnIndex];
      if (nextPlayer) io.to(lobbyId).emit("turnUpdate", { currentPlayerName: nextPlayer.name });
    }
  }
});

// -------------------- Start server --------------------
httpServer.listen(PORT, () =>
  console.log(`\n🚀 Backend live på port ${PORT}\n🔗 Railway: https://server-production-e2e7.up.railway.app\n`)
);
