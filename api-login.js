const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // Importera sqlite3
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Skapa en databasanslutning
const db2 = new sqlite3.Database('./anvandare.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Middleware för att verifiera JWT-token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Ingen token tillhandahölls.' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, 'secretkey', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Ogiltig eller utgången token.' });
    }
    req.user = user; // Lägg till användaren i request-objektet
    next();
  });
};

// Middleware för att kontrollera roll
const authorizeRole = (requiredRole) => {
  return (req, res, next) => {
    console.log('Verifierar användarroll:', req.user.role);
    if (req.user.role !== requiredRole) {
      return res.status(403).json({ message: 'Åtkomst nekad.' });
    }
    next();
  };
};

// Rutt för att hämta statistik för ledning
router.get('/ledningsstatistik', authenticateToken, authorizeRole('ledning'), (req, res) => {
  const query = `SELECT kategori, COUNT(*) as count FROM insatser GROUP BY kategori`;

  db2.all(query, [], (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av statistik:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av statistik.' });
    }

    const statistics = rows.reduce((acc, row) => {
      acc[row.kategori] = row.count;
      return acc;
    }, {});

    res.status(200).json(statistics);
  });
});

// POST /login - För att logga in och få en JWT-token
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Användarnamn och lösenord krävs.' });
  }

  const query = `SELECT * FROM users WHERE username = ?`;
  db2.get(query, [username], (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Fel vid autentisering.' });
    }

    if (!user) {
      return res.status(401).json({ message: 'Fel användarnamn eller lösenord.' });
    }

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ message: 'Fel användarnamn eller lösenord.' });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        'secretkey',
        { expiresIn: '1h' }
      );

      res.status(200).json({
        message: 'Inloggad',
        token,
        role: user.role,
      });
    });
  });
});

// POST /signup - För att registrera en användare
router.post('/signup', (req, res) => {
  const { username, password } = req.body;

  console.log('Inkommande registreringsförfrågan:', { username, password });

  if (!username || !password) {
    return res.status(400).json({ message: 'Användarnamn och lösenord krävs.' });
  }

  const checkQuery = `SELECT * FROM pending_users WHERE username = ?`;
  db2.get(checkQuery, [username], (err, existingUser) => {
    if (err) {
      console.error('Fel vid kontroll av användarnamn:', err);
      return res.status(500).json({ message: 'Fel vid kontroll av användarnamn.' });
    }

    if (existingUser) {
      return res.status(400).json({ message: 'Användarnamnet är redan taget.' });
    }

    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Fel vid lösenordshashning:', err);
        return res.status(500).json({ message: 'Fel vid lösenordshashning.' });
      }

      const query = `INSERT INTO pending_users (username, password, status) VALUES (?, ?, 'pending')`;
      db2.run(query, [username, hashedPassword], function (err) {
        if (err) {
          console.error('Fel vid registrering av användare:', err.message);
          return res.status(500).json({ message: 'Användarnamnet är redan taget eller annat fel uppstod.' });
        }

        res.status(201).json({
          message: 'Registreringen mottagen. Din ansökan väntar på godkännande.',
          user: { id: this.lastID, username },
        });
      });
    });
  });
});

module.exports = router;
