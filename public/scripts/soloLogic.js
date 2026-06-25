// soloLogic.js - ソロモード(CPU対戦)。対局自体はFirestoreを使わず、ブラウザ内だけで完結するConnect4。
// キャラ選択・チャージ・必殺技は通常戦同様に使えるが、レート・キャラ別勝利数には一切影響しない。
// アチーブメント（難易度別勝利）のみ、users/{uid}.achStats に記録する（rating/charaWinsとは完全に別フィールド）。

import { drawPiece as _drawPiece, flashScreen as _flashScreen, shakeElement as _shakeElement, spawnParticleBurst as _spawnParticleBurst } from "./renderer.js";
import { moveSound, chargeSound, AbilityStandby, setupSystemVolumeSlider } from "./audioManager.js";
import { setupScaledLayout, setupMobileBoardLayout } from "./layoutScaler.js";
import { setupSettingsModal, bindSettingsUI, getDisplayColor, getUltIntensity, getCpuSearchDepth, getCpuDifficulty, getClickMode } from "./settingsManager.js";
import { getRandomTwoNumbers, getRandomThreeNumbers, getRandomElements } from "./abilities.js";
import { characterData } from "./characterData.js";
import { APP_VERSION } from "./version.js";
import { authReady } from "./firebaseConfig.js";
import { recordSoloWin } from "./achievementManager.js";
import { showAchievementToast, showCharacterUnlockModal } from "./achievementToast.js";

document.getElementById('version').textContent = APP_VERSION;

const topCanvas = document.getElementById('connect4Canvas_top');
const canvas = document.getElementById('connect4Canvas');
const ctx = canvas.getContext('2d');

const rows = 6;
const cols = 7;
const cellSize = 110;

const PLAYER_COLOR = 'red';
const CPU_COLOR = 'yellow';
const ABEN_CHARGE_PENALTY = 50; // ソロモード専用：アベンチュリンは時間制限の代わりに相手のチャージを減らす
const ABEN_MAX_USES = 5;

let stones = {}; // "col_row" -> 'red' | 'yellow'
let turn = 'player'; // 'player' | 'cpu'
let gameOver = false;
let nowCol = 3;
let droppingKey = null; // アニメ中のセル（静的描画から除外する）
let highlightedColumn = null;
let pendingDropCol = null; // 2クリックモード：1回目のクリックで選択した列
let boardScale = 1;
let turnCount = 1;
let changeStone = 0; // 花火の色反転効果の残りターン
let playerRoundWins = 0;
let cpuRoundWins = 0;
let startingSide = 'player'; // 各ラウンドの先攻

// 鍾離：列封鎖のクロスターン状態
let zhongliBlockedCols = [];
let zhongliReblockPending = false;
let zhongliCasterSide = null;
let zhongliBlockOverlays = [];

// ドゥリン：次の自分ターン自動破壊
let durinAutoDeletePending = false;
let durinCasterSide = null;

// ケリュドラ：次の相手ターン追加投下
let cerluaActive = false;
let cerluaCasterSide = null;

let playerChara = null;
let cpuChara = null;
let playerUltAudio = null;
let cpuUltAudio = null;
let currentUid = null; // アチーブメント記録用（認証は裏で進める。対局の進行はブロックしない）
authReady.then((user) => { currentUid = user.uid; }).catch((e) => console.warn("[solo] 認証取得失敗:", e));
let playerCharge = 0;
let cpuCharge = 0;
let playerUltCount = 0;
let cpuUltCount = 0;
let abilityInProgress = false;
let playerMoveInProgress = false; // 連打で複数手が同時に処理されるのを防ぐロック

//------------------------------------------------------------------------------------------------
// 必殺技演出強度に応じたフラッシュ・シェイク・パーティクル（バトル画面と同じ考え方）
function fxFlash(color, duration) {
    const level = getUltIntensity();
    if (level === 'off') return;
    _flashScreen(color, level === 'weak' ? duration * 0.5 : duration);
}
function fxShake(el, intensity, duration) {
    const level = getUltIntensity();
    if (level === 'off') return;
    _shakeElement(el, level === 'weak' ? intensity * 0.5 : intensity, level === 'weak' ? duration * 0.5 : duration);
}
function fxParticles(x, y, colors = ['#ff7a00', '#ffd400', '#fff6cc'], count = 16) {
    const level = getUltIntensity();
    if (level === 'off') return;
    const n = level === 'weak' ? Math.max(1, Math.round(count * 0.5)) : count;
    _spawnParticleBurst(x, y, colors, n);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//------------------------------------------------------------------------------------------------
// 盤面ロジック（row 0 = 上, row(rows-1) = 下。下から積み上げる）

function getDropRow(column) {
    for (let r = rows - 1; r >= 0; r--) {
        if (!stones[`${column}_${r}`]) return r;
    }
    return -1; // 列が満杯
}

function checkWinLocal() {
    const board = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (const key in stones) {
        const [c, r] = key.split('_').map(Number);
        board[r][c] = stones[key];
    }

    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const color = board[r][c];
            if (!color) continue;
            for (const [dr, dc] of dirs) {
                const positions = [[r, c]];
                let i = 1;
                while (
                    r + i * dr >= 0 && r + i * dr < rows &&
                    c + i * dc >= 0 && c + i * dc < cols &&
                    board[r + i * dr][c + i * dc] === color
                ) {
                    positions.push([r + i * dr, c + i * dc]);
                    i++;
                }
                if (positions.length >= 4) {
                    return { color, positions };
                }
            }
        }
    }
    return null;
}

function isBoardFull() {
    for (let c = 0; c < cols; c++) {
        if (getDropRow(c) >= 0) return false;
    }
    return true;
}

function getValidColumns() {
    const valid = [];
    for (let c = 0; c < cols; c++) {
        if (getDropRow(c) >= 0) valid.push(c);
    }
    return valid;
}

function wouldWin(column, color) {
    const row = getDropRow(column);
    if (row < 0) return false;
    stones[`${column}_${row}`] = color;
    const result = checkWinLocal();
    delete stones[`${column}_${row}`];
    return !!(result && result.color === color);
}

function hasImmediateThreat(color) {
    return getValidColumns().some(c => wouldWin(c, color));
}

//------------------------------------------------------------------------------------------------
// CPU AI: ミニマックス探索（アルファベータ枝刈り）で数手先まで読む

const COLUMN_SEARCH_ORDER = [3, 2, 4, 1, 5, 0, 6]; // 中央優先（枝刈り効率＆同点時の優先度）

function boardFromStones() {
    const board = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (const key in stones) {
        const [c, r] = key.split('_').map(Number);
        board[r][c] = stones[key];
    }
    return board;
}

function dropRowOnBoard(board, column) {
    for (let r = rows - 1; r >= 0; r--) {
        if (!board[r][column]) return r;
    }
    return -1;
}

function validColumnsOnBoard(board) {
    return COLUMN_SEARCH_ORDER.filter(c => dropRowOnBoard(board, c) >= 0);
}

