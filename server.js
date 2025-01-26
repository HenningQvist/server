const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const apiStatistikRouter = require('./api-statistik');
const apiAiRouter = require('./api-ai');
const apiHandlaggareRouter = require('./api-handlaggare');
const apiSettingsRouter = require('./api-settings');  // Importera den nya routern

// Importera andra routers
const apiRouter = require('./api');
const participantApiRouter = require('./participantApi');
const apiInsatserRouter = require('./api-insats');
const apiLoginRouter = require('./api-login');
const apiPlatsRouter = require('./api-platsbank');

// Skapa app och databasinstans
const app = express();
const db = new sqlite3.Database('./my_database.db');

// Middleware
app.use(cors()); // Tillåt CORS
app.use(bodyParser.json()); // Parsa JSON-innehåll

// Loggning av inkommande förfrågningar
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Funktion för att verifiera JWT-token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(403).json({ error: 'Ingen token angiven' });
  }

  jwt.verify(token, 'your-secret-key', (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Ogiltig token' });
    }
    req.user = decoded;
    next();
  });
};

// Middleware för att kontrollera om användaren är "ledning"
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'ledning') {
    return res.status(403).json({ error: 'Behörighet saknas' });
  }
  next();
};

// Registrera routers
app.use('/api', apiRouter); // Handläggar-API
app.use('/participant-api', participantApiRouter); // Deltagar-API
app.use('/api-insats', apiInsatserRouter); // Insats-API
app.use('/api-login', apiLoginRouter); // Login-API
app.use('/api-statistik', apiStatistikRouter);  // Statistik-API
app.use('/api-ai', apiAiRouter);  // AI-API
app.use('/api-platsbank', apiPlatsRouter);  // API-rutter för arbetsplatser
app.use('/api-handlaggare', apiHandlaggareRouter);  // Handläggare-API
app.use('/api-settings', apiSettingsRouter);  // Lägg till den nya inställnings-routern här
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Login-rutt som genererar JWT-token
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const query = 'SELECT * FROM users WHERE username = ?';
  db.get(query, [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Fel vid hämtning av användare' });
    }

    if (!user) {
      return res.status(404).json({ error: 'Användare hittades inte' });
    }

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ error: 'Felaktigt lösenord' });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        'secretkey',
        { expiresIn: '1h' }
      );

      res.json({ token });
    });
  });
});

// Skyddad rutt för ledning (exempel)
app.get('/api/ledningsstatistik', verifyToken, isAdmin, (req, res) => {
  res.json({ message: 'Detta är skyddad statistik för ledningen.' });
});

// Hantera statiska filer för frontend
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Fallback för icke-existerande rutter
app.use((req, res) => {
  res.status(404).json({ error: 'Rutt hittades inte' });
});

// Starta servern
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
