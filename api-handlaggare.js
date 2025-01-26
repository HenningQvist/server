const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

// Middleware för att autentisera token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('Token saknas');
    return res.status(401).json({ message: 'Access token missing or invalid' });
  }

  jwt.verify(token, 'secretkey', (err, user) => {
    if (err) {
      console.log('Token verifieringsfel:', err);
      return res.status(403).json({ message: 'Invalid token' });
    }

    req.user = user;
    next();
  });
}

// Skapa en databasanslutning
const db = new sqlite3.Database('./my_app_database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Rutt för att hämta alla uppgifter som förfaller inom 7 dagar
router.get('/tasks/soon', (req, res) => {
  console.log('Incoming request: GET /api/tasks/soon');
  
  const name = req.query.name;  // namn skickas via query-parametrar
  
  let sql = `
    SELECT * 
    FROM tasks 
    WHERE DATE(dueDate) <= DATE('now', '+7 days') 
    AND status = 'pending'
  `;
  
  if (name) {
    sql += ` AND name = ?`;
  }

  db.all(sql, [name].filter(Boolean), (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av uppgifter:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({ tasks: rows });
  });
});

// Rutt för att hämta mål som går ut inom 7 dagar
router.get('/goals/soon', (req, res) => {
  console.log('Incoming request: GET /api/goals/soon');
  
  const sql = `
    SELECT * 
    FROM goals 
    WHERE status = 'active' 
    AND DATE(endDate) <= DATE('now', '+7 days');
  `;
  
  db.all(sql, (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av mål:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({ goals: rows });
  });
});

// Rutt för att arkivera klarmarkerade uppgifter
router.post('/tasks/archive', (req, res) => {
  const taskIds = req.body.taskIds;

  // Logga inkommande begäran
  console.log('Inkommande begäran att arkivera uppgifter:', taskIds);

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    console.error('Fel: Ingen uppgift att arkivera.');
    return res.status(400).json({ error: 'Ingen uppgift att arkivera.' });
  }

  const placeholders = taskIds.map(() => '?').join(', ');
  const sql = `UPDATE tasks SET status = 'archived' WHERE id IN (${placeholders})`;

  // Logga den SQL-fråga som kommer att köras
  console.log('SQL-fråga för att arkivera uppgifter:', sql);

  db.run(sql, taskIds, function (err) {
    if (err) {
      console.error('Fel vid arkivering av uppgifter:', err);
      return res.status(500).json({ error: 'Kunde inte arkivera uppgifterna.' });
    }

    // Logga antal ändrade rader
    console.log(`${this.changes} uppgift(er) arkiverade.`);

    res.json({ message: `${this.changes} uppgift(er) arkiverade.` });
  });
});


// Rutt för att arkivera målen
router.post('/goals/archive', (req, res) => {
  const { goalIds } = req.body;

  if (!goalIds || goalIds.length === 0) {
    return res.status(400).json({ error: 'Inga måls IDs skickades.' });
  }

  const placeholders = goalIds.map(() => '?').join(',');
  const sql = `UPDATE goals SET status = 'archived' WHERE id IN (${placeholders})`;

  db.run(sql, goalIds, function (err) {
    if (err) {
      console.error('Fel vid arkivering av mål:', err);
      return res.status(500).json({ error: 'Fel vid arkivering av mål.' });
    }

    res.status(200).json({ message: `${this.changes} mål har arkiverats.` });
  });
});

// --------------------------------------------------------
// Nytt för att hantera handlaggarnotes

router.get('/handlaggarnotes', authenticateToken, (req, res) => {
  const userId = req.user.id;  // Hämta användarens ID från token
  console.log('Authenticated user ID:', userId);  // Logga användarens ID för att bekräfta att det är rätt

  const sql = `SELECT * FROM handlaggarnotes WHERE userId = ?`;
  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av anteckningar:', err);
      return res.status(500).json({ error: err.message });
    }

    console.log('Hämtade anteckningar från databasen:', rows);  // Logga resultatet från databasen
    res.json({ notes: rows });
  });
});





router.post('/handlaggarnotes', authenticateToken, (req, res) => {
  const { title, content } = req.body;
  const handlaggareId = req.user.userId; // Använd userId från verifierad token

  if (!title || !content) {
    return res.status(400).json({ error: 'Både titel och innehåll behövs.' });
  }

  if (!handlaggareId) {
    console.error('userId saknas i tokenen');
    return res.status(400).json({ error: 'Handläggar-ID saknas.' });
  }

  const sql = `INSERT INTO handlaggarnotes (title, content, userId) VALUES (?, ?, ?)`;

  db.run(sql, [title, content, handlaggareId], function (err) {
    if (err) {
      console.error('Fel vid skapande av anteckning:', err);
      return res.status(500).json({ error: 'Kunde inte skapa anteckningen.' });
    }

    res.status(201).json({ message: 'Anteckning skapad', id: this.lastID });
  });
});





// Uppdatera en anteckning (Skyddad rutt)
router.put('/handlaggarnotes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'Både titel och innehåll behövs.' });
  }

  const sql = `UPDATE handlaggarnotes SET title = ?, content = ? WHERE id = ?`;

  db.run(sql, [title, content, id], function (err) {
    if (err) {
      console.error('Fel vid uppdatering av anteckning:', err);
      return res.status(500).json({ error: 'Kunde inte uppdatera anteckningen.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Anteckning hittades inte.' });
    }

    res.json({ message: 'Anteckning uppdaterad' });
  });
});

// Ta bort en anteckning (Skyddad rutt)
router.delete('/handlaggarnotes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM handlaggarnotes WHERE id = ?`;

  db.run(sql, [id], function (err) {
    if (err) {
      console.error('Fel vid radering av anteckning:', err);
      return res.status(500).json({ error: 'Kunde inte radera anteckningen.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Anteckning hittades inte.' });
    }

    res.json({ message: 'Anteckning raderad' });
  });
});
module.exports = router;