function checkWinOnBoard(board) {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const color = board[r][c];
            if (!color) continue;
            for (const [dr, dc] of dirs) {
                let count = 1;
                let i = 1;
                while (
                    r + i * dr >= 0 && r + i * dr < rows &&
                    c + i * dc >= 0 && c + i * dc < cols &&
                    board[r + i * dr][c + i * dc] === color
                ) {
                    count++; i++;
                }
                if (count >= 4) return color;
            }
        }
    }
    return null;
}

// 4セット連続の「窓」をヒューリスティック評価する（古典的なConnect4の評価関数）
function scoreWindow(window, color) {
    const opp = color === CPU_COLOR ? PLAYER_COLOR : CPU_COLOR;
    const mine = window.filter(v => v === color).length;
    const theirs = window.filter(v => v === opp).length;
    const empty = window.filter(v => v === null).length;

    if (mine === 4) return 100000;
    if (theirs === 4) return -100000;
    if (mine === 3 && empty === 1) return 5;
    if (mine === 2 && empty === 2) return 2;
    if (theirs === 3 && empty === 1) return -4;
    if (theirs === 2 && empty === 2) return -1;
    return 0;
}

function evaluateBoard(board, color) {
    let score = 0;
    const centerCol = Math.floor(cols / 2);

    for (let r = 0; r < rows; r++) {
        if (board[r][centerCol] === color) score += 3;
        else if (board[r][centerCol]) score -= 3;
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= cols - 4; c++) {
            score += scoreWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]], color);
        }
    }
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r <= rows - 4; r++) {
            score += scoreWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]], color);
        }
    }
    for (let r = 0; r <= rows - 4; r++) {
        for (let c = 0; c <= cols - 4; c++) {
            score += scoreWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]], color);
        }
    }
    for (let r = 0; r <= rows - 4; r++) {
        for (let c = 3; c < cols; c++) {
            score += scoreWindow([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]], color);
        }
    }
    return score;
}

function minimax(board, depth, alpha, beta, maximizing) {
    const winner = checkWinOnBoard(board);
    if (winner === CPU_COLOR) return { score: 1000000 + depth };
    if (winner === PLAYER_COLOR) return { score: -1000000 - depth };

    const validCols = validColumnsOnBoard(board);
    if (validCols.length === 0) return { score: 0 }; // 満杯（引き分け）
    if (depth === 0) return { score: evaluateBoard(board, CPU_COLOR) };

    let bestCol = validCols[0];

    if (maximizing) {
        let value = -Infinity;
        for (const c of validCols) {
            const row = dropRowOnBoard(board, c);
            board[row][c] = CPU_COLOR;
            const result = minimax(board, depth - 1, alpha, beta, false);
            board[row][c] = null;
            if (result.score > value) {
                value = result.score;
                bestCol = c;
            }
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return { score: value, column: bestCol };
    } else {
        let value = Infinity;
        for (const c of validCols) {
            const row = dropRowOnBoard(board, c);
            board[row][c] = PLAYER_COLOR;
            const result = minimax(board, depth - 1, alpha, beta, true);
            board[row][c] = null;
            if (result.score < value) {
                value = result.score;
                bestCol = c;
            }
            beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        return { score: value, column: bestCol };
    }
}

function pickAiColumn() {
    const board = boardFromStones();
    const depth = getCpuSearchDepth();
    const result = minimax(board, depth, -Infinity, Infinity, true);
    // 鍾離の封鎖列を考慮：AIがブロック列を選んだ場合は次善の列を選ぶ
    const validNonBlocked = getValidColumns().filter(c => !zhongliBlockedCols.includes(c));
    if (validNonBlocked.length === 0) return getValidColumns()[0]; // 全列封鎖（理論上ありえない）
    if (result.column !== undefined && !zhongliBlockedCols.includes(result.column) && getDropRow(result.column) >= 0) {
        return result.column;
    }
    return validNonBlocked[0];
}

// CPUが「不利」と判断する条件：相手に即勝ち筋がある、またはチャージで大きく差をつけられている
function cpuShouldUseAbility() {
    if (!abilityAvailable('cpu')) return false;
    const playerAheadOnCharge = playerCharge > cpuCharge + 30;
    return hasImmediateThreat(PLAYER_COLOR) || playerAheadOnCharge;
}

//------------------------------------------------------------------------------------------------
// 必殺技：石削除系の共通ヘルパー（gameLogic.jsのFirestore版を、ローカルstones向けに書き直したもの）

function getStonesToDeleteLocal(topPositions, rowsToDelete) {
    const keys = [];
    for (const { column, row } of topPositions) {
        if (rowsToDelete === 6) {
            for (let r = 0; r <= 5; r++) keys.push(`${column}_${r}`);
        } else {
            for (let offset = 0; offset < rowsToDelete; offset++) {
                const r = row + offset;
                if (r > 5) break;
                const key = `${column}_${r}`;
                if (stones[key]) keys.push(key);
            }
        }
    }
    return keys;
}

// 石がある列の中からランダムにcount列選び、それぞれの一番上の石の位置を返す
function getRandomTopStonesLocal(count) {
    const columnsWithStones = [...new Set(Object.keys(stones).map(k => k.split('_')[0]))];
    const n = Math.min(count, columnsWithStones.length);
    const pool = [...columnsWithStones];
    const chosen = [];
    while (chosen.length < n && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        chosen.push(pool.splice(idx, 1)[0]);
    }
    return chosen.map(colStr => {
        const col = parseInt(colStr, 10);
        const rowsFilled = Object.keys(stones)
            .filter(k => k.startsWith(`${col}_`))
            .map(k => parseInt(k.split('_')[1], 10));
        return { column: col, row: Math.min(...rowsFilled) };
    });
}

// 全列の上から3段（row 0,1,2）。石の有無を問わない
function getTopRowsAllColumnsLocal() {
    const keys = [];
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r <= 2; r++) keys.push(`${c}_${r}`);
    }
    return keys;
}

async function highlightStonesLocal(keys, duration) {
    const validKeys = [...new Set(keys)].filter(k => stones[k]);
    if (validKeys.length === 0) return;
    const canvasRect = canvas.getBoundingClientRect();
    const cellW = canvasRect.width / cols;
    const cellH = canvasRect.height / rows;
    const cells = validKeys.map(key => {
        const [c, r] = key.split('_').map(Number);
        const cell = document.createElement('div');
        cell.classList.add('cell', 'selected');
        cell.style.position = 'fixed';
        cell.style.width = `${cellW}px`;
        cell.style.height = `${cellH}px`;
        cell.style.left = `${canvasRect.left + c * cellW}px`;
        cell.style.top = `${canvasRect.top + r * cellH}px`;
        cell.style.pointerEvents = 'none';
        document.body.appendChild(cell);
        return cell;
    });
    await wait(duration);
    cells.forEach(cell => cell.remove());
}

