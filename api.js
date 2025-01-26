const express = require('express');
const sqlite3 = require('sqlite3').verbose();  // Importera sqlite3
const router = express.Router();
const cors = require('cors');  // För att tillåta cross-origin requests
const bodyParser = require('body-parser');
const moment = require('moment');
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

// POST-rutt för att registrera användare
router.post('/register', authenticateToken, (req, res) => {
  const { name, gender, experience, education, license, other_skills } = req.body;

  console.log('Received data for registration:', {
    name,
    gender,
    experience,
    education,
    license,
    other_skills
  });

  // Kontrollera om de obligatoriska fälten finns
  if (!name || !gender) {
    console.log('Validation failed: Name and gender are required.');
    return res.status(400).json({ message: 'Name and gender are required.' });
  }

  // Hämta handläggarens ID från den autentiserade användaren
  const handlaggareId = req.user.userId;

  console.log('Handläggarens ID:', handlaggareId);

  // Förbereda SQL-sats för att infoga användardata med handläggarens ID
  const stmt = db.prepare(
    'INSERT INTO users (name, gender, experience, education, license, other_skills, handlaggare_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  // Köra SQL-satsen och skicka värdena till databasen
  stmt.run(name, gender, experience || null, education || null, license || null, other_skills || null, handlaggareId, function (err) {
    if (err) {
      console.error('Error inserting user:', err.message);
      return res.status(500).json({ message: 'Error saving user to database.' });
    }

    console.log('User inserted successfully with ID:', this.lastID);
    res.status(201).json({ message: 'User registered successfully.', id: this.lastID });
  });

  stmt.finalize();  // Slutför SQL-satsen
});



// GET-rutt för att hämta total användarantal samt könsstatistik
router.get('/users/stats', (req, res) => {
  db.all('SELECT COUNT(*) as total FROM users', [], (err, totalRows) => {
    if (err) {
      console.error('Error fetching total user count:', err);
      return res.status(500).json({ message: 'Error fetching total user count.' });
    }

    const totalCount = totalRows[0]?.total || 0;

    db.all('SELECT gender, COUNT(*) as count FROM users GROUP BY gender', [], (err, genderRows) => {
      if (err) {
        console.error('Error fetching gender stats:', err);
        return res.status(500).json({ message: 'Error fetching gender stats.' });
      }

      // Kolla om vi har könsstatistik, annars sätt till 0 för båda
      const males = genderRows.find(item => item.gender === 'male');
      const females = genderRows.find(item => item.gender === 'female');

      res.status(200).json({
        total: totalCount,
        genderStats: [
          { gender: 'male', count: males ? males.count : 0 },
          { gender: 'female', count: females ? females.count : 0 }
        ]
      });
    });
  });
});

// GET-rout för att hämta specifik användardata baserat på ID
router.get('/users/:id', (req, res) => {
    const userId = req.params.id;  // Hämta id från URL-parametern

    const query = `
        SELECT name, experience, education, license, other_skills, created_at
        FROM users
        WHERE id = ?
    `;

    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Skicka tillbaka den specifika användaren som JSON
        res.json(row);
    });
});


// GET-rutt för att hämta alla användare för en specifik handläggare
router.get('/users', authenticateToken, (req, res) => {
  // Hämta handläggarens ID från token
  const handlaggareId = req.user.userId;  // Antag att handläggarens ID finns i token

  // Hämta alla användare som är kopplade till denna handläggare
  const query = 'SELECT * FROM users WHERE handlaggare_id = ?';

  db.all(query, [handlaggareId], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err.message);
      return res.status(500).json({ message: 'Error fetching users.' });
    }

    res.status(200).json(rows);  // Skicka tillbaka alla användare som är tilldelade handläggaren
  });
});

// POST-rutt för att spara alla 8 skattningar
router.post('/saveRatings', (req, res) => {
  const { 
    userId, 
    hälsa, 
    vardag, 
    kunskap_om_att_nå_arbete, 
    klara_av_arbete, 
    kompetenser, 
    samarbetsförmåga, 
    kommunikation, 
    motivation 
  } = req.body;

  // Kontrollera om alla skattningar och användar-ID är angivna
  if (!userId || 
      hälsa === undefined || 
      vardag === undefined || 
      kunskap_om_att_nå_arbete === undefined || 
      klara_av_arbete === undefined || 
      kompetenser === undefined || 
      samarbetsförmåga === undefined || 
      kommunikation === undefined || 
      motivation === undefined) {
    return res.status(400).json({ message: 'Alla fält är obligatoriska.' });
  }

  // Förbereda SQL-sats för att infoga de 8 skattningarna och koppla dem till användaren
  const stmt = db.prepare(`INSERT INTO ratings (user_id, hälsa, vardag, kunskap_om_att_nå_arbete, klara_av_arbete, kompetenser, samarbetsförmåga, kommunikation, motivation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  stmt.run(userId, hälsa, vardag, kunskap_om_att_nå_arbete, klara_av_arbete, kompetenser, samarbetsförmåga, kommunikation, motivation, function (err) {
    if (err) {
      console.error('Error saving ratings:', err.message);
      return res.status(500).json({ message: 'Fel vid sparande av skattningar till databasen.' });
    }
    res.status(201).json({ message: 'Skattningar sparades framgångsrikt.', id: this.lastID });
  });

  stmt.finalize(); // Slutför SQL-satsen
});

// GET-rutt för att hämta senaste skattningen för en användare
router.get('/getLatestRating/:userId', (req, res) => {
  const { userId } = req.params;

  // SQL-fråga för att hämta den senaste skattningen
  const stmt = db.prepare('SELECT * FROM ratings WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');

  stmt.get(userId, (err, row) => {
    if (err) {
      console.error('Error fetching latest rating:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av senaste skattning.' });
    }

    if (!row) {
      return res.status(404).json({ message: 'Ingen senaste skattning hittades för denna användare.' });
    }

    res.status(200).json(row); // Returnera den senaste skattningen
  });

  stmt.finalize();
});

router.get('/getFirstAndLastRatings/:userId', (req, res) => {
  const { userId } = req.params;

  // Första ratingen
  const stmtFirst = db.prepare(`
    SELECT * 
    FROM ratings
    WHERE user_id = ?
    ORDER BY created_at ASC
    LIMIT 1
  `);

  // Sista ratingen
  const stmtLast = db.prepare(`
    SELECT * 
    FROM ratings
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  // Hämta första ratingen
  stmtFirst.get(userId, (err, firstRating) => {
    if (err) {
      console.error('Error fetching first rating:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av första skattning.', error: err.message });
    }

    // Om ingen första rating hittas
    if (!firstRating) {
      return res.status(404).json({ message: 'Ingen första skattning hittades för denna användare.' });
    }

    // Hämta sista ratingen
    stmtLast.get(userId, (err, lastRating) => {
      if (err) {
        console.error('Error fetching last rating:', err.message);
        return res.status(500).json({ message: 'Fel vid hämtning av sista skattning.', error: err.message });
      }

      // Om ingen sista rating hittas
      if (!lastRating) {
        return res.status(404).json({ message: 'Ingen sista skattning hittades för denna användare.' });
      }

      // Skicka resultatet
      res.status(200).json({ 
        firstRating: firstRating || null, 
        lastRating: lastRating || null 
      });

      // Anropa finalize efter att vi har fått alla resultat
      stmtFirst.finalize();
      stmtLast.finalize();
    });
  });
});

