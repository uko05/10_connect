# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based multiplayer Connect Four battle game with HoYoverse-inspired characters (Genshin Impact & Honkai: Star Rail). Players select characters with unique Ultimate abilities and play real-time matches via Firebase Firestore.

**Language:** Japanese (all UI text)

## Tech Stack

- **Vanilla JavaScript (ES6 modules)** — no frameworks, no bundler, no package manager
- **HTML5 Canvas** — game board rendering (7×6 grid, 110px cells)
- **Firebase** — Firestore (real-time game state & matchmaking), Hosting, Anonymous Auth
- **Firebase SDK v10.14.1** loaded via CDN

## Development & Deployment

There is no build step, no npm, and no test suite. Files are served directly.

- **Local dev:** Open `index.html` in a browser, or use `firebase serve` for local hosting
- **Deploy:** Automatic via GitHub Actions on push to `main` → Firebase Hosting
- **Manual deploy:** `firebase deploy`
- **Firebase project:** `connect-10-ca73c` (see `.firebaserc`)

## Architecture

### Page Flow

1. **`index.html`** + `public/scripts/main.js` — Lobby & character selection. Manages matchmaking via `waitingPlayers` Firestore collection.
2. **`battle.html`** + `public/scripts/gameLogic.js` — Core game engine (~3000 lines). Canvas rendering, turn logic, win detection, ability system, real-time Firestore sync.

### Key Modules

- **`public/scripts/firebaseConfig.js`** — Firebase SDK initialization and Firestore export
- **`public/scripts/characterData.js`** — Character definitions array: IDs, names, charge values, ability descriptions, voice file paths, and `process` field mapping to ability function names in gameLogic.js
- **`public/scripts/gameLogic.js`** — Game engine entry point. Key functions:
  - `init_drawBoard()` — Render canvas board
  - `dropStone(col)` — Place piece and check results
  - `checkWin()` — 4-in-a-row detection
  - `updateGauge()` — Ultimate ability charge meter
  - `handleRoomUpdate()` — Firestore real-time listener for game state sync
  - `ult_*()` functions — Character-specific ability implementations (stone deletion, color inversion, turn manipulation)

### Firestore Collections

- **`waitingPlayers`** — Matchmaking queue (uuid, playerName, charaID, passphrase, timestamp)
- **`rooms`** — Active game sessions (players, stone positions as `col_row` keys, turn state, win counts, ability flags)

### Game Mechanics

- Best-of-3 match format (first to 3 round wins)
- Each character has a charge meter that fills on stone drops; when full, Ultimate ability activates
- Turn timer with animated gauge
- Abilities modify the board state (destroy stones, invert colors, manipulate turns)

## Assets

- `public/chara/` — Character portraits and ultimate cutscene images
- `public/scripts/sound/` — SFX and character voice lines
- `public/font/` — Custom HoYoverse fonts and tutorial rule images
- `public/scripts/favicon_io/` — Multi-resolution favicons

## Firebase Configuration

- `firebase.json` — Hosting config (rewrites all routes to index.html)
- `firestore.rules` — Requires anonymous auth (`request.auth != null`)
- GitHub Actions workflows in `.github/workflows/` handle CI/CD
