// utils/actions.js
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ===== Weather modifiers =====
export const weatherModifiers = {
  sol:  { energy: 1.0, water: 1.0, temp: 0 },
  regn: { energy: 1.2, water: 1.3, temp: 5 },
  snö:  { energy: 1.4, water: 1.5, temp: 10 },
};

// ===== Action config =====
export const actionConfig = {
  walk: {
    baseCost: { energy: 15, water: 5, temp: 10 },
    effect: ({ stats, position, destination }) => {
      const moveAmount = Math.min(10, Math.max(0, destination - position));
      return {
        moveAmount,
        logEntry: "Du vandrar vidare.",
        skanas: `Energi: ${stats.energy}, Vatten: ${stats.water}`,
      };
    },
  },
  eat: {
    baseCost: { energy: 0, water: 0 },
    effect: ({ stats, resources }) => {
      if (resources.food > 0) {
        resources.food--;
        stats.energy = clamp(stats.energy + 15, 0, 100);
        return { logEntry: "Du åt mat och fick energi.", skanas: `Energi: ${stats.energy}` };
      }
      return { logEntry: "Du har ingen mat.", skanas: null };
    },
  },
  drink: {
    effect: ({ stats, resources }) => {
      if (resources.water > 0) {
        resources.water--;
        stats.hydration = clamp((stats.hydration || 50) + 20, 0, 100);
        return { logEntry: "Du drack vatten.", skanas: `Hydration: ${stats.hydration}` };
      }
      return { logEntry: "Inget vatten!", skanas: null };
    },
  },
  sleep: {
    baseCost: { temp: 10 },
    effect: ({ stats }) => {
      stats.sleep = clamp((stats.sleep || 50) + 20, 0, 100);
      stats.temp = clamp((stats.temp || 50) - 10, 0, 100);
      return { logEntry: "Du sov.", skanas: `Sömn: ${stats.sleep}, Värme: ${stats.temp}` };
    },
  },
  run: {
    baseCost: { energy: 25, water: 10, temp: 15 },
    effect: ({ stats, position, destination }) => {
      const moveAmount = Math.min(20, Math.max(0, destination - position));
      stats.energy = clamp(stats.energy - 5, 0, 100);
      return {
        moveAmount,
        logEntry: "Du springer framåt snabbt!",
        skanas: `Energi: ${stats.energy}, Vatten: ${stats.water}`,
      };
    },
  },
  forage: {
    baseCost: { energy: 10, water: 5 },
    effect: ({ stats, resources }) => {
      const foundFood = Math.random() < 0.6;
      const foundWater = Math.random() < 0.4;
      if (foundFood) resources.food = (resources.food || 0) + 1;
      if (foundWater) resources.water = (resources.water || 0) + 1;

      let logEntry = "Inget hittades.";
      if (foundFood && foundWater) logEntry = "Du hittade mat och vatten!";
      else if (foundFood) logEntry = "Du hittade mat!";
      else if (foundWater) logEntry = "Du hittade vatten!";

      return {
        logEntry,
        skanas: `Mat: ${resources.food}, Vatten: ${resources.water}`,
      };
    },
  },
  rest: {
    baseCost: { energy: 5, water: 0 },
    effect: ({ stats }) => {
      stats.energy = clamp(stats.energy + 20, 0, 100);
      stats.sleep = clamp(stats.sleep + 10, 0, 100);
      return {
        logEntry: "Du vilar en stund och återhämtar energi.",
        skanas: `Energi: ${stats.energy}, Sömn: ${stats.sleep}`,
      };
    },
  },
  buildShelter: {
    baseCost: { energy: 20, water: 5 },
    effect: ({ stats, resources }) => {
      if ((resources.fuel || 0) >= 1) {
        resources.fuel--;
        stats.temp = clamp(stats.temp + 15, 0, 100);
        return {
          logEntry: "Du byggde ett skydd som ökar värmen.",
          skanas: `Värme: ${stats.temp}, Bränsle: ${resources.fuel}`,
        };
      }
      return { logEntry: "Du har inte bränsle för att bygga skydd.", skanas: null };
    },
  },
  heal: {
    baseCost: { energy: 10, water: 0 },
    effect: ({ stats, resources }) => {
      if ((resources.med || 0) >= 1) {
        resources.med--;
        stats.energy = clamp(stats.energy + 15, 0, 100);
        stats.hydration = clamp(stats.hydration + 10, 0, 100);
        return {
          logEntry: "Du använde medicin och återhämtade energi och hydration.",
          skanas: `Energi: ${stats.energy}, Hydration: ${stats.hydration}, Med: ${resources.med}`,
        };
      }
      return { logEntry: "Ingen medicin tillgänglig.", skanas: null };
    },
  },
};

// ===== Perform Action =====
export function performAction(
  actionId,
  playerStats = {},
  resources = {},
  position = 0,
  destination = 0,
  weather = "sol"
) {
  const stats = {
    energy: 50,
    water: 50,
    temp: 50,
    sleep: 50,
    hydration: 50,
    ...playerStats,
  };

  const res = {
    food: 0,
    water: 0,
    fuel: 0,
    med: 0,
    ...resources,
  };

  let moveAmount = 0;
  let logEntry = "Okänd handling.";
  let skanas = null;

  const config = actionConfig[actionId];
  if (!config) return { newStats: stats, newResources: res, moveAmount, logEntry, skanas, actionId };

  const mod = weatherModifiers[weather] ?? weatherModifiers.sol;
  if (config.baseCost) {
    const finalCost = {
      energy: Math.round((config.baseCost.energy ?? 0) * mod.energy),
      water: Math.round((config.baseCost.water ?? 0) * mod.water),
      temp: (config.baseCost.temp ?? 0) + mod.temp,
    };

    if ((stats.water || 0) < finalCost.water) {
      return { newStats: stats, newResources: res, moveAmount, logEntry: "Du har inte tillräckligt med vatten!", skanas, actionId };
    }

    stats.energy = clamp(stats.energy - finalCost.energy, 0, 100);
    stats.water = clamp(stats.water - finalCost.water, 0, 100);
    stats.temp = clamp(stats.temp - finalCost.temp, 0, 100);
  }

  const result = config.chance !== undefined
    ? config.effect({ stats, resources: res, success: Math.random() < config.chance, position, destination })
    : config.effect({ stats, resources: res, position, destination });

  logEntry = result.logEntry;
  skanas = result.skanas;
  if (result.moveAmount !== undefined) moveAmount = result.moveAmount;

  return { newStats: stats, newResources: res, moveAmount, logEntry, skanas, actionId };
}