async function deleteStonesLocal(keys) {
    const validKeys = [...new Set(keys)].filter(k => stones[k]);
    if (validKeys.length === 0) return;

    const canvasRect = canvas.getBoundingClientRect();
    const cellW = canvasRect.width / cols;
    const cellH = canvasRect.height / rows;

    const cells = validKeys.map(key => {
        const [c, r] = key.split('_').map(Number);
        const cell = document.createElement('div');
        cell.classList.add('cell', 'selected');
        cell.style.position = 'fixed';
        cell.style.width = `${cellW}px`;
        cell.style.height = `${cellH}px`;
        cell.style.left = `${canvasRect.left + c * cellW}px`;
        cell.style.top = `${canvasRect.top + r * cellH}px`;
        cell.style.pointerEvents = 'none';
        document.body.appendChild(cell);
        fxParticles(canvasRect.left + (c + 0.5) * cellW, canvasRect.top + (r + 0.5) * cellH);
        return cell;
    });

    fxFlash('rgba(255, 140, 0, 0.35)', 180);
    fxShake(document.getElementById('centerPanel'), Math.min(6 + validKeys.length, 18), 350);

    await wait(450);
    cells.forEach(cell => cell.remove());
    validKeys.forEach(key => delete stones[key]);
    drawBoard();
}

// 鍾離：封鎖列のビジュアルオーバーレイ（×マーク表示）
function showZhongliBlockOverlay() {
    removeZhongliBlockOverlay();
    if (zhongliBlockedCols.length === 0) return;
    const boardWrap = document.getElementById('boardWrap');
    const wrapRect = boardWrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const colWidth = wrapRect.width / cols;
    for (const col of zhongliBlockedCols) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.width = `${colWidth}px`;
        overlay.style.height = `${canvasRect.height}px`;
        overlay.style.left = `${wrapRect.left + col * colWidth}px`;
        overlay.style.top = `${canvasRect.top}px`;
        overlay.style.pointerEvents = 'none';
        overlay.style.backgroundColor = 'rgba(80, 80, 80, 0.38)';
        overlay.style.border = '2px dashed rgba(255,255,255,0.7)';
        overlay.style.boxSizing = 'border-box';
        overlay.style.zIndex = '50';
        const lockLabel = document.createElement('div');
        lockLabel.style.cssText = 'text-align:center;color:white;font-size:24px;margin-top:6px;text-shadow:0 0 6px #000;font-weight:bold;';
        lockLabel.textContent = '×';
        overlay.appendChild(lockLabel);
        document.body.appendChild(overlay);
        zhongliBlockOverlays.push(overlay);
    }
}

function removeZhongliBlockOverlay() {
    zhongliBlockOverlays.forEach(el => el.remove());
    zhongliBlockOverlays = [];
}

// 鍾離：自分のターン開始時に自動再封鎖を確認する
function zhongliPreTurnCheck(side) {
    if (!zhongliReblockPending || zhongliCasterSide !== side) return;
    zhongliReblockPending = false;
    const validCols = getValidColumns();
    const picked = getRandomElements(validCols, Math.min(2, validCols.length));
    zhongliBlockedCols = picked;
    showZhongliBlockOverlay();
}

// 鍾離：相手がターンを終えたあとの封鎖解除・継続を判定する
function zhongliPostOpponentDrop() {
    if (zhongliBlockedCols.length === 0 && !zhongliReblockPending) return;
    if (zhongliReblockPending) {
        // 相手1回目ターン終了→ブロック一時解除（次の自分ターンで再封鎖）
        zhongliBlockedCols = [];
        removeZhongliBlockOverlay();
    } else {
        // 相手2回目ターン終了（再封鎖後）→ 完全解除
        zhongliBlockedCols = [];
        zhongliCasterSide = null;
        removeZhongliBlockOverlay();
    }
}

// ドゥリン：ターン開始時の自動破壊（awaitが必要なため async）
async function durinPreTurnEffect(side) {
    if (!durinAutoDeletePending || durinCasterSide !== side) return;
    durinAutoDeletePending = false;
    durinCasterSide = null;
    const allKeys = Object.keys(stones);
    const toDelete = getRandomElements(allKeys, Math.min(2, allKeys.length));
    if (toDelete.length === 0) return;
    await highlightStonesLocal(toDelete, 450);
    await deleteStonesLocal(toDelete);
    applyGravityLocal(toDelete);
    drawBoard();
}

function applyGravityLocal(deletedKeys) {
    const affectedCols = new Set(deletedKeys.map(k => k.split('_')[0]));
    for (const col of affectedCols) {
        const colStones = [];
        for (let r = rows - 1; r >= 0; r--) {
            const key = `${col}_${r}`;
            if (stones[key]) {
                colStones.push(stones[key]);
                delete stones[key];
            }
        }
        for (let i = 0; i < colStones.length; i++) {
            stones[`${col}_${rows - 1 - i}`] = colStones[i];
        }
    }
}

//------------------------------------------------------------------------------------------------
// 必殺技：実行本体（9キャラ分。アベンチュリンのみソロ専用の代替効果）

function abilityAvailable(side) {
    const chara = side === 'player' ? playerChara : cpuChara;
    const charge = side === 'player' ? playerCharge : cpuCharge;
    const ultCount = side === 'player' ? playerUltCount : cpuUltCount;
    if (!chara) return false;
    if (charge < 150) return false;
    if (turnCount < chara.AbilityUseTurn) return false;
    if (chara.charaID === '008' && ultCount >= ABEN_MAX_USES) return false;
    if (chara.charaID === '005' && changeStone > 0) return false; // 花火：色反転が有効な間は再使用不可
    return true;
}

