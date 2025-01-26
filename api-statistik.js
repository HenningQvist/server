const express = require('express');
const sqlite3 = require('sqlite3');  // Importera sqlite3 med require
const router = express.Router();

const db = new sqlite3.Database('./my_app_database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Andra databasanslutningen för insatser.db
const db2 = new sqlite3.Database('./insatser.db', (err) => {
  if (err) {
    console.error('Error opening database (insatser.db):', err.message);
  } else {
    console.log('Connected to the insatser.db database.');
  }
});

router.get('/users/stats/yearly', (req, res) => {
  const { year } = req.query;  // Hämta år från query-parametern

  // Sätt ett standardår om inget år anges (t.ex. 2024)
  const selectedYear = year || '2024';

  db.all(`
    SELECT strftime('%m', created_at) AS month, COUNT(*) AS user_count
    FROM users
    WHERE strftime('%Y', created_at) = ?
    GROUP BY month
    ORDER BY month
  `, [selectedYear], (err, rows) => {
    if (err) {
      console.error('Error fetching stats:', err);
      return res.status(500).json({ message: 'Error fetching stats.' });
    }

    // Om inga data hittas, skicka tomma resultat för månadsstatistik
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'
    ];

    // Skapa en array med användartillväxt per månad, fyll i 0 för månader som saknas i databasen
    const userCounts = months.map((month, index) => {
      const row = rows.find(r => parseInt(r.month, 10) === index + 1);
      return row ? row.user_count : 0;  // Returnera 0 om ingen data för den månaden
    });

    // Beräkna kumulativ användartillväxt
    let cumulativeCount = 0;
    const cumulativeCounts = userCounts.map(count => {
      cumulativeCount += count;  // Lägg till varje månads användartillväxt till den kumulativa summan
      return cumulativeCount;
    });

    // Sätt samman resultatet
    res.status(200).json({
      months,
      userCounts,
      cumulativeCounts
    });
  });
});


// GET-rutt för att hämta statistik för deltagare per modul
router.get('/modules/stats', (req, res) => {
  const query = `
    SELECT selectedModule, COUNT(DISTINCT userId) AS participant_count
    FROM modules
    WHERE rowid IN (
      SELECT MAX(rowid)  -- Väljer den senaste raden för varje userId
      FROM modules
      GROUP BY userId
    )
    GROUP BY selectedModule
    ORDER BY participant_count DESC
  `;

  db.all(query, (err, rows) => {
    if (err) {
      console.error('Error fetching module stats:', err);
      return res.status(500).json({ message: 'Error fetching module statistics.' });
    }

    // Returnera statistik för moduler
    res.status(200).json({
      modules: rows.map(row => ({
        selectedModule: row.selectedModule,
        participantCount: row.participant_count
      }))
    });
  });
});

// GET-rutt för att hämta alla skattningar för alla användare för specifika år och kategorier
router.get('/getAllRatingsForYears/:category', (req, res) => {
  const { category } = req.params;
  const years = ['2024', '2025', '2026', '2027', '2028']; // Specifika år

  // SQL-fråga för att hämta alla skattningar per kategori och år
  const stmt = db.prepare(`
    SELECT strftime('%Y', created_at) AS year, AVG(${category}) AS avg_rating
    FROM ratings
    WHERE strftime('%Y', created_at) IN ('2024', '2025', '2026', '2027', '2028')
    GROUP BY year
    ORDER BY year ASC
  `);

  stmt.all((err, rows) => {
    if (err) {
      console.error('Error fetching ratings for category:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av skattningar.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Inga skattningar hittades för denna kategori.' });
    }

    res.status(200).json(rows); // Returnera genomsnittlig skattning per år för kategorin
  });

  stmt.finalize();
});

