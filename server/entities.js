const { CONFIG } = require('./config');

function randomPos() {
  return {
    x: Math.random() * CONFIG.WORLD_SIZE,
    y: Math.random() * CONFIG.WORLD_SIZE
  };
}

function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h}, 70%, 55%)`;
}

class Cell {
  constructor(x, y, mass, color) {
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.color = color;
    this.vx = 0;
    this.vy = 0;
    this.boost = 0; // remaining boost frames from split
    this.age = 0; // for merge timer
  }

  get radius() {
    return Math.sqrt(this.mass / Math.PI) * 4 + 4; // scaled for visibility
  }

  update(dt, targetDx, targetDy, playerSpeed) {
    this.age += dt;

    // Apply boost decay
    if (this.boost > 0) {
      this.x += this.vx * dt * 20;
      this.y += this.vy * dt * 20;
      this.boost -= dt;
      this.vx *= 0.92;
      this.vy *= 0.92;
    } else {
      // Normal movement toward target
      const speed = playerSpeed / Math.sqrt(this.mass / CONFIG.START_MASS);
      this.vx = targetDx * speed;
      this.vy = targetDy * speed;
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
    }

    // Soft walls
    const r = this.radius;
    this.x = Math.max(r, Math.min(CONFIG.WORLD_SIZE - r, this.x));
    this.y = Math.max(r, Math.min(CONFIG.WORLD_SIZE - r, this.y));

    // Slow mass decay for large cells
    if (this.mass > 50) {
      this.mass *= CONFIG.MASS_DECAY;
    }
  }
}

class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name || 'An unnamed cell';
    this.color = randomColor();
    this.cells = [];
    this.targetDx = 0;
    this.targetDy = 0;
    this.dead = false;
    this.spectating = false;
    this.score = 0;

    this.spawn();
  }

  spawn() {
    const pos = randomPos();
    this.cells = [new Cell(pos.x, pos.y, CONFIG.START_MASS, this.color)];
    this.dead = false;
    this.spectating = false;
  }

  respawn(name) {
    if (name) this.name = name;
    this.color = randomColor();
    this.spawn();
  }

  die() {
    this.dead = true;
    this.cells = [];
  }

  get totalMass() {
    return this.cells.reduce((s, c) => s + c.mass, 0);
  }

  get center() {
    if (this.cells.length === 0) return { x: CONFIG.WORLD_SIZE / 2, y: CONFIG.WORLD_SIZE / 2 };
    let mx = 0, my = 0, m = 0;
    for (const c of this.cells) {
      mx += c.x * c.mass;
      my += c.y * c.mass;
      m += c.mass;
    }
    return { x: mx / m, y: my / m };
  }

  update(dt) {
    const speed = CONFIG.BASE_SPEED;
    for (const cell of this.cells) {
      cell.update(dt, this.targetDx, this.targetDy, speed);
    }

    // Merge cells that are ready and overlapping
    this.tryMerge();
  }

  tryMerge() {
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const a = this.cells[i];
        const b = this.cells[j];
        if (a.age < CONFIG.MERGE_TIME || b.age < CONFIG.MERGE_TIME) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < a.radius + b.radius) {
          // Merge into larger
          if (a.mass >= b.mass) {
            a.mass += b.mass;
            a.x = (a.x * a.mass + b.x * b.mass) / (a.mass + b.mass);
            a.y = (a.y * a.mass + b.y * b.mass) / (a.mass + b.mass);
            this.cells.splice(j, 1);
            j--;
          } else {
            b.mass += a.mass;
            b.x = (a.x * a.mass + b.x * b.mass) / (a.mass + b.mass);
            b.y = (a.y * a.mass + b.y * b.mass) / (a.mass + b.mass);
            this.cells.splice(i, 1);
            i--;
            break;
          }
        }
      }
    }
  }

  split() {
    if (this.cells.length >= CONFIG.MAX_CELLS) return;
    const newCells = [];
    for (const cell of this.cells) {
      if (this.cells.length + newCells.length >= CONFIG.MAX_CELLS) break;
      if (cell.mass < CONFIG.START_MASS * 2) continue;
      const half = cell.mass / 2;
      cell.mass = half;
      const angle = Math.atan2(this.targetDy, this.targetDx) || Math.random() * Math.PI * 2;
      const nc = new Cell(
        cell.x + Math.cos(angle) * cell.radius * 0.5,
        cell.y + Math.sin(angle) * cell.radius * 0.5,
        half,
        this.color
      );
      nc.vx = Math.cos(angle) * CONFIG.SPLIT_IMPULSE;
      nc.vy = Math.sin(angle) * CONFIG.SPLIT_IMPULSE;
      nc.boost = 0.6;
      nc.age = 0;
      newCells.push(nc);
    }
    this.cells.push(...newCells);
  }

  splitOnVirus(cell) {
    // Split into many small cells (agar.io virus pop)
    const pieces = Math.min(8, Math.floor(cell.mass / CONFIG.START_MASS));
    if (pieces < 2) return;
    const pieceMass = cell.mass / pieces;
    cell.mass = pieceMass;
    for (let i = 1; i < pieces && this.cells.length < CONFIG.MAX_CELLS; i++) {
      const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.3;
      const nc = new Cell(
        cell.x + Math.cos(angle) * 30,
        cell.y + Math.sin(angle) * 30,
        pieceMass,
        this.color
      );
      nc.vx = Math.cos(angle) * CONFIG.SPLIT_IMPULSE * 1.2;
      nc.vy = Math.sin(angle) * CONFIG.SPLIT_IMPULSE * 1.2;
      nc.boost = 0.8;
      nc.age = 0;
      this.cells.push(nc);
    }
  }

  eject() {
    const blobs = [];
    for (const cell of this.cells) {
      if (cell.mass <= CONFIG.START_MASS + CONFIG.EJECT_MASS) continue;
      cell.mass -= CONFIG.EJECT_MASS;
      const angle = Math.atan2(this.targetDy, this.targetDx) || Math.random() * Math.PI * 2;
      const e = new EjectedMass(
        cell.x + Math.cos(angle) * (cell.radius + 5),
        cell.y + Math.sin(angle) * (cell.radius + 5),
        CONFIG.EJECT_MASS,
        this.color,
        this.id
      );
      e.vx = Math.cos(angle) * CONFIG.EJECT_IMPULSE;
      e.vy = Math.sin(angle) * CONFIG.EJECT_IMPULSE;
      blobs.push(e);
    }
    return blobs;
  }

  removeCell(cell) {
    const idx = this.cells.indexOf(cell);
    if (idx !== -1) this.cells.splice(idx, 1);
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      dead: this.dead,
      cells: this.cells.map(c => ({
        x: Math.round(c.x * 10) / 10,
        y: Math.round(c.y * 10) / 10,
        mass: Math.round(c.mass * 10) / 10,
        r: Math.round(c.radius * 10) / 10
      }))
    };
  }
}

class Food {
  constructor() {
    const pos = randomPos();
    this.x = pos.x;
    this.y = pos.y;
    this.mass = CONFIG.FOOD_MASS;
    this.color = randomColor();
  }

  get radius() {
    return 6;
  }

  serialize() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      c: this.color
    };
  }
}

class Virus {
  constructor(x, y) {
    if (x == null) {
      const pos = randomPos();
      this.x = pos.x;
      this.y = pos.y;
    } else {
      this.x = x;
      this.y = y;
    }
    this.mass = CONFIG.VIRUS_MASS;
    this.vx = 0;
    this.vy = 0;
  }

  get radius() {
    return Math.sqrt(this.mass / Math.PI) * 4 + 10;
  }

  update(dt) {
    this.x += this.vx * dt * 30;
    this.y += this.vy * dt * 30;
    this.vx *= 0.96;
    this.vy *= 0.96;
    const r = this.radius;
    this.x = Math.max(r, Math.min(CONFIG.WORLD_SIZE - r, this.x));
    this.y = Math.max(r, Math.min(CONFIG.WORLD_SIZE - r, this.y));
  }

  serialize() {
    return {
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      r: Math.round(this.radius * 10) / 10
    };
  }
}

class EjectedMass {
  constructor(x, y, mass, color, ownerId) {
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.color = color;
    this.ownerId = ownerId;
    this.vx = 0;
    this.vy = 0;
    this.life = 8; // seconds
    this.age = 0;
  }

  get radius() {
    return Math.sqrt(this.mass / Math.PI) * 4 + 3;
  }

  update(dt) {
    this.x += this.vx * dt * 40;
    this.y += this.vy * dt * 40;
    this.vx *= 0.94;
    this.vy *= 0.94;
    this.life -= dt;
    this.age += dt;
    const r = this.radius;
    this.x = Math.max(r, Math.min(CONFIG.WORLD_SIZE - r, this.x));
    this.y = Math.max(r, Math.min(CONFIG.WORLD_SIZE - r, this.y));
  }

  serialize() {
    return {
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      r: Math.round(this.radius * 10) / 10,
      c: this.color
    };
  }
}

module.exports = { Player, Food, Virus, EjectedMass, Cell };