async function executeAbility(side, charaID) {
    switch (charaID) {
        case '001': // 放浪者：ランダム4列、上から2個
            await deleteStonesLocal(getStonesToDeleteLocal(getRandomTopStonesLocal(4), 2));
            break;
        case '002': // シトラリ：ランダム3列、上から1個
            await deleteStonesLocal(getStonesToDeleteLocal(getRandomTopStonesLocal(3), 1));
            break;
        case '003': // アルハイゼン：中央3列からランダム2列を全消し
            await deleteStonesLocal(getStonesToDeleteLocal(getRandomTwoNumbers(), 6));
            break;
        case '004': // ナヴィア：全列の上から3段を消す
            await deleteStonesLocal(getTopRowsAllColumnsLocal());
            break;
        case '005': // 花火：色反転（このターン+次の相手ターン）
            changeStone = changeStone === 0 ? 2 : 3;
            break;
        case '006': { // マダム・ヘルタ：ランダム1列を全消し
            await deleteStonesLocal(getStonesToDeleteLocal(getRandomTopStonesLocal(1), 6));
            break;
        }
        case '007': // キャストリス：左右の縦4列からランダム3列を全消し
            await deleteStonesLocal(getStonesToDeleteLocal(getRandomThreeNumbers(), 6));
            break;
        case '008': { // アベンチュリン（ソロ専用）：相手のチャージを減少
            if (side === 'player') {
                cpuCharge = Math.max(0, cpuCharge - ABEN_CHARGE_PENALTY);
            } else {
                playerCharge = Math.max(0, playerCharge - ABEN_CHARGE_PENALTY);
            }
            break;
        }
        case '009': { // ホタル：ランダムな空き列に自分の石を1個追加投下（ターンは消費しない）
            const validCols = getValidColumns();
            if (validCols.length > 0) {
                const col = validCols[Math.floor(Math.random() * validCols.length)];
                const role = side === 'player' ? PLAYER_COLOR : CPU_COLOR;
                await dropAt(col, applyColorSwap(role));
            }
            break;
        }
        case '011': { // ローエン：下から2段目（row 4）の石を全て破壊
            const keysToDelete = Object.keys(stones).filter(k => k.endsWith('_4'));
            if (keysToDelete.length > 0) {
                await highlightStonesLocal(keysToDelete, 450);
                await deleteStonesLocal(keysToDelete);
                applyGravityLocal(keysToDelete);
                drawBoard();
            }
            break;
        }
        case '012': { // 鍾離：ランダム2列を封鎖
            const validColsZ = getValidColumns();
            const picked = getRandomElements(validColsZ, Math.min(2, validColsZ.length));
            zhongliBlockedCols = picked;
            zhongliReblockPending = true;
            zhongliCasterSide = side;
            showZhongliBlockOverlay();
            await wait(600);
            break;
        }
        case '013': { // サフェル：相手の能力をコピー
            const opponentChara = side === 'player' ? cpuChara : playerChara;
            if (!opponentChara || opponentChara.charaID === '013') break; // 不発
            await executeAbility(side, opponentChara.charaID);
            break;
        }
        case '014': { // ドゥリン：今すぐ2個破壊＋次の自分ターンに2個自動破壊
            const allKeysD = Object.keys(stones);
            const toDeleteD = getRandomElements(allKeysD, Math.min(2, allKeysD.length));
            if (toDeleteD.length > 0) {
                await highlightStonesLocal(toDeleteD, 450);
                await deleteStonesLocal(toDeleteD);
                applyGravityLocal(toDeleteD);
                drawBoard();
            }
            durinAutoDeletePending = true;
            durinCasterSide = side;
            break;
        }
        case '015': { // ケリュドラ：次の相手ターンに追加投下
            cerluaActive = true;
            cerluaCasterSide = side;
            await wait(400);
            break;
        }
        case '016': { // 銀狼LV.999：自分の勝利数+1（3勝で即試合終了）
            if (side === 'player') {
                playerRoundWins++;
            } else {
                cpuRoundWins++;
            }
            updateWinIndicators();

            if (playerRoundWins >= 3 || cpuRoundWins >= 3) {
                gameOver = true;
                updateSpecialMoveButtonVisibility();
                if (side === 'player' && currentUid) {
                    try {
                        const newlyUnlocked = await recordSoloWin(currentUid, getCpuDifficulty(), playerChara?.charaID);
                        newlyUnlocked.forEach((id) => {
                            showAchievementToast(id);
                            const unlocked = characterData.find(c => c.requiredAchievementId === id);
                            if (unlocked) showCharacterUnlockModal(unlocked);
                        });
                    } catch (e) {
                        console.error("[Achievement] ソロ勝利の記録に失敗:", e);
                    }
                }
                await showFinalResult(side === 'player' ? 'win' : 'lose');
            } else {
                startingSide = side === 'player' ? 'cpu' : 'player';
                await showRoundResult(side === 'player' ? 'win' : 'lose');
                await startNextRound();
            }
            break;
        }
        case '010': { // ルアン・メェイ：相手3個変換→自分6個破壊(重力あり)
            const myColor = applyColorSwap(side === 'player' ? PLAYER_COLOR : CPU_COLOR);
            const opponentColor = applyColorSwap(side === 'player' ? CPU_COLOR : PLAYER_COLOR);

            // Phase 1: 相手の石をランダムに3個選んで自分の色に変換
            const opponentKeys = Object.keys(stones).filter(k => stones[k] === opponentColor);
            const keysToConvert = getRandomElements(opponentKeys, Math.min(3, opponentKeys.length));
            if (keysToConvert.length > 0) {
                await highlightStonesLocal(keysToConvert, 450);
                for (const key of keysToConvert) {
                    stones[key] = myColor;
                }
                drawBoard();
            }

            if (checkWinLocal()) return; // 変換で勝利確定なら Phase2 をスキップ

            await wait(1000);

            // Phase 2: 自分の石をランダムに6個選んで破壊（重力落下あり）
            const myKeys = Object.keys(stones).filter(k => stones[k] === myColor);
            const keysToDelete = getRandomElements(myKeys, Math.min(6, myKeys.length));
            if (keysToDelete.length > 0) {
                await deleteStonesLocal(keysToDelete);
                applyGravityLocal(keysToDelete);
                drawBoard();
            }
            break;
        }
    }
}

async function useAbility(side) {
    const chara = side === 'player' ? playerChara : cpuChara;
    if (!chara || abilityInProgress) return;
    abilityInProgress = true;

    if (side === 'player') {
        playerCharge -= 150;
        playerUltCount++;
    } else {
        cpuCharge -= 150;
        cpuUltCount++;
    }
    updateGaugeUI();

    AbilityStandby.currentTime = 0;
    AbilityStandby.play().catch(() => {});

    // ult音声を再生
    const ultAudio = side === 'player' ? playerUltAudio : cpuUltAudio;
    if (ultAudio) {
        ultAudio.currentTime = 0;
        ultAudio.play().catch(() => {});
    }

    try {
        await showCutIn(chara);
        await executeAbility(side, chara.charaID);
    } finally {
        // ★abilityInProgressをfalseにしてから再描画する（updateGaugeUI内のボタン表示/盤面操作可否判定が
        //   正しい最終状態を見られるようにするため。順序を間違えると必殺技後に盤面が操作不能のまま固まる）
        abilityInProgress = false;
        updateGaugeUI();
    }
}

//------------------------------------------------------------------------------------------------
// カットイン演出（必殺技演出と統一）

function showCutIn(chara) {
    return new Promise(resolve => {
        const cutinImage = document.getElementById('cutin-image');
        const cutinContainer = document.getElementById('cutin-container');
        const centerPanel = document.getElementById('centerPanel');

        cutinImage.src = chara.AbilityCutImage;
        cutinImage.onload = () => {
            cutinContainer.style.display = 'block';
            const parentWidth = centerPanel.offsetWidth;
            cutinImage.classList.remove('ult-cutin-glow');
            cutinImage.style.transition = 'none';
            cutinImage.style.right = `-${parentWidth}px`;
            cutinImage.style.opacity = '0';
            cutinImage.style.transform = 'scale(1.3) rotate(-3deg)';

            setTimeout(() => {
                fxFlash('rgba(255, 60, 20, 0.55)', 250);
                fxShake(centerPanel, 16, 500);

                cutinImage.style.transition =
                    'right 0.6s cubic-bezier(0.17, 0.84, 0.44, 1), opacity 0.4s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                cutinImage.style.right = '0';
                cutinImage.style.opacity = '1';
                cutinImage.style.transform = 'scale(1) rotate(0deg)';
                cutinImage.classList.add('ult-cutin-glow');
            }, 50);

            setTimeout(() => {
                cutinImage.classList.remove('ult-cutin-glow');
                cutinImage.style.transition = 'right 1s ease-in-out, opacity 1s ease-in-out, transform 1s ease-in-out';
                cutinImage.style.right = `-${parentWidth}px`;
                cutinImage.style.opacity = '0';
                cutinImage.style.transform = 'scale(1.1)';

                setTimeout(() => {
                    cutinContainer.style.display = 'none';
                    cutinImage.style.transform = '';
                    resolve();
                }, 1000);
            }, 1800);
        };
    });
}