router.get('/getAllPositiveProgressions', (req, res) => {
  const stmt = db.prepare(`
    SELECT 
      r.user_id, 
      r.hälsa, r.vardag, r.kunskap_om_att_nå_arbete, r.klara_av_arbete,
      r.kompetenser, r.samarbetsförmåga, r.kommunikation, r.motivation,
      r.created_at
    FROM ratings r
    INNER JOIN (
      SELECT user_id, MIN(created_at) AS first_created_at, MAX(created_at) AS last_created_at
      FROM ratings
      GROUP BY user_id
    ) first_last
    ON r.user_id = first_last.user_id
    WHERE r.created_at = first_last.first_created_at OR r.created_at = first_last.last_created_at
  `);

  stmt.all((err, rows) => {
    if (err) {
      console.error('Error fetching positive progressions:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av progressioner.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Inga progressioner hittades.' });
    }

    console.log('Rows fetched:', rows);

    const positiveProgressions = [];
    const fields = [
      'hälsa', 
      'vardag', 
      'kunskap_om_att_nå_arbete', 
      'klara_av_arbete', 
      'kompetenser', 
      'samarbetsförmåga', 
      'kommunikation', 
      'motivation'
    ];

    // Loop through each user to find positive progressions
    rows.forEach((row, index, array) => {
      if (index === 0) return; // Skip the first element
      const firstRating = array[index - 1];
      const lastRating = row;

      if (firstRating && lastRating) {
        fields.forEach(field => {
          if (lastRating[field] > firstRating[field]) {
            positiveProgressions.push({
              user_id: row.user_id,
              field,
              first: firstRating[field],
              last: lastRating[field]
            });
          }
        });
      } else {
        console.error('Missing data for first or last rating for user_id:', row.user_id);
      }
    });

    if (positiveProgressions.length === 0) {
      return res.status(404).json({ message: 'Inga positiva progressioner hittades.' });
    }

    res.status(200).json(positiveProgressions);
  });

  stmt.finalize();
});

// POST-rutt för att spara kommentarer (koppla till användare med userId)
router.post('/save-comments', (req, res) => {
  const { userId, hälsa, vardag, kunskap_om_att_nå_arbete, klara_av_arbete, kompetenser, samarbetsförmåga, kommunikation, motivation } = req.body;

  // Logga indata för felsökning
  console.log('Mottagna data för kommentar:', req.body);

  // Kontrollera att alla fält är ifyllda
  if (!userId || !hälsa || !vardag || !kunskap_om_att_nå_arbete || !klara_av_arbete || !kompetenser || !samarbetsförmåga || !kommunikation || !motivation) {
    console.error('Fel: Alla fält måste fyllas i.');
    return res.status(400).json({ message: 'Alla fält måste fyllas i.' });
  }

  // Förbereda SQL-sats för att infoga kommentarerna och koppla dem till användaren
  const stmt = db.prepare('INSERT INTO comments (user_id, hälsa, vardag, kunskap_om_att_nå_arbete, klara_av_arbete, kompetenser, samarbetsförmåga, kommunikation, motivation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  console.log('Försöker spara kommentarer för userId:', userId);

  stmt.run(userId, hälsa, vardag, kunskap_om_att_nå_arbete, klara_av_arbete, kompetenser, samarbetsförmåga, kommunikation, motivation, function (err) {
    if (err) {
      console.error('Fel vid sparande av kommentarer:', err.message);
      return res.status(500).json({ message: 'Fel vid sparande av kommentarer.' });
    }

    // Logga framgång och kommentarens ID
    console.log('Kommentarer sparades framgångsrikt. Kommentar-ID:', this.lastID);

    res.status(201).json({ message: 'Kommentarer sparades framgångsrikt.', id: this.lastID });
  });

  stmt.finalize(); // Slutför SQL-satsen
});


// GET-rutt för att hämta kommentarer kopplade till en specifik användare
router.get('/get-comments/:userId', (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: 'Användar-ID krävs.' });
  }

  // Förbered SQL-sats för att hämta kommentarer kopplade till användaren
  const stmt = db.prepare('SELECT * FROM comments WHERE user_id = ?');

  stmt.all(userId, (err, rows) => {
    if (err) {
      console.error('Error fetching comments:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av kommentarer.' });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Inga kommentarer hittades för denna användare.' });
    }

    res.status(200).json(rows); // Returnera kommentarerna
  });

  stmt.finalize(); // Slutför SQL-satsen
});

// GET-rutt för att hämta senaste kommentaren för en användare
router.get('/getLatestComment/:userId', (req, res) => {
  const { userId } = req.params;

  // SQL-fråga för att hämta den senaste kommentaren
  const stmt = db.prepare('SELECT * FROM comments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');

  stmt.get(userId, (err, row) => {
    if (err) {
      console.error('Error fetching latest comment:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av senaste kommentar.' });
    }

    if (!row) {
      return res.status(404).json({ message: 'Ingen senaste kommentar hittades för denna användare.' });
    }

    res.status(200).json(row); // Returnera den senaste kommentaren
  });

  stmt.finalize();
});

router.post('/saveRecommendations', async (req, res) => {
  const { userId, recommendations } = req.body;

  if (!userId || !recommendations) {
    return res.status(400).json({ error: 'User ID and recommendations are required' });
  }

  try {
    // Hämta senaste rating_id för användaren
    const ratingQuery = 'SELECT id FROM ratings WHERE user_id = ? ORDER BY created_at DESC LIMIT 1';
    const ratingRow = await db.get(ratingQuery, [userId]);

    // Kontrollera om ratingRow returneras korrekt
    console.log('Rating row:', ratingRow);  // Ska logga hela objektet eller undefined/null

    if (!ratingRow) {
      console.log(`No valid rating found for user_id ${userId}`);
      return res.status(404).json({ error: 'No ratings found for the given user' });
    }

    const ratingId = ratingRow.id;
    console.log(`Found rating_id: ${ratingId} for user_id: ${userId}`);

    // Spara rekommendationen med rätt rating_id
    const query = 'INSERT INTO recommendations (user_id, recommendations, rating_id) VALUES (?, ?, ?)';
    await db.run(query, [userId, recommendations.join(', '), ratingId]);

    console.log('Recommendation saved successfully');
    res.status(200).json({ message: 'Recommendations saved successfully' });

  } catch (error) {
    console.error('Error saving recommendations:', error);
    res.status(500).json({ error: 'Error saving recommendations' });
  }
});






