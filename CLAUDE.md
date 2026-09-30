# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based multiplayer Connect Four battle game with HoYoverse-inspired characters (Genshin Impact & Honkai: Star Rail). Players select characters with unique Ultimate abilities and play real-time matches via Firebase Firestore.

**Language:** Japanese (all UI text)

## Tech Stack

- **Vanilla JavaScript (ES6 modules)** — no frameworks, no bundler, no package manager
- **HTML5 Canvas** — game board rendering (7×6 grid, 110px cells)
- **Firebase** — Firestore (real-time game state & matchmaking), Anonymous Auth
- **GitHub Pages** — hosting (https://uko05.github.io/10_connect/)
- **Firebase SDK v10.14.1** loaded via CDN

## Development & Deployment

There is no build step, no npm, and no test suite. Files are served directly.

- **Local dev:** Open `index.html` in a browser, or use `firebase serve` for local hosting
- **Deploy:** push to `main` → GitHub Pages publishes it automatically (no workflow file needed)
- **Firestore rules / Cloud Functions:** deployed from `24_AccountCenter` to `genshin-bakatare01`
- The old Firebase project `connect-10-ca73c` is unused; its Hosting was disabled on 2026-09-30 and the
  Firebase Hosting workflows were removed. `.firebaserc` / `firebase.json` are leftovers — do not `firebase deploy` from here.

## Architecture

### Page Flow

1. **`index.html`** + `public/scripts/main.js` — Hub screen (landing page). Three entry points: CPU対戦 → `select.html?mode=cpu`, マッチング対戦 → `select.html?mode=match`, プレイヤー情報 → `playerInfo.html`.
2. **`select.html`** + `public/scripts/characterSelect.js` — Character selection, shared by both modes. Reads `?mode=` to show/hide the solo-difficulty block vs. the matching/passphrase block. Manages matchmaking via the `rooms` Firestore collection. Has a back button to the hub.
3. **`solo.html`** + `public/scripts/soloLogic.js` — CPU battle (no Firestore, no rating impact by design).
4. **`battle.html`** + `public/scripts/gameLogic.js` — Core PvP game engine (~3900 lines). Canvas rendering, turn logic, win detection, ability system, real-time Firestore sync.
5. **`playerInfo.html`** + `public/scripts/playerInfo.js` — Rating/rank display; future home for the achievement gallery and title selection.

### Key Modules

- **`public/scripts/firebaseConfig.js`** — Firebase SDK initialization and Firestore export
- **`public/scripts/characterData.js`** — Character definitions array: IDs, names, charge values, ability descriptions, voice file paths, and `process` field mapping to ability function names in gameLogic.js
- **`public/scripts/gameLogic.js`** — Game engine entry point. Key functions:
  - `init_drawBoard()` — Render canvas board
  - `dropStone(col)` — Place piece and check results
  - `checkWin()` — 4-in-a-row detection (thin wrapper; the logic lives in `winCheck.js`)
  - `roomQuery()` — the query for this match's room (use it instead of rebuilding `where("roomID", ...)`)
  - `updateGauge()` — Ultimate ability charge meter
  - `handleRoomUpdate()` — Firestore real-time listener for game state sync
  - `ult_*()` functions — Character-specific ability implementations (stone deletion, color inversion, turn manipulation)

### Firestore Collections

Firebase project is `genshin-bakatare01` (shared with the other uko05 sites; see DESIGN.md). Rules live in
`24_AccountCenter/firestore.rules`, Cloud Functions in `24_AccountCenter/functions/`.

- **`connectRooms`** — Active game sessions (players, stone positions as `col_row` keys, turn state, win counts).
  Character-specific ability state (Zhongli block, Durin, Cerydra, Silver Wolf, ...) lives in ONE map field
  **`abilityState`** — write it with dot paths (`'abilityState.xxx'`) via `updateDoc`. Adding a new stateful
  character needs no rules change.
- **`connectUsers`** — Rating/achievements. Clients may only update their OWN doc, and can never change
  `rating`/`matchCount`/`winCount`/`charaWins`/`lastMatchAt`.
- **`connectCharaStats`** / **`connectMatches`** — Server-only. `connectMatches/{roomDocId}` is one record per
  ranked match (charas, ratings before/after, rank tiers, winner, resultType, score) for balance analysis.

### Ranked rating flow (server-side since v1.28.0)

1. On BO3 end the reporter (P1, or the remaining player on `leave`) writes `bo3Final:true, rated:false, winnerUid, resultType`.
2. Cloud Function `connectRateMatch` (`24_AccountCenter/functions/connect.js`) validates the result
   (score vs. winner, loser inactivity for leave/timeout, max 3 rated matches per pair per 24h),
   updates ratings/stats, writes `connectMatches`, then sets `rated:true` + `ratingResult` on the room.
3. Each client waits for that (`recordMyAchievementsWhenRated`) and records ONLY its own achievements.
   The result screen waits for it (max 20s) before navigating away. The reporter deletes the room afterwards.

Never reintroduce client-side rating writes — the rules will reject them.

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

- `firebase.json` — leftover Hosting config for the unused `connect-10-ca73c` project (not used)
- `firestore.rules` — Requires anonymous auth (`request.auth != null`)

---

## Versioning Rules

This project uses semantic versioning:

Format:
vMAJOR.MINOR.PATCH

- PATCH (0.0.X): Bug fixes, refactoring without behavior change
- MINOR (0.X.0): New features, non-breaking changes
- MAJOR (X.0.0): Breaking changes or major architecture updates

### Mandatory Rule

Any functional change MUST increment APP_VERSION in:

public/scripts/version.js

Claude Code must:
1. Update APP_VERSION when making functional changes
2. Never leave version unchanged after modifying behavior
3. Keep version synchronized across index.html and battle.html