//------------------------------------------------------------------------------------------------
// 描画

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);

            const key = `${c}_${r}`;
            if (stones[key] && key !== droppingKey) {
                drawPiece(c, r * cellSize, stones[key]);
            }
        }
    }
}

function drawPiece(column, y, role) {
    _drawPiece(ctx, column, y, getDisplayColor(role), cellSize);
}

function animateStoneDrop(column, row, role) {
    return new Promise(resolve => {
        let currentY = 0;
        const targetY = row * cellSize;
        droppingKey = `${column}_${row}`;

        const interval = setInterval(() => {
            if (currentY < targetY) {
                currentY += 10;
                drawBoard();
                drawPiece(column, Math.min(currentY, targetY), role);
            } else {
                clearInterval(interval);
                droppingKey = null;
                drawBoard();
                resolve();
            }
        }, 10);
    });
}

// 花火の色反転が有効な間、実際に置かれる色を反転させる（勝敗判定もこの色で行う＝gameLogic.jsと同じ仕様）
function applyColorSwap(role) {
    if (changeStone > 0) return role === 'red' ? 'yellow' : 'red';
    return role;
}

function dispTopStone() {
    const topCtx = topCanvas.getContext('2d');
    topCtx.clearRect(0, 0, topCanvas.width, topCanvas.height);
    if (gameOver || turn !== 'player') return;

    const centerY = topCanvas.height / 2;
    const color = getDisplayColor(applyColorSwap(PLAYER_COLOR));

    topCtx.fillStyle = color;
    topCtx.beginPath();
    topCtx.arc(nowCol * cellSize + cellSize / 2, centerY, (cellSize / 2) - 5, 0, Math.PI * 2);
    topCtx.fill();
    topCtx.closePath();

    topCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
    topCtx.beginPath();
    topCtx.arc(nowCol * cellSize + cellSize / 2 - 10, centerY - 10, (cellSize / 2) - 20, 0, Math.PI * 2);
    topCtx.fill();
    topCtx.closePath();
}

function highlightColumn(col) {
    const boardWrap = document.getElementById('boardWrap');
    const wrapRect = boardWrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    if (highlightedColumn) highlightedColumn.remove();
    if (gameOver || turn !== 'player') return;

    highlightedColumn = document.createElement('div');
    highlightedColumn.classList.add('column', 'selected');

    const colWidth = wrapRect.width / cols;
    highlightedColumn.style.position = 'fixed';
    highlightedColumn.style.width = `${colWidth}px`;
    highlightedColumn.style.height = `${canvasRect.height}px`;
    highlightedColumn.style.left = `${wrapRect.left + col * colWidth}px`;
    highlightedColumn.style.top = `${canvasRect.top}px`;
    highlightedColumn.style.pointerEvents = 'none';
    highlightedColumn.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
    highlightedColumn.style.setProperty('--shadow-color', 'rgba(0, 255, 0, 0.6)');

    document.body.appendChild(highlightedColumn);
}

async function highlightWinningCells(positions) {
    const canvasRect = canvas.getBoundingClientRect();
    const cellW = canvasRect.width / cols;
    const cellH = canvasRect.height / rows;

    const cells = positions.map(([r, c]) => {
        const cell = document.createElement('div');
        cell.classList.add('cell', 'selected');
        cell.style.position = 'fixed';
        cell.style.width = `${cellW}px`;
        cell.style.height = `${cellH}px`;
        cell.style.left = `${canvasRect.left + c * cellW}px`;
        cell.style.top = `${canvasRect.top + r * cellH}px`;
        cell.style.pointerEvents = 'none';
        document.body.appendChild(cell);
        return cell;
    });

    await wait(1200);
    cells.forEach(cell => cell.remove());
}

//------------------------------------------------------------------------------------------------
// チャージゲージ・必殺技ボタン表示

function updateGaugeUI() {
    document.getElementById('chargeGageNow_1').innerText = playerCharge;
    const g1 = document.getElementById('playerGauge1');
    g1.style.height = Math.min((playerCharge / 200) * 100, 100) + '%';
    g1.style.backgroundColor = playerCharge >= 150 ? '#f00' : playerCharge >= 75 ? '#ffbb00' : '#1eff00';

    document.getElementById('chargeGageNow_2').innerText = cpuCharge;
    const g2 = document.getElementById('playerGauge2');
    g2.style.height = Math.min((cpuCharge / 200) * 100, 100) + '%';
    g2.style.backgroundColor = cpuCharge >= 150 ? '#f00' : cpuCharge >= 75 ? '#ffbb00' : '#1eff00';

    updateSpecialMoveButtonVisibility();
}

// 連打対策：「今、盤面をクリックしてよい状態か」を一箇所で管理する。
// JS変数のロック（playerMoveInProgress等）だけでは、ロック中に発生したクリックイベント自体は
// ブラウザにキューイングされてしまい、ロック解除後（次のターン・次のラウンド）に
// 古いクリックが連続消化されて「気付いたら3連勝していた」という事態が起きる。
// pointer-events:none にしてクリックイベントの発生自体を止めることで、これを防ぐ。
function setBoardInteractive(enabled) {
    canvas.style.pointerEvents = enabled ? 'auto' : 'none';
    topCanvas.style.pointerEvents = enabled ? 'auto' : 'none';
}

function updateSpecialMoveButtonVisibility() {
    const myTurnReady = turn === 'player' && !gameOver && !abilityInProgress && !playerMoveInProgress;
    setBoardInteractive(myTurnReady);

    const img = document.querySelector('#thumbnailContainerP1 img');
    if (!img) return;

    if (myTurnReady && abilityAvailable('player')) {
        img.classList.add('ult-effect'); // 虹色：チャージ準備完了の合図
    } else {
        // 条件を満たさなくなったら即座にボタンを隠してエフェクトもリセット
        img.classList.remove('ult-effect');
        img.classList.remove('glowing-effect');
        img.classList.remove('selected');
        document.getElementById('specialMoveButtonContainer').style.display = 'none';
    }
}

//------------------------------------------------------------------------------------------------
// ターン進行

function showTurnLabel(text) {
    const turnLabel = document.getElementById('turnLabel');
    turnLabel.style.background = turn === 'player'
        ? 'linear-gradient(90deg, rgba(0, 153, 255, 0.8), rgba(100, 200, 255, 0.8))'
        : 'linear-gradient(90deg, rgba(255, 100, 0, 0.8), rgba(255, 180, 80, 0.8))';
    turnLabel.innerHTML = `${text}<br>${turnCount}ターン目`;
    turnLabel.style.display = 'block';
    setTimeout(() => (turnLabel.style.opacity = 1), 10);
    setTimeout(() => (turnLabel.style.opacity = 0), 1000);
    setTimeout(() => (turnLabel.style.display = 'none'), 1500);
}

async function dropAt(column, role) {
    const row = getDropRow(column);
    if (row < 0) return false;
    stones[`${column}_${row}`] = role;
    moveSound.currentTime = 0;
    moveSound.play().catch(() => {});
    await animateStoneDrop(column, row, role);
    return true;
}

