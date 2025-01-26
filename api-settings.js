const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();

// Skapa en databasanslutning (ändra till samma databasfil som du använder i server.js)
const db = new sqlite3.Database('./anvandare.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// GET-rutt för att hämta användarinställningar
router.get('/user-settings', (req, res) => {
  db.get('SELECT * FROM user_settings WHERE id = 1', [], (err, row) => {
    if (err) {
      console.error('Error fetching settings:', err.message);
      return res.status(500).json({ message: 'Fel vid hämtning av inställningar' });
    }
    if (!row) {
      return res.status(404).json({ message: 'Användarinställningar inte funna' });
    }

    res.json({
      visibility: {
        showTasks: Boolean(row.showTasks),
        showUserTasks: Boolean(row.showUserTasks),
        showGoals: Boolean(row.showGoals),
        showDecisions: Boolean(row.showDecisions),
        showNotes: Boolean(row.showNotes),
        showCharts: Boolean(row.showCharts),
        showInsatsChartTavla: Boolean(row.showInsatsChartTavla),
        showFollowUps: Boolean(row.showFollowUps), // Lägg till showFollowUps
      },
    });
  });
});

router.post('/user-settings', (req, res) => {
  // Hämta 'visibility' från requestens body
  const { visibility } = req.body;

  // Logga tiden när begäran tas emot
  console.log(`[${new Date().toISOString()}] Mottagen begäran för att uppdatera användarinställningar:`, visibility);

  // Kontrollera om 'visibility' skickades med i begäran
  if (!visibility) {
    console.error(`[${new Date().toISOString()}] Fel: Inga synlighetsinställningar skickades med begäran.`);
    return res.status(400).json({ message: 'Felaktiga inställningar' });
  }

  // Hämta varje enskild inställning från visibility
  const { 
    showTasks, 
    showUserTasks, 
    showGoals, 
    showDecisions, 
    showNotes, 
    showCharts, 
    showInsatsChartTavla, 
    showFollowUps 
  } = visibility; // Hämta 'showFollowUps' här också

  // Logga inställningarna som ska uppdateras i databasen
  console.log(`[${new Date().toISOString()}] Försöker uppdatera följande inställningar i databasen:`, {
    showTasks,
    showUserTasks,
    showGoals,
    showDecisions,
    showNotes,
    showCharts,
    showInsatsChartTavla,
    showFollowUps // Lägg till showFollowUps i loggningen
  });

  // Utför SQL-frågan för att uppdatera användarens inställningar i databasen
  db.run(
    `UPDATE user_settings SET showTasks = ?, showUserTasks = ?, showGoals = ?, showDecisions = ?, showNotes = ?, showCharts = ?, showInsatsChartTavla = ?, showFollowUps = ? WHERE id = 1`,
    [showTasks, showUserTasks, showGoals, showDecisions, showNotes, showCharts, showInsatsChartTavla, showFollowUps],  // Lägg till showFollowUps i arrayen
    (err) => {
      if (err) {
        // Logga fel om SQL-frågan misslyckas
        console.error(`[${new Date().toISOString()}] Fel vid uppdatering av inställningar i databasen:`, err.message);
        return res.status(500).json({ message: 'Fel vid uppdatering av inställningar' });
      }

      // Logga framgång om uppdateringen lyckades
      console.log(`[${new Date().toISOString()}] Inställningar uppdaterade framgångsrikt för användare med ID 1`);

      // Skicka tillbaka de uppdaterade inställningarna som svar
      res.status(200).json({
        message: 'Inställningar uppdaterade',
        visibility: { 
          showTasks, 
          showUserTasks, 
          showGoals, 
          showDecisions, 
          showNotes, 
          showCharts, 
          showInsatsChartTavla, 
          showFollowUps // Lägg till showFollowUps här i svaret också
        },
      });
    }
  );
});


module.exports = router;
