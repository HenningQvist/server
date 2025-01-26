const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

// Skapa en databasanslutning
const db = new sqlite3.Database('./insatser.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Konfigurera multer för att hantera uppladdning av filer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Ange mappen där filerna ska sparas
  },
  filename: (req, file, cb) => {
    // Ge filen ett unikt namn (med tidsstämpel)
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});

const upload = multer({ storage: storage });


// Funktion för att escape specialtecken i URL
const escapeURL = (url) => {
  return url.replace(/[\0\x08\x09\x1a\n\r\x1b\\'"%]/g, function (character) {
    return '\\' + character;
  });
};

// POST-rutt för att spara varukorgen
router.post('/saveCart', async (req, res) => {
  const { userId, interventions } = req.body;

  console.log('POST /saveCart - Inkommande begäran:', req.body);

  // Kontrollera att vi får de nödvändiga parametrarna
  if (!userId || !Array.isArray(interventions) || interventions.length === 0) {
    console.log('Fel: userId eller interventions saknas eller är ogiltiga.');
    return res.status(400).json({ error: 'User ID och interventions måste skickas.' });
  }

  try {
    // Starta en databas-transaktion
    await new Promise((resolve, reject) => {
      console.log('Startar databastransaktion...');
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);
        });

        // Förenkla SQL-frågan och använd bindparametrar korrekt
        const stmt = db.prepare(`
          INSERT INTO user_interventions (
            userId, 
            interventionName, 
            decision, 
            startDate, 
            endDate, 
            provider, 
            supervisor, 
            contactDetails,
            pdfUrl
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        interventions.forEach((intervention) => {
          const {
            interventionName,
            decision,
            startDate,
            endDate,
            provider,
            supervisor,
            contactDetails,
            fileUrl // Ta emot pdfUrl som fileUrl
          } = intervention;

          if (!interventionName) {
            console.log('Fel: interventionName saknas.');
            return reject('InterventionName måste finnas.');
          }

          console.log(`Lägger till intervention: ${interventionName} för användare: ${userId}`);
          console.log('FileUrl:', fileUrl); // Lägg till logg för att debugga

          // Här används bindparametrar för varje fält, inklusive pdfUrl
          stmt.run(
            userId,
            interventionName,
            decision || null,
            startDate || null,
            endDate || null,
            provider || null,
            supervisor || null,
            contactDetails || null,
            fileUrl || null, // Skicka med PDF-URL här
            function(err) {
              if (err) {
                console.error('Fel vid insättning i databasen:', err);
                return reject(err);
              }
            }
          );
        });

        stmt.finalize((err) => {
          if (err) {
            console.error('Fel vid slutgiltig insättning:', err);
            return reject(err);
          }

          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              console.error('Fel vid commit:', commitErr);
              return reject(commitErr);
            }
            resolve();
          });
        });
      });
    });

    console.log('Alla insatser sparade, commit...');
    res.status(201).json({ message: 'Varukorgen har sparats.' });
  } catch (err) {
    console.error('Fel vid insättning, rollback...', err);
    db.run('ROLLBACK');
    res.status(500).json({ error: 'Kunde inte spara varukorgen.' });
  }
});






// GET-rutt för att hämta varukorgen
router.get('/getCart/:userId', async (req, res) => {
  const { userId } = req.params;

  // Logga vilken användare som gör förfrågan
  console.log(`GET /getCart - Hämtar varukorg för användare: ${userId}`);

  if (!userId) {
    console.error('User ID saknas i förfrågan');
    return res.status(400).json({ error: 'User ID måste skickas.' });
  }

  try {
    // Logga databasfrågan
    console.log(`Hämtar insatser från databasen för användare med ID: ${userId}`);

    db.all(
  `SELECT id, userId, interventionName, decision, startDate, endDate, provider, supervisor, contactDetails, pdfUrl
   FROM user_interventions WHERE userId = ?`,
  [userId],
  (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av data:', err);
      return res.status(500).json({ error: 'Kunde inte hämta varukorgen.' });
    }

    if (rows.length === 0) {
      console.log(`Ingen varukorg hittades för användare: ${userId}`);
      return res.status(404).json({ message: 'Ingen varukorg hittades för användaren.' });
    }

    console.log(`Hittade ${rows.length} insatser för användare: ${userId}`);
    res.status(200).json({ interventions: rows });
  }
);

  } catch (err) {
    // Logga andra fel i try-catch
    console.error('Fel vid databasoperation:', err);
    res.status(500).json({ error: 'Kunde inte hämta varukorgen.' });
  }
});


// PUT-rutt för att uppdatera en intervention (insats)
router.put('/updateIntervention/:id', async (req, res) => {
  const { id } = req.params;
  const { interventionName, decision, startDate, endDate, provider, supervisor, contactDetails } = req.body;

  // Kontrollera att alla nödvändiga data finns i request-body
  if (!interventionName) {
    return res.status(400).json({ error: 'InterventionName måste vara angivet.' });
  }

  console.log(`PUT /updateIntervention - Uppdaterar intervention med ID: ${id}`);

  try {
    // Starta en databastransaktion för att uppdatera insatsen
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        const stmt = db.prepare(`
          UPDATE user_interventions
          SET interventionName = ?, decision = ?, startDate = ?, endDate = ?, provider = ?, supervisor = ?, contactDetails = ?
          WHERE id = ?
        `);

        stmt.run(
          interventionName,
          decision || null,
          startDate || null,
          endDate || null,
          provider || null,
          supervisor || null,
          contactDetails || null,
          id,
          (err) => {
            if (err) {
              console.error('Fel vid uppdatering i databasen:', err);
              return reject(err);
            }
            resolve();
          }
        );

        stmt.finalize((err) => {
          if (err) {
            console.error('Fel vid slutgiltig uppdatering:', err);
            return reject(err);
          }
        });
      });
    });

    // Svara med en bekräftelse på att uppdateringen lyckades
    res.status(200).json({ message: 'Intervention uppdaterad.' });
  } catch (err) {
    // Logga eventuella fel
    console.error('Fel vid uppdatering:', err);
    res.status(500).json({ error: 'Kunde inte uppdatera interventionen.' });
  }
});



// GET-rutt för att hämta beslut som går ut inom x antal dagar
router.get('/expiring/:days', async (req, res) => {
  const { days } = req.params;

  // Logga inkommna parametrar
  console.log(`GET /expiring/${days} - Startar förfrågan`);

  // Kontrollera att days är en giltig siffra (15, 30 eller 60)
  const validDays = [15, 30, 60];
  console.log(`Kontrollerar om ${days} är ett giltigt antal dagar...`);
  if (!validDays.includes(parseInt(days))) {
    console.log(`Fel: Ogiltigt antal dagar mottaget - ${days}`);
    return res.status(400).json({ error: 'Ogiltigt antal dagar. Välj mellan 15, 30 eller 60.' });
  }
  console.log(`Antalet dagar ${days} är giltigt.`);

  // Skapa ett datum som är dagens datum + de specifika dagarna
  const today = new Date();
  console.log(`Dagens datum: ${today.toISOString()}`);

  const expirationDate = new Date(today.setDate(today.getDate() + parseInt(days)));
  console.log(`Beräknat utgångsdatum: ${expirationDate.toISOString()}`);

  try {
    // Hämta alla beslut från databasen som går ut inom det angivna tidsintervallet
    console.log(`Hämtar beslut från databasen för utgångsdatum: ${expirationDate.toISOString()}`);
    
    db.all(
      `SELECT * FROM user_interventions WHERE endDate IS NOT NULL AND endDate <= ?`,
      [expirationDate.toISOString()],
      (err, rows) => {
        if (err) {
          console.error('Fel vid hämtning av beslut:', err);
          return res.status(500).json({ error: 'Kunde inte hämta beslut.' });
        }

        console.log(`Antal rader som returnerades från databasen: ${rows.length}`);

        if (rows.length === 0) {
          console.log(`Inga beslut hittades som går ut inom ${days} dagar`);
          return res.status(404).json({ message: 'Inga beslut hittades som går ut inom det valda tidsintervallet.' });
        }

        // Logga antal beslut som hämtats
        console.log(`Hittade ${rows.length} beslut som går ut inom ${days} dagar`);

        // Skicka tillbaka alla beslut som går ut inom det valda intervallet
        res.status(200).json({ interventions: rows });
      }
    );
  } catch (err) {
    console.error('Fel vid databasoperation:', err);
    return res.status(500).json({ error: 'Kunde inte hämta beslut.' });
  }
});

// GET-rutt för att hämta alla aktiva beslut
router.get('/activeDecisions', async (req, res) => {
  // Logga starten av förfrågan
  console.log('GET /activeDecisions - Hämtar alla aktiva beslut.');

  try {
    // Fråga databasen efter alla aktiva beslut (där endDate är NULL eller i framtiden)
    db.all(
      `SELECT * FROM user_interventions WHERE endDate IS NULL OR endDate > ?`,
      [new Date().toISOString()], // Jämför med dagens datum
      (err, rows) => {
        if (err) {
          // Logga eventuella databasfel
          console.error('Fel vid hämtning av aktiva beslut:', err);
          return res.status(500).json({ error: 'Kunde inte hämta aktiva beslut.' });
        }

        if (rows.length === 0) {
          // Inga aktiva beslut hittades
          console.log('Inga aktiva beslut hittades.');
          return res.status(404).json({ message: 'Inga aktiva beslut hittades.' });
        }

        // Logga antal aktiva beslut som hittades
        console.log(`Hittade ${rows.length} aktiva beslut.`);

        // Svara med de aktiva besluten
        res.status(200).json({ interventions: rows });
      }
    );
  } catch (err) {
    // Logga andra fel
    console.error('Fel vid databasoperation:', err);
    res.status(500).json({ error: 'Kunde inte hämta aktiva beslut.' });
  }
});

// POST-rutt för att spara en ny insats (inklusive filuppladdning)
router.post('/insats', upload.single('file'), (req, res) => {
  const {
    name,
    focusType,
    description,
    combineWith, // Anta att detta är en kommaseparerad lista från frontend
    insats_type1,
    insats_type2,
    insats_type3,
    insats_type4
  } = req.body;
  const file = req.file; // Den uppladdade filen finns i req.file

  // Kontrollera om alla nödvändiga fält finns
  if (!name || !focusType || !description || !combineWith) {
    return res.status(400).json({ message: 'Alla fält måste fyllas i.' });
  }

  // Om 'combineWith' är en kommaseparerad sträng, dela den till en array och rensa eventuella mellanslag
  const combineWithArray = combineWith.split(',').map(item => item.trim());

  // Dela upp 'combineWithArray' i de olika fälten som ska sparas i databasen
  const [combine_type1, combine_type2, combine_type3, combine_type4] = [
    combineWithArray[0] || null,
    combineWithArray[1] || null,
    combineWithArray[2] || null,
    combineWithArray[3] || null
  ];

  // Spara filens namn i databasen (eller filens sökväg beroende på ditt behov)
  const filePath = file ? file.path : null; // Om fil inte laddas upp, sätts filePath till null

  // Kontrollera kolumnerna i tabellen och säkerställ att INSERT-frågan har rätt antal värden
  const stmt = db.prepare(`
    INSERT INTO insatser (name, insats_type1, insats_type2, insats_type3, insats_type4,
                          combine_type1, combine_type2, combine_type3, combine_type4,
                          focus_type, description, created_at, updated_at, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
  `);

  // Spara insatsens information i tabellen
  stmt.run(name, insats_type1, insats_type2, insats_type3, insats_type4,
           combine_type1, combine_type2, combine_type3, combine_type4,
           focusType, description, filePath, function (err) {
    if (err) {
      console.error('Error vid sparande av insats:', err);
      return res.status(500).json({ message: 'Fel vid lagring av insatsen', error: err.message });
    }

    const insatsId = this.lastID;

    res.status(201).json({
      message: 'Insats sparad',
      id: insatsId,
      filePath: filePath // Returnera filens sökväg som en del av svaret
    });
  });

  stmt.finalize();
});



// GET-rutt för att hämta alla insatser eller en specifik insats baserat på ID
router.get('/insats/:id?', (req, res) => {
  const { id } = req.params;

  // Om ett id är angett, hämta en specifik insats
  if (id) {
    const stmt = db.prepare('SELECT * FROM insatser WHERE id = ?');

    stmt.get(id, (err, row) => {
      if (err) {
        console.error('Error vid hämtning av insats:', err);
        return res.status(500).json({ message: 'Fel vid hämtning av insats', error: err.message });
      }

      if (!row) {
        return res.status(404).json({ message: 'Insats inte hittad.' });
      }

      // Returnera den hittade insatsen, inklusive alla nya fält
      res.status(200).json({
        id: row.id,
        name: row.name,
        insats_type1: row.insats_type1,
        insats_type2: row.insats_type2,
        insats_type3: row.insats_type3,
        insats_type4: row.insats_type4,
        combine_type1: row.combine_type1,
        combine_type2: row.combine_type2,
        combine_type3: row.combine_type3,
        combine_type4: row.combine_type4,
        focus_type: row.focus_type,
        description: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
        file_path: row.file_path // Lägg till filens sökväg i svaret
      });
    });

    stmt.finalize();
  } else {
    // Hämta alla insatser om inget ID är angett
    const stmt = db.prepare('SELECT * FROM insatser');

    stmt.all((err, rows) => {
      if (err) {
        console.error('Error vid hämtning av insatser:', err);
        return res.status(500).json({ message: 'Fel vid hämtning av insatser', error: err.message });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Inga insatser hittades.' });
      }

      // Returnera alla insatser, inklusive alla nya fält
      const formattedRows = rows.map(row => ({
        id: row.id,
        name: row.name,
        insats_type1: row.insats_type1,
        insats_type2: row.insats_type2,
        insats_type3: row.insats_type3,
        insats_type4: row.insats_type4,
        combine_type1: row.combine_type1,
        combine_type2: row.combine_type2,
        combine_type3: row.combine_type3,
        combine_type4: row.combine_type4,
        focus_type: row.focus_type,
        description: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
        file_path: row.file_path // Lägg till filens sökväg i svaret
      }));

      res.status(200).json(formattedRows);
    });

    stmt.finalize();
  }
});

router.post('/saveInterventionChoices', (req, res) => {
  const { userId, interventionId, checklists, track } = req.body;

  if (!Array.isArray(checklists)) {
    return res.status(400).json({ error: 'Checklists måste vara en array.' });
  }

  // Förbered SQL-frågan för att uppdatera eller införa en post
  const updateQuery = `UPDATE intervention_choices 
                       SET isChecked = ?, track = ? 
                       WHERE userId = ? AND interventionId = ? AND checklistItem = ?`;

  const insertQuery = `INSERT INTO intervention_choices (userId, interventionId, checklistItem, isChecked, track) 
                       VALUES (?, ?, ?, ?, ?)`;

  const dbOperations = checklists.map(({ name, checked }) => {
    return new Promise((resolve, reject) => {
      // Försök att uppdatera posten om den finns
      db.run(updateQuery, [checked ? 1 : 0, track, userId, interventionId, name], function(err) {
        if (err) {
          console.error('Fel vid uppdatering av posten:', err);
          // Om inget raderades (dvs. posten fanns inte), infoga en ny post
          if (err.message.includes('no such table')) {
            // Om uppdateringen inte fungerade, försök att infoga den nya posten
            db.run(insertQuery, [userId, interventionId, name, checked ? 1 : 0, track], function(insertErr) {
              if (insertErr) {
                console.error('Fel vid infogning av posten:', insertErr);
                reject(insertErr);
              } else {
                resolve(this.lastID);
              }
            });
          } else {
            reject(err);
          }
        } else if (this.changes === 0) {
          // Om ingen post uppdaterades (den fanns inte), infoga en ny post
          db.run(insertQuery, [userId, interventionId, name, checked ? 1 : 0, track], function(insertErr) {
            if (insertErr) {
              console.error('Fel vid infogning av posten:', insertErr);
              reject(insertErr);
            } else {
              resolve(this.lastID);
            }
          });
        } else {
          resolve(this.lastID); // Om uppdateringen lyckades, returnera ID:t
        }
      });
    });
  });

  Promise.all(dbOperations)
    .then(ids => {
      res.status(200).json({ message: 'Insatsval sparat!', ids });
    })
    .catch(error => {
      console.error('Fel vid sparande av flera val:', error);
      res.status(500).json({ error: 'Kunde inte spara insatsvalen.' });
    });
});


router.get('/getInterventionChoices/:userId', (req, res) => {
  const { userId } = req.params;

  // Logga den inkommande userId
  console.log('Received request with userId:', userId);

  // Ändra SQL-frågan för att hämta insatsvalen för användaren, utan att använda interventionId
  const query = `SELECT checklistItem, isChecked, track 
                 FROM intervention_choices 
                 WHERE userId = ?`;

  db.all(query, [userId], (err, rows) => {
    if (err) {
      console.error('Fel vid hämtning av insatsval:', err);
      return res.status(500).json({ error: 'Kunde inte hämta insatsvalen.' });
    }

    // Logga resultatet från databasen
    console.log('Database response:', rows);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Inga insatsval hittades för denna användare.' });
    }

    // Fördefinierad hierarkisk ordning på checklistapunkterna
    const hierarchicalOrder = [
      'Introduktion till arbetsplatsen',
      'Grundläggande arbetsuppgifter',
      'Fokus på mjuka färdigheter',
      'Visa förståelse för arbetsflöden',
      'Ökat ansvar i arbetsuppgifter',
      'Fördjupning i arbetsuppgifter'
    ];

    // Sortera checklistapunkterna baserat på den hierarkiska ordningen
    rows.sort((a, b) => {
      const indexA = hierarchicalOrder.indexOf(a.checklistItem);
      const indexB = hierarchicalOrder.indexOf(b.checklistItem);
      return indexA - indexB;
    });

    // Hitta den senaste ikryssade punkten i den hierarkiska ordningen
    const selectedItem = rows.reverse().find(row => row.isChecked === 1);

    // Logga det valda objektet
    console.log('Selected checklist item:', selectedItem);

    // Returnera svaret med den valda checklistapunkten och spåret (track)
    res.status(200).json({
      userId,
      selectedChecklistItem: selectedItem ? selectedItem.checklistItem : 'Ingen vald',
      track: selectedItem ? selectedItem.track : 'Ingen vald'
    });
  });
});

router.post('/send-pdf', async (req, res) => {
  const { userId, pdfUrl } = req.body;

  if (!userId || !pdfUrl) {
    return res.status(400).json({ error: 'UserId och pdfUrl är obligatoriska.' });
  }

  try {
    const sentAt = new Date().toISOString(); // Skapar tidsstämpel i ISO-format

    // Skriv in i databasen
    const query = `
      INSERT INTO sent_pdfs (user_id, pdf_url, sent_at)
      VALUES (?, ?, ?)
    `;
    
    // Använd db.run för att köra INSERT-frågan i SQLite
    db.run(query, [userId, pdfUrl, sentAt], function(err) {
      if (err) {
        console.error('Fel vid sparning av PDF:', err);
        return res.status(500).json({ error: 'Kunde inte spara PDF i databasen.' });
      }

      // Framgångsrik sparning
      res.status(200).json({ message: 'PDF skickad till deltagaren.' });
    });
  } catch (error) {
    console.error('Fel vid sparning av PDF:', error);
    res.status(500).json({ error: 'Kunde inte skicka PDF till deltagare.' });
  }
});

router.get('/getUserPdf/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // SQL-fråga för att hämta alla PDF-poster för den specifika användaren
    const query = 'SELECT pdf_url FROM sent_pdfs WHERE user_id = ?';  // Hämta alla PDF:er för användaren
    
    db.all(query, [userId], (err, rows) => {
      if (err) {
        console.error('Fel vid hämtning av PDF:', err);
        return res.status(500).json({ error: 'Kunde inte hämta PDF-URL.' });
      }

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Ingen PDF hittades för den angivna användaren.' });
      }

      // Skicka tillbaka alla PDF-URL:er som ett JSON-svar
      res.status(200).json({ pdfUrls: rows.map(row => row.pdf_url) });
    });
  } catch (error) {
    console.error('Fel vid hämtning av PDF:', error);
    res.status(500).json({ error: 'Kunde inte hämta PDF-URL.' });
  }
});









module.exports = router;
