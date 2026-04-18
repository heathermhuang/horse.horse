---
name: play-horse
description: Play the Horse.Horse browser game — a Chrome-Dino-style runner with a pixel horse that jumps over cacti and ducks under pterodactyls.
version: 1.0.0
license: MIT
homepage: https://horse.horse/
---

# play-horse

Horse.Horse is a single-page runner game. This skill lets an AI agent drive the
game from inside a browser tab via [WebMCP](https://webmachinelearning.github.io/webmcp/).

## Tools

The game registers the following tools on `navigator.modelContext` when
`https://horse.horse/` finishes loading:

### `start_game`
Begin a new run. Works from both the initial waiting screen and the game-over
screen. No arguments.

### `jump`
Make the horse jump. Equivalent to pressing Space. Optional `hold_ms` (number,
0–400) keeps the jump input held for that many ms to jump higher.

### `duck`
Crouch the horse for `duration_ms` (number, 100–2000). Useful for passing
under pterodactyls.

### `get_state`
Returns a JSON object:

```json
{
  "state": "waiting" | "intro" | "playing" | "dead",
  "score": 0,
  "highScore": 0,
  "speed": 6,
  "obstaclesPassed": 0,
  "isNight": false
}
```

## Usage

1. Load `https://horse.horse/` in a WebMCP-capable browser.
2. Wait for `window.modelContextReady === true` (or for tools to appear on
   `navigator.modelContext`).
3. Call `start_game`, then loop: `get_state` → decide → `jump` / `duck`.

## Scoring

Top scores are posted to a public leaderboard at
`https://horse.horse/api/scores`. Agent-driven play is welcome, but sessions
are rate-limited and validated server-side for plausibility — see
[/api/session](https://horse.horse/api/session) flow in the source.

## Source

https://github.com/heatherbooop/horse.horse
