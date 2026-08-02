const CONFIG = {
  WORLD_SIZE: 5000,
  TICK_RATE: 25,

  // Mass / size
  MASS_TO_RADIUS: 1 / Math.PI, // radius = sqrt(mass * MASS_TO_RADIUS) roughly; we use sqrt(mass)
  START_MASS: 25,
  MIN_MASS: 10,
  EAT_RATIO: 1.25, // must be 25% larger to eat

  // Speed
  BASE_SPEED: 6.5,
  SPEED_FACTOR: 0.45, // speed decreases with mass

  // Food
  FOOD_COUNT: 800,
  FOOD_MASS: 1,

  // Viruses
  VIRUS_COUNT: 30,
  VIRUS_MASS: 100,
  VIRUS_FEED_MASS: 150,
  VIRUS_SPLIT_MASS: 180,

  // Split / eject
  SPLIT_IMPULSE: 28,
  EJECT_MASS: 12,
  EJECT_IMPULSE: 22,
  MERGE_TIME: 12, // seconds before cells can merge
  MAX_CELLS: 16,

  // Decay
  MASS_DECAY: 0.998 // per tick ~ slow decay for large cells
};

module.exports = { CONFIG };
