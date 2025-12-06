import express from "express";
const router = express.Router();

// Håller alla lobbys i minnet: { lobbyId: [{ name, avatarSvg }] }
let lobbies = {};

// Hämta spelare i en lobby
router.get("/:gameId", (req, res) => {
  const { gameId } = req.params;
  const players = lobbies[gameId] || [];
  res.json({ players, id: gameId });
});

// Gå med i lobby
router.post("/join", (req, res) => {
  const { gameId, name, avatarSvg } = req.body;
  if (!gameId || !name) return res.status(400).json({ error: "Missing gameId or name" });

  if (!lobbies[gameId]) lobbies[gameId] = [];
  if (!lobbies[gameId].find(p => p.name === name)) {
    lobbies[gameId].push({ name, avatarSvg });
  }

  res.json({ players: lobbies[gameId], id: gameId });
});

// Lämna lobby
router.post("/leave", (req, res) => {
  const { gameId, name } = req.body;
  if (lobbies[gameId]) {
    lobbies[gameId] = lobbies[gameId].filter(p => p.name !== name);
  }
  res.json({ players: lobbies[gameId] || [], id: gameId });
});

export default router;
