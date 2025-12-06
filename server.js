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
const allowedOrigins = ["http://localhost:3000"];
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
  cors: { origin: "http://localhost:3000", credentials: true },
});

// -------------------- Lobby-hantering --------------------
let lobbies = {};
// Format: { lobbyId: { players: [{name, avatarSvg, socketId, stats}], turnIndex: 0, vote: { target, voters:{} } } }

io.on("connection", (socket) => {
  console.log("Ny anslutning:", socket.id);

  // --- Gå med i lobby ---
  socket.on("joinLobby", ({ lobbyId, player }) => {
    if (!lobbies[lobbyId])
      lobbies[lobbyId] = { players: [], turnIndex: 0, vote: null };

    // Undvik duplicerade spelare med samma socketId
    lobbies[lobbyId].players = lobbies[lobbyId].players.filter(p => p.socketId !== socket.id);
    lobbies[lobbyId].players.push({ ...player, socketId: socket.id });
    socket.join(lobbyId);
    io.to(lobbyId).emit("lobbyUpdate", lobbies[lobbyId]);
  });

  // --- Lämna lobby ---
  socket.on("leaveLobby", ({ lobbyId }) => {
    if (!lobbies[lobbyId]) return;
    const lobby = lobbies[lobbyId];
    lobby.players = lobby.players.filter((p) => p.socketId !== socket.id);

    // Om spelare lämnar under pågående röstning, ta bort deras röst (om de röstat) och kolla om röstning är klar
    if (lobby.vote) {
      // Ta bort eventuella röster från spelaren som lämnade (identifiera via socketId -> name)
      // Vi behöver hitta namn från tidigare spelare (kan finnas i request, annars ignoreras)
      // Simpelt: om voter's name inte finns i lobby.players anymore så räkna dem ej
      // Kontrollera om vi redan har röster för spelare som inte längre är kvar
      for (const voterName of Object.keys(lobby.vote.voters)) {
        const stillPresent = lobby.players.some(p => p.name === voterName);
        if (!stillPresent) delete lobby.vote.voters[voterName];
      }

      // Om alla återstående spelare röstat, avsluta röstningen
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
    io.to(lobbyId).emit("turnUpdate", {
      currentPlayerName: firstPlayer.name,
    });
  });

  // --- Walk-action ---
  socket.on("walkAction", ({ lobbyId, moveAmount, statsUpdates }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    if (Array.isArray(statsUpdates)) {
      statsUpdates.forEach((update) => {
        const player = lobby.players.find((p) => p.name === update.name);
        if (player) player.stats = update.newStats;
      });
    }

    io.to(lobbyId).emit("walkUpdate", { moveAmount, statsUpdates });
  });
// --- Make Fire-action ---
socket.on("makeFireAction", ({ lobbyId, statsUpdates }) => {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  // Uppdatera alla spelare med nya stats
  if (Array.isArray(statsUpdates)) {
    statsUpdates.forEach((update) => {
      const player = lobby.players.find((p) => p.name === update.name);
      if (player) player.stats = update.newStats;
    });
  }

  // Skicka uppdateringen till alla i lobbyn
  io.to(lobbyId).emit("makeFireUpdate", { statsUpdates });
});

  // --- Nästa tur ---
  socket.on("nextTurn", ({ lobbyId, nextPlayerName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    const idx = lobby.players.findIndex((p) => p.name === nextPlayerName);
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

  // -------------------------
  //   RÖSTNING - UTRÖSTA (ENDAST EN HANDLER)
  // -------------------------

  // Starta röstning
  socket.on("startVote", ({ lobbyId, targetName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;

    // Initiera vote-objekt
    lobby.vote = {
      voters: {},         // { voterName: votedPlayerName }
      target: targetName, // (valfritt fält för visning i klient)
    };

    io.to(lobbyId).emit("voteStarted", { target: targetName, vote: lobby.vote });
    io.to(lobbyId).emit("lobbyUpdate", lobby);
  });

  // En spelare lägger röst
  socket.on("castVote", ({ lobbyId, voter, vote }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.vote) return;

    // Säkerställ att voter fortfarande är i lobby
    const voterPresent = lobby.players.some(p => p.name === voter);
    if (!voterPresent) {
      // Ignorera röster från icke-aktiva spelare
      return;
    }

    // Lägg till/uppdatera rösten
    lobby.vote.voters[voter] = vote;

    // Uppdatera alla med live votes
    io.to(lobbyId).emit("voteUpdate", lobby.vote);

    // Kontrollera om alla återstående spelare har röstat
    checkAndFinalizeVote(lobbyId);
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
      // ta bort spelaren
      const leaving = lobby.players.find(p => p.socketId === socket.id);
      lobby.players = lobby.players.filter((p) => p.socketId !== socket.id);

      // Om pågående röstning, ta bort eventuell röst från den som lämnade
      if (lobby.vote) {
        for (const voterName of Object.keys(lobby.vote.voters)) {
          const stillPresent = lobby.players.some(p => p.name === voterName);
          if (!stillPresent) delete lobby.vote.voters[voterName];
        }
        checkAndFinalizeVote(lobbyId);
      }

      // Justera turnIndex om nödvändigt
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

    // Alla nuvarande spelare röstat -> avsluta rösten
    if (votersCount < required) return;

    // Räkna röster
    const voteCount = {};
    Object.values(lobby.vote.voters).forEach(name => {
      voteCount[name] = (voteCount[name] || 0) + 1;
    });

    // Sortera
    const sorted = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
    const highestVotes = sorted[0][1];
    const topCandidates = sorted.filter(([_, count]) => count === highestVotes);

    let voteResult;

    if (topCandidates.length > 1) {
      voteResult = "Oavgjort";
      io.to(lobbyId).emit("voteTie", {
        message: "Oavgjort! Ingen röstas ut.",
        vote: lobby.vote
      });
    } else {
      voteResult = topCandidates[0][0]; // namn på personen med flest röster
      // Eliminera spelaren från lobby
      lobby.players = lobby.players.filter(p => p.name !== voteResult);
      io.to(lobbyId).emit("playerEliminated", { name: voteResult });
    }

    // Skicka resultatet till alla
    io.to(lobbyId).emit("voteResult", voteResult);

    // Reset vote
    lobby.vote = null;
    io.to(lobbyId).emit("lobbyUpdate", lobby);

    // Justera turnIndex om nödvändigt
    if (lobby.players.length > 0) {
      lobby.turnIndex = lobby.turnIndex % lobby.players.length;
      const nextPlayer = lobby.players[lobby.turnIndex];
      if (nextPlayer) io.to(lobbyId).emit("turnUpdate", { currentPlayerName: nextPlayer.name });
    }
  }

});

// -------------------- Start server --------------------
httpServer.listen(PORT, () =>
  console.log(`✅ Server med Socket.IO kör på port ${PORT}`)
);