// BO3(3試合先取)。チャージ・必殺技使用回数はラウンドをまたいで持ち越す（通常マッチと同じ仕様）
function updateWinIndicators() {
    document.getElementById('player1_win').innerText = '◆'.repeat(playerRoundWins) + '◇'.repeat(3 - playerRoundWins);
    document.getElementById('player2_win').innerText = '◆'.repeat(cpuRoundWins) + '◇'.repeat(3 - cpuRoundWins);
}

async function checkGameEnd() {
    if (gameOver) return true; // 銀狼など盤外終了の場合
    const winResult = checkWinLocal();
    if (winResult) {
        gameOver = true;
        updateSpecialMoveButtonVisibility(); // 勝敗確定と同時に必殺技ボタンを即座に隠す
        await highlightWinningCells(winResult.positions);

        const winnerSide = winResult.color === PLAYER_COLOR ? 'player' : 'cpu';
        if (winnerSide === 'player') playerRoundWins++; else cpuRoundWins++;
        updateWinIndicators();

        if (playerRoundWins >= 3 || cpuRoundWins >= 3) {
            if (winnerSide === 'player' && currentUid) {
                try {
                    const newlyUnlocked = await recordSoloWin(currentUid, getCpuDifficulty(), playerChara?.charaID);
                    newlyUnlocked.forEach((id) => {
                        showAchievementToast(id);
                        const unlocked = characterData.find(c => c.requiredAchievementId === id);
                        if (unlocked) showCharacterUnlockModal(unlocked);
                    });
                } catch (e) {
                    console.error("[Achievement] ソロ勝利の記録に失敗:", e);
                }
            }
            await showFinalResult(winnerSide === 'player' ? 'win' : 'lose');
        } else {
            startingSide = winnerSide === 'player' ? 'cpu' : 'player'; // 負けた側が次ラウンドの先攻
            await showRoundResult(winnerSide === 'player' ? 'win' : 'lose');
            await startNextRound();
        }
        return true;
    }
    if (isBoardFull()) {
        gameOver = true;
        updateSpecialMoveButtonVisibility();
        startingSide = Math.random() < 0.5 ? 'player' : 'cpu'; // 引き分けはランダムで次ラウンドの先攻を決定
        await showRoundResult('draw');
        await startNextRound();
        return true;
    }
    return false;
}

// ラウンド結果（BO3未決着時）：短く表示して次ラウンドへ自動的に進む
async function showRoundResult(result) {
    const winLabel = document.getElementById('winLabel');
    const burstX = window.innerWidth / 2;
    const burstY = window.innerHeight / 2;
    const score = `${playerRoundWins} - ${cpuRoundWins}`;

    if (result === 'win') {
        winLabel.innerHTML = `YOU WIN!<br>${score}`;
        fxFlash('rgba(255, 215, 0, 0.4)', 250);
        fxParticles(burstX, burstY, ['#ffd700', '#ff7a00', '#fff6cc', '#5cff5c', '#5cc8ff'], 26);
    } else if (result === 'lose') {
        winLabel.innerHTML = `YOU LOSE!<br>${score}`;
        fxFlash('rgba(180, 0, 0, 0.45)', 220);
        fxShake(document.getElementById('centerPanel'), 14, 400);
    } else {
        winLabel.innerHTML = `DRAW<br>${score}`;
        fxFlash('rgba(200, 200, 200, 0.3)', 200);
    }

    winLabel.classList.remove('label-pop');
    winLabel.style.display = 'block';
    winLabel.style.opacity = 0;
    setTimeout(() => {
        winLabel.style.opacity = 1;
        winLabel.classList.add('label-pop');
    }, 10);

    await wait(2200);
    winLabel.style.opacity = 0;
    await wait(500);
    winLabel.style.display = 'none';
}

// 最終結果（BO3決着時）：もう一度/ロビーに戻るボタンを表示する
async function showFinalResult(result) {
    const winLabel = document.getElementById('winLabel');
    const burstX = window.innerWidth / 2;
    const burstY = window.innerHeight / 2;
    const score = `${playerRoundWins} - ${cpuRoundWins}`;

    if (result === 'win') {
        winLabel.innerHTML = `YOU WIN!<br>${score}`;
        fxFlash('rgba(255, 215, 0, 0.4)', 250);
        fxParticles(burstX, burstY, ['#ffd700', '#ff7a00', '#fff6cc', '#5cff5c', '#5cc8ff'], 26);
    } else {
        winLabel.innerHTML = `YOU LOSE!<br>${score}`;
        fxFlash('rgba(180, 0, 0, 0.45)', 220);
        fxShake(document.getElementById('centerPanel'), 14, 400);
    }

    winLabel.classList.remove('label-pop');
    winLabel.style.display = 'block';
    winLabel.style.opacity = 0;
    setTimeout(() => {
        winLabel.style.opacity = 1;
        winLabel.classList.add('label-pop');
    }, 10);

    await wait(900);
    document.getElementById('soloResultPanel').style.display = 'block';
}

// ラウンドのみリセット（盤面・ターン数）。チャージ・必殺技使用回数・ラウンド勝数は持ち越す
async function startNextRound() {
    stones = {};
    turnCount = 1;
    changeStone = 0;
    gameOver = false;
    droppingKey = null;
    turn = startingSide;

    // クロスターンエフェクトをリセット
    zhongliBlockedCols = [];
    zhongliReblockPending = false;
    zhongliCasterSide = null;
    removeZhongliBlockOverlay();
    durinAutoDeletePending = false;
    durinCasterSide = null;
    cerluaActive = false;
    cerluaCasterSide = null;

    if (highlightedColumn) {
        highlightedColumn.remove();
        highlightedColumn = null;
    }

    drawBoard();
    updateGaugeUI();

    if (turn === 'player') {
        showTurnLabel('あなたの番');
        dispTopStone();
    } else {
        dispTopStone();
        await cpuTurn();
    }
}

async function handlePlayerDrop(column) {
    // ★ここから次のawaitまでは同期的に実行されるため、チェックと同時にロックを立てることで
    //   連打（複数のクリック/タップイベント）による多重実行を確実に防げる
    if (gameOver || turn !== 'player' || abilityInProgress || playerMoveInProgress) return;
    if (column < 0 || column >= cols) return;
    if (getDropRow(column) < 0) return; // 満杯の列は無視
    if (zhongliBlockedCols.includes(column)) return; // 鍾離：封鎖中の列には投下不可

    playerMoveInProgress = true;
    setBoardInteractive(false); // ロックと同時に盤面のクリックイベント自体を止める（キューイング防止）
    try {
        if (highlightedColumn) {
            highlightedColumn.remove();
            highlightedColumn = null;
        }

        const droppedColor = applyColorSwap(PLAYER_COLOR);
        const ok = await dropAt(column, droppedColor);
        if (!ok) return;

        // ケリュドラ：CPUが発動した場合、プレイヤーの投下後に追加投下
        if (cerluaActive && cerluaCasterSide === 'cpu') {
            cerluaActive = false;
            cerluaCasterSide = null;
            const extraCol = getDropRow(column) >= 0 ? column
                : getValidColumns().find(c => !zhongliBlockedCols.includes(c)) ?? -1;
            if (extraCol >= 0) await dropAt(extraCol, droppedColor);
        }

        playerCharge = Math.min(200, playerCharge + playerChara.charge);
        if (changeStone > 0) changeStone--;
        turnCount++;
        updateGaugeUI();

        // 鍾離：プレイヤーが投下した後（相手の1ターン目終了）
        if (zhongliCasterSide === 'cpu') zhongliPostOpponentDrop();

        if (await checkGameEnd()) return;
        await cpuTurn();
    } finally {
        // ★ロック解除後に必ず再評価する。checkGameEnd→startNextRound等の内部でも
        //   updateGaugeUIは呼ばれているが、その時点ではまだplayerMoveInProgress=trueのため
        //   盤面が無効化されたまま残ってしまう。ここで最終状態を反映させて復帰させる。
        playerMoveInProgress = false;
        updateSpecialMoveButtonVisibility();
    }
}

