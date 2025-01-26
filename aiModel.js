const tf = require('@tensorflow/tfjs');
const use = require('@tensorflow-models/universal-sentence-encoder');

// Bearbetning av textdata för att omvandla till embeddings
const preprocessText = async (texts) => {
  const model = await use.load(); // Ladda Universal Sentence Encoder
  const embeddings = await model.embed(texts); // Omvandla text till embeddings
  return embeddings;
};

// Bearbeta träningsdata (skattningar och rekommendationer)
const processTrainingData = async (data) => {
  const textOutputs = data.map(d => d.output[0]); // Hämta rekommendationerna (text)
  const embeddings = await preprocessText(textOutputs); // Omvandla rekommendationerna till embeddings

  // Förbered de numeriska skattningarna (input)
  const inputs = data.map(d => d.input); // Skattningarna är numeriska (array av 8 värden)

  return { inputs, outputs: embeddings };
};

// Träning av modellen
const trainModel = async (trainingData) => {
  const { inputs, outputs } = await processTrainingData(trainingData); // Bearbeta träningsdata

  const inputTensor = tf.tensor2d(inputs);  // Skattningar som indata (numeriska)
  const outputTensor = outputs; // Rekommendationer som embeddings (output)

  // Skapa en sekventiell modell
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputs[0].length] }));
  model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  model.add(tf.layers.dense({ units: outputTensor.shape[1] })); // Output dimensioner matchar embeddings

  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

  // Träna modellen
  await model.fit(inputTensor, outputTensor, { epochs: 50 });

  return model;
};

// Prediktera rekommendation baserat på input (skattningar)
const predictRecommendation = async (model, input) => {
  const inputTensor = tf.tensor2d([input]); // Mata in de faktiska skattningarna (t.ex. från användaren)
  const predictionTensor = model.predict(inputTensor); // Gör prediktionen

  // Omvandla prediktionen till text (matcha med träningsdata)
  const predictionEmbedding = predictionTensor.dataSync();
  const closestText = findClosestText(predictionEmbedding, trainingData);

  return closestText;
};

// Hitta den mest lika texten genom att beräkna avstånd mellan vektorer (kosinusavstånd)
const findClosestText = (predictedEmbedding, trainingData) => {
  let minDistance = Infinity;
  let closestText = '';

  trainingData.forEach((data, index) => {
    const distance = cosineDistance(predictedEmbedding, data.embedding); // Beräkna kosinusavstånd
    if (distance < minDistance) {
      minDistance = distance;
      closestText = data.output[0]; // Rekommendationen (texten) som matchar
    }
  });

  return closestText;
};

// Beräkna kosinusavstånd mellan två vektorer
const cosineDistance = (vecA, vecB) => {
  const dotProduct = tf.dot(vecA, vecB).dataSync();
  const magnitudeA = tf.norm(vecA).dataSync();
  const magnitudeB = tf.norm(vecB).dataSync();
  return 1 - dotProduct / (magnitudeA * magnitudeB);
};

module.exports = {
  trainModel,
  predictRecommendation,
};
