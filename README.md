# dasgar.io Smooth

A mobile-first, production-ready **agar.io** clone with buttery-smooth client-side prediction and entity interpolation.

All core mechanics match the original agar.io:

- Cell movement, mass growth, and size scaling  
- Splitting (Space / Split button)  
- Ejecting mass (W / Eject button)  
- Pellet (food) feeding  
- Virus mechanics (feed & pop)  
- Leaderboard  
- Spectate-on-death flow  
- Authoritative server (anti-cheat)

**Only improvement:** smoother feel via client prediction + interpolation + consistent frame timing.

## Tech Stack

- **Server:** Node.js + Express + Socket.io (authoritative simulation @ 25 Hz)
- **Client:** Vanilla JS + Canvas 2D
- **PWA:** manifest.json + service worker, installable, landscape-locked on mobile

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in a browser.

### Environment

| Variable | Default | Description          |
|----------|---------|----------------------|
| `PORT`   | `3000`  | HTTP server port     |

## Mobile Controls

- **Floating joystick** (bottom-left) – movement  
- **Split** button (bottom-right)  
- **Eject** button (bottom-right)  
- Portrait orientation shows a “rotate device” prompt  
- Landscape is forced via CSS + Orientation API

Desktop: mouse aim + WASD / arrow keys, Space = split, W = eject.

## Deployment

Works out of the box on:

- **Render** – set build command empty, start command `npm start`
- **Railway** – auto-detects Node
- **Google Cloud Run** / **Fly.io** / any Node host

Example Render `render.yaml`:

```yaml
services:
  - type: web
    name: dasgar-io-smooth
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: PORT
        value: 10000
```

## Project Structure

```
├── server/
│   ├── index.js      # Express + Socket.io entry
│   ├── game.js       # Authoritative game loop
│   ├── entities.js   # Player, Food, Virus, EjectedMass
│   └── config.js     # Tunable constants
├── public/
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── client.js     # Main client + prediction/interp
│   │   ├── renderer.js   # Canvas rendering
│   │   ├── controls.js   # Touch + mouse/keyboard
│   │   └── config.js
│   ├── icons/            # PWA icons
│   ├── manifest.json
│   └── sw.js             # Service worker
├── package.json
└── README.md
```

## License

MIT