async function cpuTurn() {
    turn = 'cpu';

    // CPUターン開始時のプレターンエフェクト
    zhongliPreTurnCheck('cpu');
    await durinPreTurnEffect('cpu');
    if (await checkGameEnd()) return;

    showTurnLabel('CPUの番');
    updateSpecialMoveButtonVisibility();
    dispTopStone();

    await wait(2000); // 「考えている」演出のための待機

    if (cpuShouldUseAbility()) {
        await useAbility('cpu');
        if (await checkGameEnd()) return;
        await wait(400);
    }

    const col = pickAiColumn();
    const droppedColor = applyColorSwap(CPU_COLOR);
    await dropAt(col, droppedColor);
    cpuCharge = Math.min(200, cpuCharge + cpuChara.charge);

    // ケリュドラ：プレイヤーが発動した場合、CPUの投下後に追加投下
    if (cerluaActive && cerluaCasterSide === 'player') {
        cerluaActive = false;
        cerluaCasterSide = null;
        const extraCol = getDropRow(col) >= 0 ? col
            : getValidColumns().find(c => !zhongliBlockedCols.includes(c)) ?? -1;
        if (extraCol >= 0) await dropAt(extraCol, droppedColor);
    }

    if (changeStone > 0) changeStone--;
    turnCount++;

    // 鍾離：CPUが投下した後（相手の1ターン目終了）
    if (zhongliCasterSide === 'player') zhongliPostOpponentDrop();

    updateGaugeUI();

    if (await checkGameEnd()) return;

    // プレイヤーターン開始前のプレターンエフェクト
    zhongliPreTurnCheck('player');
    await durinPreTurnEffect('player');
    if (await checkGameEnd()) return;

    turn = 'player';
    showTurnLabel('あなたの番');
    updateSpecialMoveButtonVisibility();
    dispTopStone();
}

//------------------------------------------------------------------------------------------------
// キャラクター情報表示

function abilityDetailText(chara) {
    if (chara.charaID === '008') {
        return `【ソロモード専用効果】相手の現在のチャージを${ABEN_CHARGE_PENALTY}減少させる。(${ABEN_MAX_USES}回まで使用可能。時間制限がないため元の効果から変更しています)`;
    }
    return chara.AbilityDetail;
}

function displayCharaPanel(side, chara) {
    const suffix = side === 'player' ? '1' : '2';
    document.getElementById(`charaID_${suffix}`).innerText = chara.name;
    document.getElementById(`charge_${suffix}`).innerText = chara.charge;
    document.getElementById(`Ability_${suffix}`).innerText = chara.Ability;
    document.getElementById(`AbilityDetail_${suffix}`).innerText = abilityDetailText(chara);

    const container = document.getElementById(`thumbnailContainerP${suffix}`);
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = chara.src;
    img.alt = chara.name;
    img.className = 'character-thumbnail';
    container.appendChild(img);
}

function pickCpuCharacter() {
    return characterData[Math.floor(Math.random() * characterData.length)];
}

function initCharacters() {
    const playerCharaID = sessionStorage.getItem('soloPlayerCharaID');
    playerChara = characterData.find(c => c.charaID === playerCharaID);
    if (!playerChara) {
        alert('キャラクターが選択されていません。キャラクター選択画面に戻ります。');
        window.location.href = 'select.html?mode=cpu';
        return false;
    }
    const playerName = sessionStorage.getItem('soloPlayerName') || 'プレイヤー';
    document.getElementById('playerName_1').innerText = playerName;

    cpuChara = pickCpuCharacter();
    displayCharaPanel('player', playerChara);
    displayCharaPanel('cpu', cpuChara);
    applyPaneColors();

    // ult音声 Audio オブジェクトを生成
    const voiceVol = parseFloat(document.getElementById('voicevolumeSlider')?.value ?? 0.2);
    playerUltAudio = new Audio(playerChara.voice_ult);
    playerUltAudio.volume = voiceVol;
    cpuUltAudio = new Audio(cpuChara.voice_ult);
    cpuUltAudio.volume = voiceVol;

    return true;
}

