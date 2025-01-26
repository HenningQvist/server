const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();

// Skapa en databasanslutning
const db = new sqlite3.Database('./platsbank.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

router.post('/savePlats', (req, res) => {
  const {
    name,
    type, // Utredande, Förberedande, Kompetenshöjande, Reguljär
    description,
    contactPerson,
    contactPhone,
    supervisor,
    supervisorPhone,
    status,
    startDate,
    endDate,
    kontaktad,
    contactEmail
  } = req.body;

  console.log('Mottagen POST-förfrågan:', req.body);

  // Kontrollera att alla nödvändiga fält finns
  if (!name || !type || !description || !contactPerson || !contactPhone || !supervisor || !supervisorPhone) {
    console.warn('Validering misslyckades: Alla fält måste fyllas i.');
    return res.status(400).json({ message: 'Alla fält måste fyllas i.' });
  }

  // Förbered SQL-fråga för att spara platsen
  const stmt = db.prepare(`
    INSERT INTO plats (
      name, 
      type, 
      description, 
      contactPerson, 
      contactPhone, 
      supervisor, 
      supervisorPhone,
      status,
      startDate,
      endDate,
      kontaktad,
      contactEmail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    name, 
    type, 
    description, 
    contactPerson, 
    contactPhone, 
    supervisor, 
    supervisorPhone,
    status || 'tillgänglig', // Sätt default status om den inte finns
    startDate || '', // Sätt default startDate om den inte finns
    endDate || '', // Sätt default endDate om den inte finns
    kontaktad || false, // Sätt default kontaktad om den inte finns
    contactEmail || '', // Sätt default contactEmail om den inte finns
    function (err) {
      if (err) {
        console.error('Fel vid körning av SQL-fråga:', err);
        return res.status(500).json({ message: 'Fel vid lagring av platsen', error: err.message });
      }

      const platsId = this.lastID;
      console.log('Plats sparad med ID:', platsId);

      // Skicka svar till klienten
      res.status(201).json({
        message: 'Plats sparad',
        id: platsId
      });
    }
  );

  stmt.finalize();
});


// GET-rutt för att hämta alla platser eller en specifik plats baserat på ID
router.get('/plats/:id?', (req, res) => {
  const { id } = req.params;

  console.log('Mottagen GET-förfrågan för plats med ID:', id);

  if (id) {
    const stmt = db.prepare('SELECT * FROM plats WHERE id = ?');

    stmt.get(id, (err, row) => {
      if (err) {
        console.error('Fel vid hämtning av plats:', err);
        return res.status(500).json({ message: 'Fel vid hämtning av plats', error: err.message });
      }

      if (!row) {
        console.warn('Plats med ID: ' + id + ' hittades inte.');
        return res.status(404).json({ message: 'Plats inte hittad.' });
      }

      console.log('Hämtade plats:', row);
      res.status(200).json(row);  // Returnera den hämtade platsen som JSON
    });

    stmt.finalize();
  } else {
    const stmt = db.prepare('SELECT * FROM plats');  // Hämtar alla platser

    stmt.all((err, rows) => {
      if (err) {
        console.error('Fel vid hämtning av platser:', err);
        return res.status(500).json({ message: 'Fel vid hämtning av platser', error: err.message });
      }

      if (rows.length === 0) {
        console.warn('Inga platser hittades.');
        return res.status(404).json({ message: 'Inga platser hittades.' });
      }

      console.log('Hämtade alla platser:', rows);
      res.status(200).json(rows);  // Returnera alla platser som JSON
    });

    stmt.finalize();
  }
});



module.exports = router;
