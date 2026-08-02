const { Player, Food, Virus, EjectedMass } = require('./entities');
const { CONFIG } = require('./config');

class Game {
  constructor(io) {
    this.io = io;
    this.players = new Map(); // socketId -> Player
    this.food = [];
    this.viruses = [];
    this.ejected = [];
    this.leaderboard = [];
    this.tick = 0;
    this.lastLeaderboardUpdate = 0;

    this.spawnInitialFood();
    this.spawnInitialViruses();

    // Fixed tick rate ~25 Hz for smooth authoritative simulation
    this.tickInterval = setInterval(() => this.update(), 1000 / CONFIG.TICK_RATE);
  }

  spawnInitialFood() {
    for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
      this.food.push(new Food());
    }
  }

  spawnInitialViruses() {
    for (let i = 0; i < CONFIG.VIRUS_COUNT; i++) {
      this.viruses.push(new Virus());
    }
  }

  addPlayer(socket, name) {
    if (this.players.has(socket.id)) return;
    const player = new Player(socket.id, name);
    this.players.set(socket.id, player);
    socket.emit('init', {
      id: socket.id,
      worldSize: CONFIG.WORLD_SIZE,
      config: {
        massToRadius: CONFIG.MASS_TO_RADIUS,
        eatRatio: CONFIG.EAT_RATIO
      }
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  handleInput(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.dead) return;
    if (data && typeof data.dx === 'number' && typeof data.dy === 'number') {
      const len = Math.sqrt(data.dx * data.dx + data.dy * data.dy) || 1;
      player.targetDx = data.dx / len;
      player.targetDy = data.dy / len;
    }
  }

  splitPlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.dead) return;
    player.split();
  }

  ejectMass(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.dead) return;
    const blobs = player.eject();
    this.ejected.push(...blobs);
  }

  spectate(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      player.spectating = true;
      player.dead = true;
    }
  }

  respawn(socketId, name) {
    const player = this.players.get(socketId);
    if (!player) return;
    player.respawn(name);
  }

  update() {
    this.tick++;
    const dt = 1 / CONFIG.TICK_RATE;

    // Update all players
    for (const player of this.players.values()) {
      if (!player.dead) {
        player.update(dt);
      }
    }

    // Update ejected mass
    for (let i = this.ejected.length - 1; i >= 0; i--) {
      const e = this.ejected[i];
      e.update(dt);
      if (e.life <= 0) {
        this.ejected.splice(i, 1);
      }
    }

    // Update viruses (slight drift)
    for (const v of this.viruses) {
      v.update(dt);
    }

    // Collisions & eating
    this.handleCollisions();

    // Maintain food count
    while (this.food.length < CONFIG.FOOD_COUNT) {
      this.food.push(new Food());
    }

    // Maintain virus count
    while (this.viruses.length < CONFIG.VIRUS_COUNT) {
      this.viruses.push(new Virus());
    }

    // Broadcast state
    this.broadcastState();

    // Leaderboard every ~1s
    if (this.tick - this.lastLeaderboardUpdate >= CONFIG.TICK_RATE) {
      this.updateLeaderboard();
      this.lastLeaderboardUpdate = this.tick;
    }
  }

  handleCollisions() {
    const players = Array.from(this.players.values()).filter(p => !p.dead);

    // Player cells vs food
    for (const player of players) {
      for (const cell of player.cells) {
        for (let i = this.food.length - 1; i >= 0; i--) {
          const f = this.food[i];
          if (this.canEat(cell, f)) {
            cell.mass += f.mass;
            this.food.splice(i, 1);
          }
        }
      }
    }

    // Player cells vs ejected
    for (const player of players) {
      for (const cell of player.cells) {
        for (let i = this.ejected.length - 1; i >= 0; i--) {
          const e = this.ejected[i];
          if (e.ownerId === player.id && e.age < 0.5) continue; // don't re-eat own immediately
          if (this.canEat(cell, e)) {
            cell.mass += e.mass;
            this.ejected.splice(i, 1);
          }
        }
      }
    }

    // Player vs player
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];
        for (const c1 of p1.cells) {
          for (const c2 of p2.cells) {
            if (this.canEat(c1, c2)) {
              c1.mass += c2.mass;
              p2.removeCell(c2);
            } else if (this.canEat(c2, c1)) {
              c2.mass += c1.mass;
              p1.removeCell(c1);
            }
          }
        }
      }
    }

    // Check deaths
    for (const player of players) {
      if (player.cells.length === 0) {
        player.die();
      }
    }

    // Player vs virus
    for (const player of players) {
      if (player.dead) continue;
      for (const cell of [...player.cells]) {
        for (let vi = this.viruses.length - 1; vi >= 0; vi--) {
          const v = this.viruses[vi];
          if (this.canEat(cell, v) && cell.mass > CONFIG.VIRUS_MASS * 1.5) {
            // Eat virus -> split into many
            player.splitOnVirus(cell);
            this.viruses.splice(vi, 1);
          } else if (this.canEat(v, cell) === false && this.distance(cell, v) < cell.radius + v.radius * 0.8) {
            // Virus pushes or splits large cells that touch it
            if (cell.mass > CONFIG.VIRUS_FEED_MASS) {
              player.splitOnVirus(cell);
            }
          }
        }
      }
    }

    // Ejected vs virus (feed virus)
    for (let ei = this.ejected.length - 1; ei >= 0; ei--) {
      const e = this.ejected[ei];
      for (let vi = this.viruses.length - 1; vi >= 0; vi--) {
        const v = this.viruses[vi];
        if (this.distance(e, v) < e.radius + v.radius) {
          v.mass += e.mass;
          this.ejected.splice(ei, 1);
          if (v.mass >= CONFIG.VIRUS_SPLIT_MASS) {
            // Shoot a new virus
            const angle = Math.atan2(e.vy, e.vx) || Math.random() * Math.PI * 2;
            const newV = new Virus(v.x + Math.cos(angle) * (v.radius + 20), v.y + Math.sin(angle) * (v.radius + 20));
            newV.vx = Math.cos(angle) * 15;
            newV.vy = Math.sin(angle) * 15;
            this.viruses.push(newV);
            v.mass = CONFIG.VIRUS_MASS;
          }
          break;
        }
      }
    }
  }

  canEat(a, b) {
    if (!a || !b) return false;
    const dist = this.distance(a, b);
    const rSum = a.radius + b.radius;
    if (dist >= rSum * 0.85) return false; // not overlapping enough
    // Must be significantly larger
    return a.mass > b.mass * CONFIG.EAT_RATIO;
  }

  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  updateLeaderboard() {
    const entries = [];
    for (const p of this.players.values()) {
      if (!p.dead && p.cells.length > 0) {
        entries.push({
          id: p.id,
          name: p.name,
          mass: Math.floor(p.totalMass)
        });
      }
    }
    entries.sort((a, b) => b.mass - a.mass);
    this.leaderboard = entries.slice(0, 10);
    this.io.emit('leaderboard', this.leaderboard);
  }

  broadcastState() {
    // Build compact state
    const playersState = [];
    for (const p of this.players.values()) {
      if (p.dead && !p.spectating) continue;
      playersState.push(p.serialize());
    }

    const foodState = this.food.map(f => f.serialize());
    const virusState = this.viruses.map(v => v.serialize());
    const ejectedState = this.ejected.map(e => e.serialize());

    const state = {
      t: this.tick,
      players: playersState,
      food: foodState,
      viruses: virusState,
      ejected: ejectedState
    };

    // Send full state (for small player counts this is fine; optimize later if needed)
    this.io.emit('state', state);
  }
}

module.exports = Game;