// 通常戦のbackcolor_player()(#ffe5e5 / #ffffe5 の不透明な薄色)と同じ見た目になるよう、
// 石カラーを白に向けてratio=0.1で混ぜた「不透明」な色を作る（rgbaの半透明だと壁紙が透けて見えてしまうため）
function paleTint(hex, ratio = 0.1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const mix = (c) => Math.round(c * ratio + 255 * (1 - ratio));
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function applyPaneColors() {
    document.getElementById('leftPane').style.backgroundColor = paleTint(getDisplayColor(PLAYER_COLOR));
    document.getElementById('rightPane').style.backgroundColor = paleTint(getDisplayColor(CPU_COLOR));
}

//------------------------------------------------------------------------------------------------
// リセット

async function resetGame() {
    stones = {};
    gameOver = false;
    nowCol = 3;
    droppingKey = null;
    turnCount = 1;
    changeStone = 0;
    playerCharge = 0;
    cpuCharge = 0;
    playerUltCount = 0;
    cpuUltCount = 0;
    playerRoundWins = 0;
    cpuRoundWins = 0;
    abilityInProgress = false;
    playerMoveInProgress = false;
    startingSide = Math.random() < 0.5 ? 'player' : 'cpu'; // 通常マッチ同様、初戦の先攻はランダム

    // クロスターンエフェクトをリセット
    zhongliBlockedCols = [];
    zhongliReblockPending = false;
    zhongliCasterSide = null;
    removeZhongliBlockOverlay();
    durinAutoDeletePending = false;
    durinCasterSide = null;
    cerluaActive = false;
    cerluaCasterSide = null;

    cpuChara = pickCpuCharacter();
    displayCharaPanel('cpu', cpuChara);
    updateWinIndicators();

    if (highlightedColumn) {
        highlightedColumn.remove();
        highlightedColumn = null;
    }
    document.getElementById('soloResultPanel').style.display = 'none';
    document.getElementById('winLabel').style.display = 'none';

    turn = startingSide;
    updateGaugeUI();
    drawBoard();

    if (turn === 'player') {
        showTurnLabel('あなたの番');
        dispTopStone();
    } else {
        dispTopStone();
        await cpuTurn();
    }
}

//------------------------------------------------------------------------------------------------
// 入力（PC: ホバー追従+クリック / スマホ: タップでドロップ）

function getColumnFromEvent(event) {
    const clientX = event.touches && event.touches.length > 0
        ? event.touches[0].clientX
        : event.changedTouches && event.changedTouches.length > 0
            ? event.changedTouches[0].clientX
            : event.clientX;
    const boardWrap = document.getElementById('boardWrap');
    const rect = boardWrap.getBoundingClientRect();
    return Math.floor((clientX - rect.left) / (rect.width / cols));
}

function setupInput() {
    let touchStartX = 0;
    let touchStartY = 0;
    const TAP_THRESHOLD = 15;

    function updateHover(event) {
        const col = getColumnFromEvent(event);
        if (col < 0 || col >= cols) return;
        nowCol = col;
        highlightColumn(col);
        dispTopStone();
    }

    function handleSoloTap(col) {
        if (getClickMode() === 'single') {
            handlePlayerDrop(col);
            return;
        }
        // 2クリックモード：同じ列を2回クリックで投下
        if (pendingDropCol === col) {
            pendingDropCol = null;
            handlePlayerDrop(col);
        } else {
            pendingDropCol = col;
            nowCol = col;
            highlightColumn(col);
            dispTopStone();
        }
    }

    topCanvas.addEventListener('mousemove', updateHover);
    topCanvas.addEventListener('click', (event) => {
        const col = getColumnFromEvent(event);
        handleSoloTap(col);
    });

    canvas.addEventListener('mousemove', updateHover);
    canvas.addEventListener('click', (event) => {
        const col = getColumnFromEvent(event);
        handleSoloTap(col);
    });

    [topCanvas, canvas].forEach(el => {
        el.addEventListener('touchstart', (event) => {
            event.preventDefault();
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
            updateHover(event);
        }, { passive: false });

        el.addEventListener('touchmove', (event) => {
            event.preventDefault();
            updateHover(event);
        }, { passive: false });

        el.addEventListener('touchend', (event) => {
            const touch = event.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartX);
            const dy = Math.abs(touch.clientY - touchStartY);
            if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
                const col = getColumnFromEvent(event);
                handleSoloTap(col);
            }
        });
    });

    // キャラアイコンをクリックで必殺技ボタンを表示/非表示（チャージ150以上のときのみ）
    document.getElementById('thumbnailContainerP1').addEventListener('click', () => {
        if (turn !== 'player' || gameOver || abilityInProgress || playerMoveInProgress) return;
        if (!abilityAvailable('player')) return;

        const img = document.querySelector('#thumbnailContainerP1 img');
        const btn = document.getElementById('specialMoveButtonContainer');
        const isShowing = btn.style.display === 'block';

        if (isShowing) {
            // 選択解除：glowing → ult-effect（準備完了状態）に戻す
            btn.style.display = 'none';
            img?.classList.remove('glowing-effect');
            img?.classList.remove('selected');
            img?.classList.add('ult-effect');
        } else {
            // 選択：ult-effect → glowing（選択中）に切り替え
            btn.style.display = 'block';
            img?.classList.remove('ult-effect');
            img?.classList.add('glowing-effect');
            img?.classList.add('selected');
            pendingDropCol = null; // 2クリックモードの列選択をリセット
            AbilityStandby.currentTime = 0;
            AbilityStandby.play().catch(() => {});
        }
    });

    document.getElementById('specialMoveButton').addEventListener('click', async () => {
        if (turn !== 'player' || gameOver || abilityInProgress || playerMoveInProgress) return;
        if (!abilityAvailable('player')) return;

        // 発動と同時にボタンとエフェクトをリセット
        document.getElementById('specialMoveButtonContainer').style.display = 'none';
        const img = document.querySelector('#thumbnailContainerP1 img');
        img?.classList.remove('ult-effect');
        img?.classList.remove('glowing-effect');
        img?.classList.remove('selected');

        await useAbility('player');
        if (await checkGameEnd()) return;
        dispTopStone();
    });
}

//------------------------------------------------------------------------------------------------
// 初期化

document.addEventListener('DOMContentLoaded', () => {
    // ヘルプダイアログ（スライダー付き）
    setupSettingsModal('helpButton', 'helpModal');
    const helpSlides = document.querySelectorAll('#helpModal .slide');
    let helpCurrentSlide = 0;
    function updateHelpSlides() {
        helpSlides.forEach((slide, i) => slide.classList.toggle('active', i === helpCurrentSlide));
    }
    document.querySelector('#helpModal .prev-btn')?.addEventListener('click', () => {
        helpCurrentSlide = (helpCurrentSlide - 1 + helpSlides.length) % helpSlides.length;
        updateHelpSlides();
    });
    document.querySelector('#helpModal .next-btn')?.addEventListener('click', () => {
        helpCurrentSlide = (helpCurrentSlide + 1) % helpSlides.length;
        updateHelpSlides();
    });

    // 設定ダイアログ
    setupSettingsModal('settingsButton', 'settingsModal');
    bindSettingsUI(document.getElementById('settingsModal'), () => {
        drawBoard();
        dispTopStone();
        applyPaneColors();
    });

    const systemvolumeSlider = document.getElementById('systemvolumeSlider');
    setupSystemVolumeSlider(systemvolumeSlider);

    const voicevolumeSlider = document.getElementById('voicevolumeSlider');
    if (voicevolumeSlider) {
        voicevolumeSlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            if (playerUltAudio) playerUltAudio.volume = v;
            if (cpuUltAudio) cpuUltAudio.volume = v;
        });
    }

    if (!initCharacters()) return; // キャラ未選択ならselect.htmlへリダイレクト済み

    // レイアウト（バトル画面と同じスケーリング方式）
    const isMobileLayout = window.matchMedia('(max-width: 1024px)').matches;
    if (isMobileLayout) {
        setupMobileBoardLayout('boardWrap', cellSize * cols, cellSize * rows, 110, 0, (scale) => {
            boardScale = scale;
        });
    } else {
        setupScaledLayout('boardWrap', cellSize * cols, 110 + cellSize * rows, (scale) => {
            boardScale = scale;
        });
    }

    setupInput();

    document.getElementById('soloRestartButton').addEventListener('click', resetGame);
    document.getElementById('soloBackButton').addEventListener('click', () => {
        window.location.href = 'select.html?mode=cpu';
    });

    // 退出ボタン：ソロモードはペナルティ等が無いので即座にキャラ選択へ戻る
    document.getElementById('leaveButton').addEventListener('click', () => {
        window.location.href = 'select.html?mode=cpu';
    });

    updateWinIndicators();
    startingSide = Math.random() < 0.5 ? 'player' : 'cpu'; // 通常マッチ同様、初戦の先攻はランダム
    turn = startingSide;
    updateGaugeUI();
    drawBoard();
    if (turn === 'player') {
        showTurnLabel('あなたの番');
        dispTopStone();
    } else {
        dispTopStone();
        cpuTurn();
    }
});
