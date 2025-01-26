const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const { trainModel, predictRecommendation } = require('./src/aiModel'); // Importera modellens funktioner
const path = require('path');
const fs = require('fs');

// Skapa en databasanslutning till din databas "my_app_database.db"
const dbApp = new sqlite3.Database('./my_app_database.db', (err) => {
  if (err) {
    console.error('Error opening my_app_database.db:', err.message);
  } else {
    console.log('Connected to the my_app_database.db.');
  }
});

// Skapa en annan databasanslutning till "ai.db" för feedback-rutten
const dbAi = new sqlite3.Database('./ai.db', (err) => {
  if (err) {
    console.error('Error opening ai.db:', err.message);
  } else {
    console.log('Connected to the ai.db.');
  }
});

// Ruta för att hämta kombinerad träningsdata (ratings + recommendations)
router.get('/getCombinedTrainingData', async (req, res) => {
  const ratingsQuery = `
    SELECT id, user_id, hälsa, vardag, kunskap_om_att_nå_arbete, klara_av_arbete,
           kompetenser, samarbetsförmåga, kommunikation, motivation
    FROM ratings
  `;

  const recommendationsQuery = `
    SELECT user_id, recommendations, rating_id
    FROM recommendations
  `;

  try {
    const ratings = await new Promise((resolve, reject) => {
      dbApp.all(ratingsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const recommendations = await new Promise((resolve, reject) => {
      dbApp.all(recommendationsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Kombinera ratings och recommendations baserat på rating_id
    const combinedData = ratings.map(rating => {
      const rec = recommendations.find(r => r.rating_id === rating.id);
      return {
        input: [
          rating.hälsa,
          rating.vardag,
          rating.kunskap_om_att_nå_arbete,
          rating.klara_av_arbete,
          rating.kompetenser,
          rating.samarbetsförmåga,
          rating.kommunikation,
          rating.motivation
        ],
        output: rec ? rec.recommendations.split(',').map(r => r.trim()) : [] // Dela upp rekommendationerna
      };
    });

    res.json(combinedData);

  } catch (error) {
    console.error('Error fetching combined training data:', error);
    res.status(500).json({ error: 'Error fetching combined training data' });
  }
});

router.post('/saveFeedback', async (req, res) => {
  const { inputData, prediction, confidence, feedback } = req.body;

  // Kontrollera att alla nödvändiga fält finns
  if (!inputData || !prediction || !confidence || feedback === undefined) {
    console.error('Missing required fields:', req.body); // Logga vad som skickades i requesten
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validera att feedback är ett giltigt värde (t.ex., 'positive' eller 'negative')
  if (feedback !== 'positive' && feedback !== 'negative') {
    console.error('Invalid feedback:', feedback); // Logga ogiltigt feedback
    return res.status(400).json({ error: 'Feedback must be "positive" or "negative"' });
  }

  const feedback_rating = feedback === 'positive' ? 5 : 1; // Exempel på att ge högsta betyg vid positiv feedback och lägsta vid negativ

  const insertQuery = `
    INSERT INTO feedback (input_data, prediction, confidence, feedback, feedback_rating)
    VALUES (?, ?, ?, ?, ?)
  `;

  try {
    console.log('Executing query:', insertQuery); // Logga SQL-frågan
    console.log('With values:', [JSON.stringify(inputData), prediction, confidence, feedback, feedback_rating]);

    // Sätt in feedbacken i ai.db-databasen
    dbAi.run(insertQuery, [JSON.stringify(inputData), prediction, confidence, feedback, feedback_rating], function(err) {
      if (err) {
        console.error('Error saving feedback:', err.message);
        return res.status(500).json({ error: 'Error saving feedback' });
      }

      console.log('Feedback saved successfully with ID:', this.lastID);

      res.json({
        id: this.lastID,
        input_data: inputData,
        prediction,
        confidence,
        feedback,
        feedback_rating,
        created_at: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('Error handling feedback:', error);
    res.status(500).json({ error: 'Error handling feedback' });
  }
});


// Ruta för att hämta sparad feedback
router.get('/getFeedback', async (req, res) => {
  const fetchQuery = `
    SELECT id, input_data, prediction, confidence, feedback, feedback_rating, created_at
    FROM feedback
  `;

  try {
    // Hämta feedback från databasen
    const feedbackData = await new Promise((resolve, reject) => {
      dbAi.all(fetchQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Skicka tillbaka feedback-data som JSON
    res.json(feedbackData);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Error fetching feedback' });
  }
});

module.exports = router;

// Spara modell
router.post('/saveModel', async (req, res) => {
  try {
    const modelJsonPath = path.join(__dirname, 'models', 'my-model.json');
    const modelWeightsPath = path.join(__dirname, 'models', 'my-model.weights.bin');

    // Kontrollera om mappen "models" finns, annars skapa den
    const modelDir = path.dirname(modelJsonPath);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
      console.log('Created models directory');
    }

    const modelJson = req.body.modelJson;
    const modelWeights = req.body.modelWeights;

    if (!modelJson || !modelWeights) {
      console.error('Model JSON or weights are missing');
      return res.status(400).json({ error: 'Model JSON and weights are required' });
    }
// Skriv filerna
fs.writeFileSync(modelJsonPath, JSON.stringify(modelJson));
console.log(`Model JSON written to: ${modelJsonPath}`);
fs.writeFileSync(modelWeightsPath, Buffer.from(modelWeights, 'base64'));
console.log(`Model Weights written to: ${modelWeightsPath}`);



    console.log(`Model JSON saved to ${modelJsonPath}`);
    console.log(`Model Weights saved to ${modelWeightsPath}`);

    res.status(200).json({ message: 'Model saved successfully!' });
  } catch (error) {
    console.error('Error saving model:', error);
    res.status(500).json({ error: 'Error saving model' });
  }
});

router.get('/loadModel', async (req, res) => {
  try {
    const modelJsonPath = path.join(__dirname, 'models', 'my-model.json');
    const modelWeightsPath = path.join(__dirname, 'models', 'my-model.weights.bin');

    // Logga den exakta sökvägen för att verifiera att servern letar på rätt ställe
    console.log('Looking for model files at:');
    console.log('Model JSON Path:', modelJsonPath);
    console.log('Model Weights Path:', modelWeightsPath);

    // Kontrollera om filerna finns
    if (!fs.existsSync(modelJsonPath) || !fs.existsSync(modelWeightsPath)) {
      console.error('Model files not found');
      return res.status(404).json({ error: 'Model files not found' });
    }

    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    const modelWeights = fs.readFileSync(modelWeightsPath);

    // Returnera de laddade filerna som Base64
    res.status(200).json({
      modelJson,
      modelWeights: modelWeights.toString('base64'),
    });
  } catch (error) {
    console.error('Error loading model:', error);
    res.status(500).json({ error: 'Error loading model' });
  }
});

module.exports = router;