router.get('/getAllProgressions', (req, res) => {
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
      console.error('Error fetching progressions:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av progressioner.' });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Inga progressioner hittades.' });
    }

    const positiveProgressions = [];
    const negativeProgressions = [];
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

    // Logga raw data innan bearbetning
    console.log("Raw data from database:", rows);

    // Loop through the unique users
    const userRatings = {};

    rows.forEach((row) => {
      const userId = row.user_id;

      // If we haven't processed this user before, initialize their ratings
      if (!userRatings[userId]) {
        userRatings[userId] = {
          firstRating: null,
          lastRating: null
        };
      }

      // Assign first and last ratings for the user
      if (!userRatings[userId].firstRating || row.created_at < userRatings[userId].firstRating.created_at) {
        userRatings[userId].firstRating = row; // First rating (earliest date)
      }

      if (!userRatings[userId].lastRating || row.created_at > userRatings[userId].lastRating.created_at) {
        userRatings[userId].lastRating = row; // Last rating (latest date)
      }
    });

    // Now, loop through each user's ratings to calculate progressions
    Object.values(userRatings).forEach(({ firstRating, lastRating }) => {
      if (firstRating && lastRating) {
        fields.forEach(field => {
          const firstValue = firstRating[field];
          const lastValue = lastRating[field];

          // Kontrollera om det finns värden
          if (firstValue != null && lastValue != null) {
            // Calculate change with last value minus first value
            const change = lastValue - firstValue; 

            // Logga skillnaden
            console.log(`${field}: first = ${firstValue}, last = ${lastValue}, change = ${change}`);

            if (change > 0) {
              // Positive progression
              positiveProgressions.push({
                user_id: firstRating.user_id,
                field,
                first: firstValue,
                last: lastValue,
                first_created_at: firstRating.created_at,
                last_created_at: lastRating.created_at
              });
            } else if (change < 0) {
              // Negative progression
              negativeProgressions.push({
                user_id: firstRating.user_id,
                field,
                first: firstValue,
                last: lastValue,
                first_created_at: firstRating.created_at,
                last_created_at: lastRating.created_at
              });
            }
          }
        });
      } else {
        console.error('Missing data for first or last rating for user_id:', firstRating.user_id);
      }
    });

    // Logga den slutliga datan som skickas till frontend
    console.log("Positive progressions:", positiveProgressions);
    console.log("Negative progressions:", negativeProgressions);

    // Return both positive and negative progressions
    res.status(200).json({ positiveProgressions, negativeProgressions });
  });

  stmt.finalize();
});

router.get('/activeDecisions', async (req, res) => {
  console.log('GET /activeDecisions - Hämtar alla insatser och deras respektive start- och slutdatum från insatser.db.');

  try {
    // SQL-fråga för att hämta alla insatser och deras start- och slutdatum
    const query = `
      SELECT interventionName, startDate, endDate, userId
      FROM user_interventions
    `;

    console.log('SQL Query:', query);
    
    // Hämta alla insatser från insatser.db
    db2.all(query, [], (err, rows) => {
      if (err) {
        console.error('Fel vid hämtning av insatser:', err.message);
        return res.status(500).json({ error: 'Kunde inte hämta insatser.' });
      }

      console.log('Antal rader:', rows.length);  // Logga antalet rader som returneras
      if (rows.length === 0) {
        console.log('Inga insatser hittades.');
        return res.status(404).json({ message: 'Inga insatser hittades.' });
      }

      // Skicka tillbaka alla insatser separat utan att gruppera dem
      res.status(200).json({
        interventions: rows.map(row => ({
          interventionName: row.interventionName,
          startDate: row.startDate,
          endDate: row.endDate,
          userId: row.userId
        }))
      });
    });
  } catch (err) {
    console.error('Fel vid databasoperation:', err);
    res.status(500).json({ error: 'Kunde inte hämta insatser.' });
  }
});

router.get('/plans/notRenewed', (req, res) => {
  const { year } = req.query;  // Hämta det valda året från query-parametern

  // Kontrollera om år är tillgängligt i query-parametern
  if (!year) {
    return res.status(400).json({ message: 'År måste specificeras.' });
  }

  // SQL-fråga för att hämta handlingsplaner som inte har förnyats inom 30 dagar
  const query = `
    SELECT 
      strftime('%Y', created_at) AS year,
      COUNT(*) AS total_plans,
      SUM(CASE WHEN julianday('now') - julianday(created_at) > 30 THEN 1 ELSE 0 END) AS not_renewed_count
    FROM comments
    WHERE strftime('%Y', created_at) = ?
    GROUP BY year;
  `;

  // Logga SQL-frågan för att säkerställa korrekthet
  console.log('Executing SQL Query:', query);

  // Kör SQL-frågan med det valda året
  db.all(query, [year], (err, rows) => {
    if (err) {
      console.error('Error fetching data:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av data.' });
    }

    // Logga resultatet av frågan
    console.log('Query Result:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Inga handlingsplaner hittades för det valda året.' });
    }

    // Returnera resultaten om de finns
    res.status(200).json(rows);
  });
});



// Exportera routern för användning i server.js
module.exports = router;
