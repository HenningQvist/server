// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/authRoutes.js";
import characterRoutes from "./routes/characterRouter.js";
import lobbyRoutes from "./routes/lobbyRoutes.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// -------------------- Middleware --------------------
// Tillåt lokalt + produktion
const allowedOrigins = [
  "http://localhost:3000",
  "https://server-production-e2e7.up.railway.app",
  "https://trailbyelements.netlify.app/"
];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// -------------------- Auth helpers --------------------
export function authenticate(req, res, next) {
  let token = null;
  const authHeader = req.headers["authorization"];
  if (authHeader) token = authHeader.split(" ")[1];
  if (!token && req.cookies) token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Token saknas" });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Ogiltig token" });
    req.user = decoded;
    next();
  });
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Ej autentiserad" });
    if (req.user.role !== role)
      return res.status(403).json({ error: "Åtkomst nekad" });
    next();
  };
}

// -------------------- Routrar --------------------
app.use("/auth", authRoutes);
app.use("/characters", characterRoutes);
app.use("/lobby", lobbyRoutes);

app.get("/ping", (req, res) => res.json({ message: "Servern svarar!" }));

// -------------------- HTTP + Socket.IO --------------------
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// -------------------- Lobby-hantering --------------------
let lobbies = {}; // { lobbyId: { players: [], turnIndex, vote } }

io.on("connection", (socket) => {
  console.log("Ny anslutning:", socket.id);

  socket.on("joinLobby", ({ lobbyId, player }) => {
    if (!lobbies[lobbyId]) lobbies[lobbyId] = { players: [], turnIndex: 0, vote: null };
    lobbies[lobbyId].players = lobbies[lobbyId].players.filter(p => p.socketId !== socket.id);
    lobbies[lobbyId].players.push({ ...player, socketId: socket.id });
    socket.join(lobbyId);
    io.to(lobbyId).emit("lobbyUpdate", lobbies[lobbyId]);
  });

  socket.on("leaveLobby", ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    lobby.players = lobby.players.filter(p => p.socketId !== socket.id);

    if (lobby.vote) {
      for (const voterName of Object.keys(lobby.vote.voters)) {
        if (!lobby.players.some(p => p.name === voterName)) delete lobby.vote.voters[voterName];
      }
      checkAndFinalizeVote(lobbyId);
    }

    socket.leave(lobbyId);
    io.to(lobbyId).emit("lobbyUpdate", lobby);
  });

  // --- Starta spel ---
  socket.on("startGame", ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.players.length === 0) return;
    lobby.turnIndex = Math.floor(Math.random() * lobby.players.length);
    const firstPlayer = lobby.players[lobby.turnIndex];
    io.to(lobbyId).emit("gameStarted", { lobby });
    io.to(lobbyId).emit("turnUpdate", { currentPlayerName: firstPlayer.name });
  });

  // --- Action handlers (walk, fire, etc.) ---
  socket.on("walkAction", ({ lobbyId, moveAmount, statsUpdates }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    statsUpdates?.forEach(update => {
      const player = lobby.players.find(p => p.name === update.name);
      if (player) player.stats = update.newStats;
    });
    io.to(lobbyId).emit("walkUpdate", { moveAmount, statsUpdates });
  });

  socket.on("makeFireAction", ({ lobbyId, statsUpdates }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    statsUpdates?.forEach(update => {
      const player = lobby.players.find(p => p.name === update.name);
      if (player) player.stats = update.newStats;
    });
    io.to(lobbyId).emit("makeFireUpdate", { statsUpdates });
  });

  // --- Next Turn ---
  socket.on("nextTurn", ({ lobbyId, nextPlayerName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    const idx = lobby.players.findIndex(p => p.name === nextPlayerName);
    if (idx !== -1) lobby.turnIndex = idx;
    io.to(lobbyId).emit("turnUpdate", { currentPlayerName: nextPlayerName });
  });

  socket.on("endTurn", ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.players.length) return;
    lobby.turnIndex = (lobby.turnIndex + 1) % lobby.players.length;
    io.to(lobbyId).emit("turnUpdate", { currentPlayerName: lobby.players[lobby.turnIndex].name });
    io.to(lobbyId).emit("lobbyUpdate", lobby);
  });

  // --- Voting ---
  socket.on("startVote", ({ lobbyId, targetName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    lobby.vote = { voters: {}, target: targetName };
    io.to(lobbyId).emit("voteStarted", { target: targetName, vote: lobby.vote });
    io.to(lobbyId).emit("lobbyUpdate", lobby);
  });

  socket.on("castVote", ({ lobbyId, voter, vote }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby?.vote) return;
    if (!lobby.players.some(p => p.name === voter)) return;
    lobby.vote.voters[voter] = vote;
    io.to(lobbyId).emit("voteUpdate", lobby.vote);
    checkAndFinalizeVote(lobbyId);
  });

  // --- Chat ---
  socket.on("chatMessage", ({ lobbyId, ...msg }) => {
    if (!lobbyId) return;
    io.to(lobbyId).emit("chatMessage", msg);
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    Object.keys(lobbies).forEach(lobbyId => {
      const lobby = lobbies[lobbyId];
      if (!lobby) return;
      lobby.players = lobby.players.filter(p => p.socketId !== socket.id);

      if (lobby.vote) {
        for (const voterName of Object.keys(lobby.vote.voters)) {
          if (!lobby.players.some(p => p.name === voterName)) delete lobby.vote.voters[voterName];
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
    if (!lobby?.vote) return;

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
      lobby.turnIndex %= lobby.players.length;
      io.to(lobbyId).emit("turnUpdate", { currentPlayerName: lobby.players[lobby.turnIndex].name });
    }
  }

});

// -------------------- Start server --------------------
httpServer.listen(PORT, () =>
  console.log(`✅ Produktionsserver kör på port ${PORT}`)
);
