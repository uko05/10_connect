// soloLogic.js - ソロモード(CPU対戦)。Firestoreを使わず、ブラウザ内だけで完結するシンプルなConnect4。
// 必殺技・キャラ選択・レートは対象外（まずは基本ルールのみのMVP）。

import { drawPiece as _drawPiece, flashScreen as _flashScreen, shakeElement as _shakeElement, spawnParticleBurst as _spawnParticleBurst } from "./renderer.js";
import { moveSound, setupSystemVolumeSlider } from "./audioManager.js";
import { setupScaledLayout, setupMobileBoardLayout } from "./layoutScaler.js";
import { setupSettingsModal, bindSettingsUI, getDisplayColor, getUltIntensity } from "./settingsManager.js";
import { APP_VERSION } from "./version.js";

document.getElementById('version').textContent = APP_VERSION;

const topCanvas = document.getElementById('connect4Canvas_top');
const canvas = document.getElementById('connect4Canvas');
const ctx = canvas.getContext('2d');

const rows = 6;
const cols = 7;
const cellSize = 110;

const PLAYER_COLOR = 'red';
const CPU_COLOR = 'yellow';

let stones = {}; // "col_row" -> 'red' | 'yellow'
let turn = 'player'; // 'player' | 'cpu'
let gameOver = false;
let nowCol = 3;
let droppingKey = null; // アニメ中のセル（静的描画から除外する）
let highlightedColumn = null;
let boardScale = 1;

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

//------------------------------------------------------------------------------------------------
// CPU AI: 勝てる手→相手の勝ちを阻止→中央寄りの重み付きランダム

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

function pickAiColumn() {
    const validCols = getValidColumns();

    // 1. 自分が勝てる手があれば打つ
    for (const c of validCols) {
        if (wouldWin(c, CPU_COLOR)) return c;
    }
    // 2. 相手が次に勝てる手があればブロック
    for (const c of validCols) {
        if (wouldWin(c, PLAYER_COLOR)) return c;
    }
    // 3. 中央寄りの重み付きランダム
    const weights = [1, 2, 3, 4, 3, 2, 1];
    const weighted = [];
    validCols.forEach(c => {
        for (let i = 0; i < weights[c]; i++) weighted.push(c);
    });
    return weighted[Math.floor(Math.random() * weighted.length)];
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

function dispTopStone() {
    const topCtx = topCanvas.getContext('2d');
    topCtx.clearRect(0, 0, topCanvas.width, topCanvas.height);
    if (gameOver || turn !== 'player') return;

    const centerY = topCanvas.height / 2;
    const color = getDisplayColor(PLAYER_COLOR);

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
// ターン進行

function showTurnLabel(text) {
    const turnLabel = document.getElementById('turnLabel');
    turnLabel.style.background = turn === 'player'
        ? 'linear-gradient(90deg, rgba(0, 153, 255, 0.8), rgba(100, 200, 255, 0.8))'
        : 'linear-gradient(90deg, rgba(255, 100, 0, 0.8), rgba(255, 180, 80, 0.8))';
    turnLabel.innerHTML = text;
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

async function checkGameEnd() {
    const winResult = checkWinLocal();
    if (winResult) {
        gameOver = true;
        await highlightWinningCells(winResult.positions);
        await showResult(winResult.color === PLAYER_COLOR ? 'win' : 'lose');
        return true;
    }
    if (isBoardFull()) {
        gameOver = true;
        await showResult('draw');
        return true;
    }
    return false;
}

async function showResult(result) {
    const winLabel = document.getElementById('winLabel');
    const burstX = window.innerWidth / 2;
    const burstY = window.innerHeight / 2;

    if (result === 'win') {
        winLabel.innerHTML = 'YOU WIN!';
        fxFlash('rgba(255, 215, 0, 0.4)', 250);
        fxParticles(burstX, burstY, ['#ffd700', '#ff7a00', '#fff6cc', '#5cff5c', '#5cc8ff'], 26);
    } else if (result === 'lose') {
        winLabel.innerHTML = 'YOU LOSE!';
        fxFlash('rgba(180, 0, 0, 0.45)', 220);
        fxShake(document.getElementById('centerPanel'), 14, 400);
    } else {
        winLabel.innerHTML = 'DRAW';
        fxFlash('rgba(200, 200, 200, 0.3)', 200);
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

async function handlePlayerDrop(column) {
    if (gameOver || turn !== 'player') return;
    if (column < 0 || column >= cols) return;
    if (getDropRow(column) < 0) return; // 満杯の列は無視

    if (highlightedColumn) {
        highlightedColumn.remove();
        highlightedColumn = null;
    }

    const ok = await dropAt(column, PLAYER_COLOR);
    if (!ok) return;
    if (await checkGameEnd()) return;

    await cpuTurn();
}

async function cpuTurn() {
    turn = 'cpu';
    showTurnLabel('CPUの番');
    dispTopStone();

    await wait(550); // 「考えている」演出のための短い待機

    const col = pickAiColumn();
    await dropAt(col, CPU_COLOR);
    if (await checkGameEnd()) return;

    turn = 'player';
    showTurnLabel('あなたの番');
    dispTopStone();
}

function resetGame() {
    stones = {};
    gameOver = false;
    turn = 'player';
    nowCol = 3;
    droppingKey = null;
    if (highlightedColumn) {
        highlightedColumn.remove();
        highlightedColumn = null;
    }
    document.getElementById('soloResultPanel').style.display = 'none';
    document.getElementById('winLabel').style.display = 'none';
    drawBoard();
    dispTopStone();
    showTurnLabel('あなたの番');
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

    topCanvas.addEventListener('mousemove', updateHover);
    topCanvas.addEventListener('click', (event) => {
        const col = getColumnFromEvent(event);
        handlePlayerDrop(col);
    });

    canvas.addEventListener('mousemove', updateHover);
    canvas.addEventListener('click', (event) => {
        const col = getColumnFromEvent(event);
        handlePlayerDrop(col);
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
                handlePlayerDrop(col);
            }
        });
    });
}

//------------------------------------------------------------------------------------------------
// 初期化

document.addEventListener('DOMContentLoaded', () => {
    // 設定ダイアログ
    setupSettingsModal('settingsButton', 'settingsModal');
    bindSettingsUI(document.getElementById('settingsModal'), () => {
        drawBoard();
        dispTopStone();
    });

    const systemvolumeSlider = document.getElementById('systemvolumeSlider');
    setupSystemVolumeSlider(systemvolumeSlider);

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
        window.location.href = 'index.html';
    });

    resetGame();
});
