# Horse.Horse

A Chrome Dinosaur Game clone with a pixel-art horse and jockey. Jump over racing obstacles, climb the global leaderboard, and chase ghost markers left by top players.

**Play now at [horse.horse](https://horse.horse)**

![Horse.Horse gameplay](screenshots/gameplay-running.png)

## Features

- **Pixel-art horse + jockey** with running, jumping, ducking, and idle fidget animations
- **Racing obstacles** — hurdles (low + tall), hedges, oxers (double fences), water jumps, and birds
- **Obstacle grouping** — multiple obstacles spawn together as speed increases
- **Global leaderboard** — top 10 scores displayed with country flags, powered by Cloudflare D1
- **Ghost markers** — top 100 leaderboard entries become country flag checkpoints on the track; pass one and you'll see the flag, rank, and score with a chime
- **Global play counter** — total games played across all players, displayed in the HUD
- **Day/night cycle** — palette inverts every 700 points
- **Web Audio SFX** — jump, hit, score milestone, and ghost-pass sounds, all synthesized in the browser
- **Mobile support** — tap to jump, swipe down to duck, responsive canvas scaling
- **Top 10 result screen** — game over shows your rank highlighted in gold when you place
- **Full Chrome Dino parity** — delta-time physics, variable jump height, speed drop (fast fall), gap-based spawning, tab-pause, restart cooldown, score flash, blink animation, intro slide, bumpy horizon, dynamic clouds

## Screenshots

| Idle | Running | Jumping | Game Over |
|------|---------|---------|-----------|
| ![Idle](screenshots/gameplay-idle.png) | ![Running](screenshots/gameplay-running.png) | ![Jumping](screenshots/gameplay-jump.png) | ![Game Over](screenshots/gameplay-gameover.png) |

## Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Jump | `Space` / `Arrow Up` | Tap |
| Duck | `Arrow Down` | Swipe down |
| Fast fall | `Arrow Down` while airborne | Swipe down while airborne |
| Restart | `Space` / `Arrow Up` / Tap after death | Tap |

## Tech Stack

- **Frontend** — vanilla JS, single-file game (`js/game.js`), Canvas 2D, no build step, no dependencies
- **Backend** — Cloudflare Workers + D1 (serverless SQLite) for the leaderboard API and play counter
- **Hosting** — Cloudflare Workers with static assets, zone-routed to `horse.horse`
- **Analytics** — Google Analytics (G-SECK3FR5SR)
- **SEO** — Open Graph, Twitter Cards, VideoGame + FAQPage structured data (JSON-LD)

## Architecture

```
index.html              <- game shell: canvas + structured data + meta tags
js/game.js              <- entire game in a single IIFE (~1300 lines)
worker.js               <- Cloudflare Worker: leaderboard API + stats + static fallback
css/style.css           <- centered layout, pixelated canvas rendering
og-image.png            <- Open Graph social preview image (1200x630)
terms.html              <- Terms of Service
privacy.html            <- Privacy Policy
wrangler.toml.example   <- Cloudflare config template (copy to wrangler.toml)
```

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scores` | `GET` | Returns top 100 scores as JSON, cached 30s |
| `/api/scores` | `POST` | Submit a score with anti-cheat validation |
| `/api/stats` | `GET` | Returns `{ totalPlays }` global play count, cached 10s |

**Anti-cheat measures:**
- Session ID and play time required on every submission
- Physics plausibility check (score vs. play time, max 15 score/sec)
- Max speed validation (game caps at 12, rejects >12.5)
- Obstacle count sanity check (min 1 obstacle per 200 score)
- Rate limiting (1 submission per 5s per session)
- Score cap at 99,999
- Only top-100-worthy scores are stored

## Local Development

```bash
# Start the local server
node server.js
# Open http://localhost:8765
```

No build step, no npm install, no dependencies. Just a static file server.

## Deployment

```bash
# Copy and fill in your Cloudflare IDs
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your account_id, zone_id, database_id

# Create the D1 database and tables
npx wrangler d1 create horse-leaderboard
npx wrangler d1 execute horse-leaderboard --remote --command "CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, score INTEGER NOT NULL, country TEXT DEFAULT 'XX', session_id TEXT, max_speed REAL, obstacles_passed INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
npx wrangler d1 execute horse-leaderboard --remote --command "CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value INTEGER DEFAULT 0)"
npx wrangler d1 execute horse-leaderboard --remote --command "INSERT OR IGNORE INTO stats (key, value) VALUES ('total_plays', 0)"

# Deploy
npx wrangler deploy
```

Requires a Cloudflare account with:
- Workers plan
- D1 database
- DNS zone for your domain

## Vibe Coded

Built with vibes by [@heathermhuang](https://h.im/?ref=horse.horse) and Claude.

## License

MIT
