// Backend/gameActions.js

export function performAction(
    actionId,
    stats,
    resources,
    position,
    destination,
    weather,
    timeOfDay
) {
    const newStats = { ...stats };
    const newResources = { ...resources };

    switch (actionId) {

        case "eat":
            if (newResources.food > 0) {
                newResources.food -= 1;
                newStats.energy = Math.min(100, newStats.energy + 30);
            }
            break;

        case "drink":
            if (newResources.water > 0) {
                newResources.water -= 1;
                newStats.hydration = Math.min(100, newStats.hydration + 30);
            }
            break;

        case "sleep":
            newStats.energy = Math.min(100, newStats.energy + 40);
            break;

        case "rest":
            newStats.energy = Math.min(100, newStats.energy + 15);
            break;

        default:
            console.warn("Unknown action:", actionId);
    }

    return { newStats, newResources };
}