router.get('/getRecommendations/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Hämta den senaste rekommendationen från databasen för den angivna userId
  try {
    const query = 'SELECT recommendations FROM recommendations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1';
    db.all(query, [userId], (err, rows) => {
      if (err) {
        console.error('Database error:', err.message);  // Logga SQLite-felet
        return res.status(500).json({ error: 'Error fetching recommendations' });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: 'No recommendations found for this user' });
      }

      // Skicka tillbaka den senaste rekommendationen
      const latestRecommendation = rows[0].recommendations;
      res.status(200).json({ recommendations: [latestRecommendation] });
    });
  } catch (error) {
    console.error('Unexpected error:', error);  // Logga alla andra oväntade fel
    res.status(500).json({ error: 'Error fetching recommendations' });
  }
});

router.post('/saveModule', async (req, res) => {
  const { userId, selectedModule } = req.body;

  if (!userId || !selectedModule) {
    return res.status(400).json({ message: 'User ID and selected module are required.' });
  }

  try {
    const checkQuery = `SELECT * FROM modules WHERE userId = ?`;
    db.get(checkQuery, [userId], (err, row) => {
      if (err) {
        console.error('SQL Error:', err);
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      if (row) {
        // Update the existing record
        const updateQuery = `UPDATE modules SET selectedModule = ? WHERE userId = ?`;
        db.run(updateQuery, [selectedModule, userId], function (err) {
          if (err) {
            console.error('SQL Error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
          }
          res.status(200).json({ message: 'Module updated successfully' });
        });
      } else {
        // Insert a new record
        const insertQuery = `INSERT INTO modules (userId, selectedModule) VALUES (?, ?)`;
        db.run(insertQuery, [userId, selectedModule], function (err) {
          if (err) {
            console.error('SQL Error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
          }
          res.status(200).json({ message: 'Module saved successfully', id: this.lastID });
        });
      }
    });
  } catch (error) {
    console.error('Unexpected server error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});



// GET-rutt för att hämta vald modul baserat på userId
router.get('/getModule/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    const query = `
      SELECT selectedModule
      FROM modules
      WHERE userId = ?
      ORDER BY id DESC
      LIMIT 1
    `;

    console.log(`Executing query: ${query} with value:`, userId);

    db.get(query, [userId], (err, row) => {
      if (err) {
        console.error('SQL Error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
        return;
      }

      if (row) {
        console.log('Module retrieved:', row.selectedModule);
        res.status(200).json({ selectedModule: row.selectedModule });
      } else {
        // Returnera standardvärde istället för 404
        console.log('No module found for userId:', userId);
        res.status(200).json({ selectedModule: 0 }); // Standardvärde om ingen modul hittas
      }
    });
  } catch (error) {
    console.error('Unexpected server error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET-rutt för att hämta senaste modul för alla deltagare
router.get('/getAllLatestModules', async (req, res) => {
  try {
    const query = `
      SELECT userId, selectedModule
      FROM modules
      WHERE id IN (
        SELECT MAX(id)
        FROM modules
        GROUP BY userId
      )
    `;

    console.log('Executing query to fetch latest module for all participants:', query);

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('SQL Error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
        return;
      }

      // Om inga moduler hittades, skapa ett resultat med 0 som modul för alla användare
      if (rows && rows.length > 0) {
        console.log('Latest modules retrieved for all participants:', rows);
        res.status(200).json({ modules: rows });
      } else {
        // Om inga moduler finns, skapa en tom lista med defaultvärde för varje användare (userId, selectedModule = 0)
        console.log('No modules found for any participant.');
        // Här borde du lägga till en lista över alla användare som inte har en modul
        // T.ex. hämta alla användare från en användartabell och ge dem `selectedModule = 0`
        const usersQuery = `SELECT userId FROM users`; // Exempel på query för att hämta alla användare
        db.all(usersQuery, [], (err, users) => {
          if (err) {
            console.error('Error fetching users:', err);
            res.status(500).json({ message: 'Database error', error: err.message });
            return;
          }

          // Skapa en lista med användare och sätt default `selectedModule = 0`
          const defaultModules = users.map(user => ({ userId: user.userId, selectedModule: 0 }));
          console.log('No modules found, assigning default module 0 to all users:', defaultModules);
          res.status(200).json({ modules: defaultModules });
        });
      }
    });
  } catch (error) {
    console.error('Unexpected server error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});




// POST-rutt för att skicka meddelande
router.post('/sendMessage', async (req, res) => {
  const { userId, text, timestamp, role } = req.body;

  console.log('POST /sendMessage called with body:', req.body); // Logga hela request-body

  // Kontrollera att alla nödvändiga fält finns med
  if (!userId || !text || !role) {
    console.error('Missing fields in request:', { userId, text, role }); // Logga saknade fält
    return res.status(400).json({ message: 'User ID, message text, and role are required.' });
  }

  try {
    const query = `
      INSERT INTO messages (userId, text, timestamp, role, read)
      VALUES (?, ?, ?, ?, ?)
    `;
    console.log('Executing query:', query);
    console.log('With values:', [userId, text, timestamp, role, 0]); // Lägg till '0' för 'read'

    db.run(query, [userId, text, timestamp, role, 0], function (err) {
      if (err) {
        console.error('SQL Error during INSERT:', err); // Logga databasfel
        res.status(500).json({ message: 'Database error', error: err.message });
        return;
      }

      console.log('Message successfully inserted with ID:', this.lastID); // Logga den nya radens ID
      res.status(200).json({
        message: 'Message sent successfully',
        id: this.lastID,
        userId,
        text,
        timestamp,
        role,
        read: 0 // Skickar tillbaka read-status som 0 (oläst)
      });
    });
  } catch (error) {
    console.error('Unexpected server error in POST /sendMessage:', error); // Logga oväntade serverfel
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});



// POST-rutt för att markera ett meddelande som läst
router.post('/markMessageAsRead/:messageId', async (req, res) => {
  const { messageId } = req.params;

  // Kontrollera om messageId finns med
  if (!messageId) {
    console.error('Error: Missing messageId');
    return res.status(400).json({ message: 'Message ID is required.' });
  }

  console.log(`POST request to mark message as read with messageId: ${messageId}`);

  try {
    // SQL-query för att uppdatera 'read' statusen för meddelandet
    const query = `
      UPDATE messages
      SET read = 1
      WHERE id = ?
    `;

    console.log('Executing query to mark message as read:', query);
    console.log('With messageId:', messageId);

    db.run(query, [messageId], function (err) {
      if (err) {
        console.error('SQL Error during update:', err); // Logga SQL-fel
        return res.status(500).json({ message: 'Database error', error: err.message });
      }

      if (this.changes === 0) {
        console.log(`No message found with id: ${messageId}`); // Logga om inget meddelande uppdaterades
        return res.status(404).json({ message: 'Message not found' });
      }

      console.log(`Message with ID ${messageId} marked as read successfully`); // Logga om meddelandet markeras som läst
      res.status(200).json({ message: 'Message marked as read', messageId });
    });
  } catch (error) {
    console.error('Unexpected server error:', error); // Logga oväntade serverfel
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// GET-rutt för att hämta meddelanden för en specifik användare
router.get('/getMessages/:userId', (req, res) => {
  const userId = req.params.userId;

  const query = `
    SELECT * FROM messages WHERE userId = ?
  `;

  db.all(query, [userId], (err, rows) => {
    if (err) {
      console.error('Error fetching messages:', err);
      res.status(500).json({ message: 'Database error', error: err.message });
      return;
    }

    // Om inga meddelanden finns, returnera en tom lista istället för 404
    if (rows && rows.length > 0) {
      console.log('Messages retrieved for user:', userId, rows);
      res.status(200).json(rows);
    } else {
      console.log('No messages found for user:', userId);
      res.status(200).json([]);  // Returnera en tom lista istället för 404
    }
  });
});





// Funktion för att beräkna positiv feedback baserat på förändringar mellan första och sista rating
function getFeedbackForChange(firstRating, lastRating) {
  if (!firstRating || !lastRating) {
    return { message: 'Det verkar som att du inte har några skattningar ännu. Börja med att göra en skattning för att få feedback!' };
  }

  // Lista på de områden vi vill ge feedback för
  const areas = [
    'hälsa', 
    'vardag', 
    'kunskap_om_att_nå_arbete', 
    'klara_av_arbete', 
    'kompetenser', 
    'samarbetsförmåga', 
    'kommunikation', 
    'motivation'
  ];

  let improvedAreas = [];  // Här samlar vi områden som har förbättrats

  // Jämför varje område och samla de som har förbättrats
  areas.forEach(area => {
    const firstValue = firstRating[area];
    const lastValue = lastRating[area];

    if (firstValue < lastValue) {
      improvedAreas.push(area);
    }
  });

  // Om det finns förbättringar, ge positiv feedback för dem
  if (improvedAreas.length > 0) {
    const areasList = improvedAreas.map(area => capitalize(area)).join(", ");
    return { 
      message: `Du har gjort positiva framsteg inom områdena: ${areasList}. Fortsätt så här, bra jobbat!` 
    };
  } else {
    return { message: 'Bra jobbat för att bibehålla resultatet! Fortsätt på den positiva vägen!' };
  }
}

// Hjälpfunktion för att capitalisera det första bokstaven i varje område
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}




// Rutt för att hämta feedback baserat på förändring mellan första och sista rating
router.get('/getFeedbackForChange/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    console.log('Försöker hämta feedback för användare:', userId);

    // Hämta första ratingen
    const stmtFirst = db.prepare(`
      SELECT * 
      FROM ratings
      WHERE user_id = ?
      ORDER BY created_at ASC
      LIMIT 1
    `);
    
    // Hämta sista ratingen
    const stmtLast = db.prepare(`
      SELECT * 
      FROM ratings
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    // Hämta första och sista ratingen asynkront
    const firstRating = await new Promise((resolve, reject) => {
      stmtFirst.get(userId, (err, row) => {
        if (err) {
          console.error('Fel vid hämtning av första ratingen:', err.message);
          reject('Fel vid hämtning av första ratingen');
        } else {
          console.log('Första ratingen:', row);
          resolve(row);  // returnera raden för första ratingen
        }
      });
    });

    const lastRating = await new Promise((resolve, reject) => {
      stmtLast.get(userId, (err, row) => {
        if (err) {
          console.error('Fel vid hämtning av sista ratingen:', err.message);
          reject('Fel vid hämtning av sista ratingen');
        } else {
          console.log('Sista ratingen:', row);
          resolve(row);  // returnera raden för sista ratingen
        }
      });
    });

    // Om första eller sista ratingen inte finns
    if (!firstRating || !lastRating) {
      return res.status(404).json({ message: 'Före och efter skattningar saknas för denna användare.' });
    }

    // Anropa funktionen för att få feedback baserat på förändringarna
    const feedback = getFeedbackForChange(firstRating, lastRating);

    // Logga feedback för att säkerställa att det returneras korrekt
    console.log("Feedback som skickas tillbaka:", feedback);

    // Skicka tillbaka feedback som JSON
    res.status(200).json(feedback);

  } catch (error) {
    console.error('Fel vid beräkning av feedback:', error);
    res.status(500).json({ message: 'Något gick fel vid beräkning av feedback.' });
  }
});



const questions = [
  { id: 1, question: 'Hur upplever du dina framsteg mot självförsörjning?' },
  { id: 2, question: 'Hur väl har du följt den plan du satt upp för att bli självförsörjande?' },
  { id: 3, question: 'Hur motiverad känner du dig just nu att fortsätta med din resa mot självförsörjning?' },
  { id: 4, question: 'Hur realistiska känner du att dina mål är för att bli självförsörjande inom en snar framtid?' },
  { id: 5, question: 'Hur bra känner du att du har kontroll över din ekonomi just nu?' },
  { id: 6, question: 'Hur nöjd är du med din nuvarande arbetsförmåga och hur den utvecklas?' },
  { id: 7, question: 'Hur bra tycker du att du hanterar stressen och pressen som kan uppstå under din resa mot självförsörjning?' },
  { id: 8, question: 'Hur säker känner du dig på att du kan klara av de utmaningar som uppstår på vägen till självförsörjning?' },
  { id: 9, question: 'Hur bra tycker du att du kan balansera dina arbetsrelaterade uppgifter med andra aspekter av ditt liv (t.ex. familj, fritid, hälsa)?' },
  { id: 10, question: 'Hur väl känner du att du får det stöd du behöver från dina insatser och din omgivning?' }
];

// Funktion för att hämta aktuell fråga baserat på veckodifferens
function getCurrentQuestion() {
  const startDate = moment('2024-01-01'); // Startdatum för första frågan
  const today = moment();
  const weeksElapsed = today.diff(startDate, 'weeks');  // Antal veckor sedan startdatum

  // Välj en fråga baserat på hur många veckor som har gått
  const questionIndex = weeksElapsed % questions.length;  // Cirkulera genom frågorna

  return questions[questionIndex];  // Returnera den aktuella frågan
}

// Rutt för att hämta aktuell reflektion (fråga)
router.get('/getReflectionQuestion', (req, res) => {
  const currentQuestion = getCurrentQuestion();  // Hämta aktuell fråga
  return res.status(200).json(currentQuestion);  // Skicka tillbaka frågan
});

// Rutt för att kontrollera om det är dags att påminna användaren
router.get('/checkReflectionReminder/:userId', (req, res) => {
  const { userId } = req.params;
  console.log(`Begäran om påminnelse för användare: ${userId}`);

  // Hämta senaste reflektion från databasen
  const stmt = db.prepare(`
    SELECT submitted_at 
    FROM reflection_responses
    WHERE user_id = ? 
    ORDER BY submitted_at DESC 
    LIMIT 1
  `);

  stmt.get(userId, (err, row) => {
    if (err) {
      console.error('Fel vid hämtning av senaste reflektion:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av reflektion.' });
    }

    if (!row) {
      console.log(`Ingen reflektion hittades för användare: ${userId}`);
      return res.status(404).json({ message: 'Ingen reflektion hittades för användaren.' });
    }

    const lastSubmittedAt = moment(row.submitted_at);
    const oneWeekAgo = moment().subtract(7, 'days');  // Subtrahera 7 dagar för att kontrollera om en vecka har passerat

    if (lastSubmittedAt.isBefore(oneWeekAgo)) {
      return res.status(200).json({ message: 'Det har gått mer än en vecka. Påminnelse: Vänligen svara på reflektionen.' });
    } else {
      return res.status(200).json({ message: 'Du har svarat på reflektionen nyligen.' });
    }
  });

  stmt.finalize();  // Stänger SQL-frågan
});

// POST-rutt för att ta emot reflektioner och spara svar i databasen
router.post('/submitReflection', (req, res) => {
  const { userId, questionId, answer } = req.body;

  // Kontrollera att alla fält är ifyllda
  if (!userId || !questionId || !answer) {
    return res.status(400).json({ message: 'Felaktig data. Se till att alla fält är ifyllda.' });
  }

  // Validera att data är av rätt typ
  if (typeof userId !== 'number' || typeof questionId !== 'number' || typeof answer !== 'string') {
    return res.status(400).json({ message: 'Felaktig datatyp. Kontrollera att data är korrekt.' });
  }

  const submittedAt = new Date().toISOString();  // Aktuell tid som ISO-format

  // SQL-fråga för att spara svaret i databasen
  const stmt = db.prepare(`
    INSERT INTO reflection_responses (user_id, question_id, answer, submitted_at)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(userId, questionId, answer, submittedAt, function (err) {
    if (err) {
      console.error('Fel vid lagring av svar:', err.message);
      return res.status(500).json({ message: 'Något gick fel vid lagring av ditt svar.' });
    }

    return res.status(200).json({ message: 'Ditt svar har sparats!' });
  });

  stmt.finalize();  // Stänger SQL-frågan
});

// GET-rutt för att hämta alla reflektioner för en specifik användare
router.get('/getReflectionsByUser', (req, res) => {
  const { userId } = req.query;

  // Kontrollera att userId finns med i frågan
  if (!userId) {
    return res.status(400).json({ message: 'Felaktig förfrågan. userId måste anges.' });
  }

  // Validera att userId är av rätt typ (nummer)
  if (isNaN(userId)) {
    return res.status(400).json({ message: 'Felaktig datatyp. userId måste vara en siffra.' });
  }

  // SQL-fråga för att hämta alla reflektioner för användaren, inklusive id
  const stmt = db.prepare(`
    SELECT id, user_id, question_id, answer, submitted_at, read
    FROM reflection_responses
    WHERE user_id = ?
  `);

  stmt.all(userId, (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av reflektioner:', err.message);
      return res.status(500).json({ message: 'Något gick fel vid hämtning av dina reflektioner.' });
    }

    // Om inga svar hittas
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Inga reflektioner hittades för den angivna användaren.' });
    }

    // Om svar hittas, returnera dem
    return res.status(200).json({ data: rows });
  });

  stmt.finalize();  // Stänger SQL-frågan
});

router.post('/markReflectionAsRead/:reflectionId', async (req, res) => {
  const { reflectionId } = req.params;

  if (!reflectionId) {
    return res.status(400).json({ message: 'Reflection ID is required.' });
  }

  const query = `
    UPDATE reflection_responses
    SET read = 1
    WHERE id = ?
  `;

  db.run(query, [reflectionId], function (err) {
    if (err) {
      console.error('SQL Error:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: 'Reflection not found' });
    }

    res.status(200).json({ success: true });  // Endast success status
  });
});



// POST-rutt för att spara ett mål
router.post('/goals', (req, res) => {
  const { userId, specificGoal, measurableOutcome, acceptedGoal, realisticGoal, responsibility, endDate } = req.body;

  // Logga inkommande data
  console.log('Inkommande request för att skapa mål:', {
    userId,
    specificGoal,
    measurableOutcome,
    acceptedGoal,
    realisticGoal,
    responsibility,
    endDate
  });

  // Validera att alla fält finns med
  if (!userId || !specificGoal || !measurableOutcome || !acceptedGoal || !realisticGoal || !responsibility || !endDate) {
    console.error('Fel: Alla fält är obligatoriska');
    return res.status(400).json({ error: 'Alla fält är obligatoriska' });
  }

  // SQL-fråga för att skapa målet och samtidigt hämta användarens namn
  const sql = `
    INSERT INTO goals (userId, name, specificGoal, measurableOutcome, acceptedGoal, realisticGoal, responsibility, endDate) 
    SELECT ?, users.name, ?, ?, ?, ?, ?, ?
    FROM users
    WHERE users.id = ?;
  `;
  
  db.run(sql, [userId, specificGoal, measurableOutcome, acceptedGoal, realisticGoal, responsibility, endDate, userId], function(err) {
    if (err) {
      console.error('Fel vid inläsning av SQL:', err);
      return res.status(500).json({ error: 'Det gick inte att spara målet' });
    }

    // Logga när målet har sparats
    console.log('Mål sparat med ID:', this.lastID);

    // Returnera det skapade målet med dess ID och namn
    res.status(201).json({
      id: this.lastID,
      userId,
      name: req.body.name,  // Användarnamn från users tabellen
      specificGoal,
      measurableOutcome,
      acceptedGoal,
      realisticGoal,
      responsibility,
      endDate,
    });
  });
});



// GET-rutt för att hämta alla mål för en specifik användare
router.get('/goals/:userId', (req, res) => {
  const { userId } = req.params;

  // Logga inkommande request
  console.log('Inkommande GET-request för att hämta mål för användare med userId:', userId);

  db.all('SELECT * FROM goals WHERE userId = ?', [userId], (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av data:', err);
      return res.status(500).json({ error: 'Det gick inte att hämta målen' });
    }

    // Logga resultatet från databasen
    console.log('Hämtade mål för användare:', rows);

    res.status(200).json(rows);
  });
});

// Skapa en POST-rutt för att skapa en ny uppgift
router.post('/tasks', (req, res) => {
  const { taskName, dueDate, responsiblePerson, goalId, userId } = req.body;

  console.log('Mottagen uppgift:', req.body);
  console.log('taskName:', taskName);
  console.log('dueDate:', dueDate);
  console.log('responsiblePerson:', responsiblePerson);
  console.log('goalId:', goalId);
  console.log('userId:', userId);

  if (!taskName || !dueDate || !responsiblePerson || !goalId || !userId) {
    console.error('Fel: Alla fält måste vara ifyllda.');
    return res.status(400).json({ error: 'Alla fält måste vara ifyllda' });
  }

  if (isNaN(goalId)) {
    console.error('Fel: goalId måste vara ett giltigt nummer.');
    return res.status(400).json({ error: 'goalId måste vara ett giltigt nummer' });
  }

  db.run(
    'INSERT INTO tasks (taskName, dueDate, responsiblePerson, goalId, userId) VALUES (?, ?, ?, ?, ?)',
    [taskName, dueDate, responsiblePerson, goalId, userId],
    function (err) {
      if (err) {
        console.error('Fel vid skapande av uppgift:', err);
        return res.status(500).json({ error: 'Det gick inte att spara uppgiften' });
      }

      res.status(201).json({
        id: this.lastID, // ID genererat av databasen
        taskName,
        dueDate,
        responsiblePerson,
        goalId,
        userId,
      });
    }
  );
});

// Skapa en DELETE-rutt för att ta bort en uppgift
router.delete('/tasks/:taskId', (req, res) => {
  const { taskId } = req.params; // Hämta taskId från URL-parametern

  console.log('Mottaget taskId för borttagning:', taskId);

  // Kontrollera om taskId är ett giltigt nummer
  if (isNaN(taskId)) {
    console.error('Fel: taskId måste vara ett giltigt nummer.');
    return res.status(400).json({ error: 'taskId måste vara ett giltigt nummer' });
  }

  // Ta bort uppgiften från databasen
  db.run(
    'DELETE FROM tasks WHERE id = ?',
    [taskId],
    function (err) {
      if (err) {
        console.error('Fel vid borttagning av uppgift:', err);
        return res.status(500).json({ error: 'Det gick inte att ta bort uppgiften' });
      }

      // Kontrollera om någon rad blev påverkad (det vill säga att uppgiften faktiskt fanns)
      if (this.changes === 0) {
        console.log('Ingen uppgift hittades med det angivna taskId.');
        return res.status(404).json({ error: 'Uppgift inte funnen' });
      }

      // Svara med ett framgångsmeddelande
      res.status(200).json({ message: 'Uppgift borttagen framgångsrikt' });
    }
  );
});

router.get('/tasks/:userId', (req, res) => {
  const { userId } = req.params;

  // Debugging: Logga userId
  console.log('Hämtar uppgifter för användare med ID:', userId);

  if (isNaN(userId)) {
    console.error('Fel: userId är ogiltigt.');
    return res.status(400).json({ error: 'userId måste vara ett giltigt nummer' });
  }

  db.all('SELECT * FROM tasks WHERE userId = ?', [userId], (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av uppgifter:', err);
      return res.status(500).json({ error: 'Det gick inte att hämta uppgifter' });
    }

    // Debugging: Logga resultat från databasen
    console.log('Hämtade uppgifter:', rows);

    if (rows.length === 0) {
      // Om inga uppgifter hittas, returnera 0 istället för ett felmeddelande
      return res.status(200).json({ tasks: 0 });
    }

    res.status(200).json(rows);
  });
});



// PUT-rutt för att uppdatera statusen för mål
router.put('/goals/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validera att status är korrekt
  if (status !== 'completed' && status !== 'pending') {
    return res.status(400).json({ error: 'Ogiltig status' });
  }

  // Uppdatera mål i databasen
  db.run(
    'UPDATE goals SET completed = ? WHERE id = ?',
    [status === 'completed' ? 1 : 0, id], // Om status är "completed" sätts 1, annars 0
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Det gick inte att uppdatera målet' });
      }
      res.status(200).json({ message: 'Målet uppdaterades' });
    }
  );
});

// PUT-rutt för att uppdatera statusen för uppgifter
router.put('/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Kontrollera om status är antingen 'completed' eller 'pending'
  if (status !== 'completed' && status !== 'pending') {
    console.log('Fel status skickades:', status);
    return res.status(400).json({ error: 'Ogiltig status' });
  }

  console.log(`Försöker uppdatera uppgift med ID: ${id}, status: ${status}`);

  // Uppdatera uppgiftens status i databasen (korrekt kolumnnamn är 'status', inte 'completed')
  db.run(
    'UPDATE tasks SET status = ? WHERE id = ?',
    [status, id], // Skicka den nya statusen
    function (err) {
      if (err) {
        console.error('Fel vid uppdatering av uppgift:', err.message);
        return res.status(500).json({ error: 'Det gick inte att uppdatera uppgiften' });
      }

      console.log(`Uppgift med ID: ${id} uppdaterades med status: ${status}`);
      res.status(200).json({ message: 'Uppgiften uppdaterades' });
    }
  );
});


// POST-rutt för att spara anteckningar
router.post('/notes', (req, res) => {
  console.log('Mottagen POST-begäran på /api/notes');
  
  const { userId, notes } = req.body;

  // Validera att användar-ID och anteckningar finns med
  if (!userId || !notes) {
    console.log('Fel: Användar-ID eller anteckningar saknas');
    return res.status(400).json({ message: 'Användar-ID och anteckningar måste fyllas i.' });
  }

  // Spara anteckningen i databasen
  const query = `INSERT INTO notes (userId, notes) VALUES (?, ?)`;
  db.run(query, [userId, notes], function(err) {
    if (err) {
      console.error('Fel vid sparande av anteckning:', err.message);
      return res.status(500).json({ message: 'Något gick fel vid sparande av anteckning.' });
    }

    // Skicka tillbaka den sparade anteckningen
    res.status(201).json({
      message: 'Anteckning sparad',
      note: {
        id: this.lastID, // ID för den senaste anteckningen som sparades
        userId,
        notes,
        createdAt: new Date().toISOString(), // Skapa en egen createdAt-tid om du vill
      },
    });
  });
});

// GET-rutt för att hämta den senaste anteckningen för en specifik användare
router.get('/notes/latest/:userId', (req, res) => {
  console.log('Mottagen GET-begäran på /api/notes/latest/:userId');

  const { userId } = req.params; // Hämta userId från URL-parametern

  // Validera att userId finns med
  if (!userId) {
    return res.status(400).json({ message: 'Användar-ID måste anges.' });
  }

  // SQL-fråga för att hämta den senaste anteckningen för den specifika användaren
  const query = `
    SELECT * FROM notes
    WHERE userId = ?
    ORDER BY createdAt DESC
    LIMIT 1
  `;

  db.get(query, [userId], (err, row) => {
    if (err) {
      console.error('Fel vid hämtning av anteckning:', err.message);
      return res.status(500).json({ message: 'Något gick fel vid hämtning av anteckning.' });
    }

    if (!row) {
      return res.status(404).json({ message: 'Ingen anteckning hittades för denna användare.' });
    }

    // Skicka tillbaka den senaste anteckningen
    res.status(200).json({
      message: 'Senaste anteckning hämtad',
      note: row
    });
  });
});

router.get('/notes/:userId', (req, res) => {
  console.log('Mottagen GET-begäran på /api/notes/:userId');

  const { userId } = req.params; // Hämta userId från URL-parametern

  // Validera att userId finns med
  if (!userId) {
    return res.status(400).json({ message: 'Användar-ID måste anges.' });
  }

  // SQL-fråga för att hämta alla anteckningar för den specifika användaren
  const query = `
    SELECT * FROM notes
    WHERE userId = ?
    ORDER BY createdAt DESC
  `;

  db.all(query, [userId], (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av anteckningar:', err.message);
      return res.status(500).json({ message: 'Något gick fel vid hämtning av anteckningar.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Inga anteckningar hittades för denna användare.' });
    }

    // Skicka tillbaka alla anteckningar
    res.status(200).json({
      message: 'Anteckningar hämtade',
      notes: rows
    });
  });
});


// POST-endpoint för att ta emot tidrapporter
router.post('/timereports', (req, res) => {
  const timeReports = req.body;

  // Kontrollera att vi har tidrapporter i rätt format
  if (!Array.isArray(timeReports) || timeReports.length === 0) {
    return res.status(400).json({ message: 'Ingen tidrapport att skicka.' });
  }

  // Logga de mottagna tidrapporterna för att se dem i serverns konsol
  console.log('Mottagna tidrapporter:', JSON.stringify(timeReports, null, 2));

  // Förbered SQL-frågan för att lägga till rapporterna i databasen
  const insertReport = db.prepare(`
    INSERT INTO TimeReports (userId, datum, starttid, sluttid, frånvaroorsak, annanOrsak)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Lägg till varje tidrapport i databasen
  timeReports.forEach(report => {
    insertReport.run(
      report.userId,       // Lägg till userId här
      report.datum,
      report.starttid,
      report.sluttid,
      report.frånvaroorsak,
      report.annanOrsak || null
    );
  });

  insertReport.finalize(() => {
    // Logga att rapporterna har sparats
    console.log('Tidrapporter sparade i databasen.');
    res.status(201).json({ message: 'Tidrapporter mottagna och sparade.' });
  });
});

router.get('/timereports/:id', (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  // Bygg SQL-frågan
  let query = `SELECT * FROM TimeReports WHERE userId = ?`;
  const values = [id];

  // Lägg till datumintervall om det finns
  if (startDate && endDate) {
    query += ` AND datum BETWEEN ? AND ?`;
    values.push(startDate, endDate);
  }

  console.log('Generated SQL Query:', query);
  console.log('Values:', values);

  // Kör SQL-frågan med db.all() för att hämta alla resultat
  db.all(query, values, (err, rows) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Database query failed' });
    }

    console.log('Query Results:', rows);
    res.json(rows); // Skicka resultaten som JSON
  });
});

// POST-rutt för att spara uppföljning
router.post('/followup', (req, res) => {
  console.log('Mottagen POST-begäran på /api/followup');
  
  const { followUpDate, followUpTime, followUpLocation, userId } = req.body;

  // Validera att användar-ID och uppföljningsdata finns med
  if (!userId || !followUpDate || !followUpTime || !followUpLocation) {
    console.log('Fel: Användar-ID eller uppföljningsdata saknas');
    return res.status(400).json({ message: 'Användar-ID, uppföljningsdatum, tid och plats måste fyllas i.' });
  }

  // Spara uppföljningen i databasen
  const query = `INSERT INTO followups (userId, followUpDate, followUpTime, followUpLocation) VALUES (?, ?, ?, ?)`;
  db.run(query, [userId, followUpDate, followUpTime, followUpLocation], function(err) {
    if (err) {
      console.error('Fel vid sparande av uppföljning:', err.message);
      return res.status(500).json({ message: 'Något gick fel vid sparande av uppföljning.' });
    }

    // Skicka tillbaka den sparade uppföljningen
    res.status(201).json({
      message: 'Uppföljning sparad',
      followUp: {
        id: this.lastID, // ID för den senaste uppföljningen som sparades
        userId,
        followUpDate,
        followUpTime,
        followUpLocation,
        createdAt: new Date().toISOString(), // Skapa en egen createdAt-tid om du vill
      },
    });
  });
});

router.get('/followup/soon', (req, res) => {
  console.log('Mottagen GET-begäran på /api/followup/soon');

  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  console.log('Seven Days Later:', sevenDaysLater.toISOString());

  // Modifierad SQL-fråga som JOIN:ar "followups" och "users"
  const query = `
    SELECT followups.id, followups.followUpDate, followups.followUpTime, followups.followUpLocation, followups.userId, users.name
    FROM followups 
    JOIN users ON followups.userId = users.id
    WHERE followups.followUpDate <= ? AND followups.followUpDate >= ?
  `;

  db.all(query, [sevenDaysLater.toISOString(), new Date().toISOString()], (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av uppföljningar:', err.message);
      return res.status(500).json({ message: 'Något gick fel vid hämtning av uppföljningar.' });
    }

    if (rows.length === 0) {
      console.log('Inga uppföljningar hittades.');
    } else {
      console.log('Hämtade uppföljningar:', rows);
    }

    res.status(200).json({ followUps: rows });
  });
});

// Rutt: Schemalägg ett meddelande
router.post('/scheduleMessage', (req, res) => {
  const { userId, text, scheduleDate, role, recurrence } = req.body;

  // Kontrollera att alla fält är med
  if (!userId || !text || !scheduleDate || !role || !recurrence) {
    return res.status(400).json({ error: 'Alla fält är obligatoriska.' });
  }

  // Validering av recurrence
  const validRecurrences = ['none', 'weekly', 'monthly'];
  if (!validRecurrences.includes(recurrence)) {
    return res.status(400).json({ error: 'Ogiltigt återkommande intervall. Ange "none", "weekly" eller "monthly".' });
  }

  // Beräkna nästa skickdatum om det är återkommande
  let nextSendDate = new Date(scheduleDate);
  if (recurrence === 'weekly') {
    nextSendDate.setDate(nextSendDate.getDate() + 7); // Lägg till 7 dagar för varje vecka
  } else if (recurrence === 'monthly') {
    nextSendDate.setMonth(nextSendDate.getMonth() + 1); // Lägg till 1 månad för varje månad
  }

  // Logga datan för att säkerställa korrekt värde på recurrence och nextSendDate
  console.log('Meddelande:', { userId, text, scheduleDate, role, recurrence, nextSendDate: nextSendDate.toISOString() });

  const query = `
    INSERT INTO scheduled_messages (userId, text, scheduleDate, role, recurrence, nextSendDate)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [userId, text, scheduleDate, role, recurrence, nextSendDate.toISOString()], function (err) {
    if (err) {
      console.error('Fel vid insättning i scheduled_messages:', err.message);
      return res.status(500).json({ error: 'Kunde inte schemalägga meddelandet.', details: err.message });
    }

    // Svara med det nya meddelandet som har schemalagts
    res.status(201).json({
      id: this.lastID,
      userId,
      text,
      scheduleDate,
      role,
      recurrence,
      nextSendDate: nextSendDate.toISOString(),
    });
  });
});



// Hämta och skicka schemalagda meddelanden för en specifik användare
router.get('/processScheduledMessages/:userId', (req, res) => {
  const { userId } = req.params; // Hämta userId från URL-parametrar
  const now = new Date().toISOString(); // Hämta nuvarande tid i ISO-format

  // Hämta alla schemalagda meddelanden för den specifika användaren utan "read"-hantering
  const fetchQuery = `
    SELECT id, userId, text, scheduleDate, role, recurrence, nextSendDate
    FROM scheduled_messages
    WHERE userId = ? AND scheduleDate <= ?;
  `;

  db.all(fetchQuery, [userId, now], (err, scheduledMessages) => {
    if (err) {
      console.error('Fel vid hämtning av schemalagda meddelanden:', err.message);
      return res.status(500).json({ error: 'Kunde inte hämta schemalagda meddelanden.' });
    }

    if (scheduledMessages.length === 0) {
      return res.status(200).json({ message: 'Inga schemalagda meddelanden att bearbeta.' });
    }

    // Flytta meddelanden från scheduled_messages till messages
    const insertQuery = `
      INSERT INTO messages (userId, text, timestamp, role)
      VALUES (?, ?, ?, ?);
    `;

    const updateQuery = `
      UPDATE scheduled_messages
      SET scheduleDate = ?, nextSendDate = ?
      WHERE id = ?;
    `;

    // Loop genom varje schemalagt meddelande
    scheduledMessages.forEach((message) => {
      const { id, userId, text, scheduleDate, role, recurrence, nextSendDate } = message;

      // Infoga meddelandet i "messages"-tabellen
      db.run(insertQuery, [userId, text, scheduleDate, role], (err) => {
        if (err) {
          console.error('Fel vid flyttning av meddelande:', err.message);
        }
      });

      // Om meddelandet är återkommande, uppdatera scheduleDate och nextSendDate
      if (recurrence && recurrence !== 'none') {
        let nextScheduleDate;

        // Beräkna nästa sändningsdatum baserat på återkommande intervall
        if (recurrence === 'weekly') {
          nextScheduleDate = new Date(new Date(scheduleDate).getTime() + 7 * 24 * 60 * 60 * 1000); // Lägg till 7 dagar
        } else if (recurrence === 'monthly') {
          nextScheduleDate = new Date(new Date(scheduleDate).setMonth(new Date(scheduleDate).getMonth() + 1)); // Lägg till 1 månad
        }

        const newNextSendDate = nextScheduleDate.toISOString(); // Uppdatera nästa sändningsdatum

        // Uppdatera det återkommande meddelandets scheduleDate och nextSendDate i samma rad
        db.run(updateQuery, [nextScheduleDate.toISOString(), newNextSendDate, id], (err) => {
          if (err) {
            console.error('Fel vid uppdatering av schemalagt meddelande:', err.message);
          }
        });
      }
    });

    // Skicka svar
    res.status(200).json({
      message: 'Schemalagda meddelanden har bearbetats och skickats.',
      processed: scheduledMessages,
    });
  });
});



// Rutt: Hämta alla schemalagda meddelanden för en specifik användare
router.get('/getAllScheduledMessages/:userId', (req, res) => {
  const { userId } = req.params; // Hämta userId från URL-parametrar

  // Hämta alla schemalagda meddelanden för den specifika användaren (utan datumfilter)
  const fetchQuery = `
    SELECT id, userId, text, scheduleDate, role, recurrence, nextSendDate
    FROM scheduled_messages
    WHERE userId = ?;
  `;

  db.all(fetchQuery, [userId], (err, scheduledMessages) => {
    if (err) {
      console.error('Fel vid hämtning av schemalagda meddelanden:', err.message);
      return res.status(500).json({ error: 'Kunde inte hämta schemalagda meddelanden.' });
    }

    if (scheduledMessages.length === 0) {
      return res.status(200).json({ message: 'Inga schemalagda meddelanden.' });
    }

    // Skicka tillbaka de hämtade schemalagda meddelandena
    res.status(200).json({
      message: 'Schemalagda meddelanden hämtade.',
      scheduledMessages,
    });
  });
});

// Rutt för att ta bort ett schemalagt meddelande
router.delete('/deleteScheduledMessage/:messageId', (req, res) => {
  const { messageId } = req.params; // Hämta messageId från URL-parametrar

  const deleteQuery = `
    DELETE FROM scheduled_messages WHERE id = ?;
  `;

  db.run(deleteQuery, [messageId], function (err) {
    if (err) {
      console.error('Fel vid borttagning av schemalagt meddelande:', err.message);
      return res.status(500).json({ error: 'Kunde inte ta bort meddelandet.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Meddelandet hittades inte.' });
    }

    res.status(200).json({ message: 'Meddelandet har tagits bort.' });
  });
});


module.exports = router;
