const express = require('express');
const router = express.Router();

// Exempel på en deltagarrutt
router.get('/dashboard', (req, res) => {
  // Här kan du hämta specifik information för deltagaren, exempelvis:
  const participantData = {
    name: 'Deltagare 1',
    progress: 75,
    completedTasks: 5
  };
  res.json(participantData); // Skicka tillbaka data som JSON
});

// Exempel på en rutt för att hämta deltagarens uppgifter
router.get('/tasks', (req, res) => {
  const tasks = [
    { id: 1, task: 'Fyll i kartläggning', status: 'In progress' },
    { id: 2, task: 'Granska rekommendationer', status: 'Not started' },
    { id: 3, task: 'Godkänn handlingsplan', status: 'Completed' }
  ];
  res.json(tasks); // Skicka tillbaka uppgifterna som JSON
});

// Exempel på en POST-rutt för att uppdatera deltagarens status
router.post('/update-status', (req, res) => {
  const { taskId, status } = req.body;

  // Här kan du uppdatera uppgifterna i databasen, t.ex.
  console.log(`Uppdaterar uppgift ${taskId} med status ${status}`);

  // Skicka tillbaka en bekräftelse
  res.json({ message: 'Status uppdaterad', taskId, status });
});

// Deltagarens dashboard
router.get('/dashboard', (req, res) => {
  // Hämta dashboard-information för en deltagare
  res.json({ message: 'Deltagarens dashboard-data' });
});

// Hämta deltagarens uppgifter
router.get('/tasks', (req, res) => {
  // Hämta lista på uppgifter för deltagaren
  res.json([{ taskId: 1, taskName: 'Uppgift 1' }, { taskId: 2, taskName: 'Uppgift 2' }]);
});

// Uppdatera status för en uppgift
router.post('/update-status', (req, res) => {
  const { taskId, status } = req.body;
  // Logik för att uppdatera status för en uppgift
  res.json({ message: `Uppgift ${taskId} status uppdaterad till ${status}` });
});
module.exports = router;
