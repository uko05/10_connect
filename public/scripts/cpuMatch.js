// cpuMatch.js — レート戦で相手が見つからなかった時のCPU戦(2026-10-25)
//
// 対戦画面(battle.html)のまま、対人戦と同じ見た目で進める。gameLogic.js が起動直後に
// sessionStorage の connectCpuMatch を見つけたら、対人戦の処理の代わりにこれを呼ぶ。
//
// 対局の中身は engine/connectEngine.js(サーバーの再現と同じ部品)で進める。CPUの手もシードから決まる。
// プレイヤーの操作だけを log に記録し、終わったらサーバー(connectCpuFinish)に送ってレートを確定する。
// 相手が人間に見えるよう、名前・レート・考える時間(石が増えるほど長い)を人間らしくしている。

import * as E from './engine/connectEngine.js';
import { characterData } from './characterData.js';
import { initLang, t, getCharaText } from './i18n.js';
import { auth, authReady } from './firebaseConfig.js';
import { finishCpuMatch, CPU_MATCH_KEY } from './cpuMatchApi.js';
import { getMyStoneSkin, applyBattleBackground } from './designSettings.js';
import { drawPiece as _drawPiece, drawStoneAt as _drawStoneAt, flashScreen as _flashScreen, shakeElement as _shakeElement, spawnParticleBurst as _spawnParticleBurst } from './renderer.js';
import { moveSound, AbilityStandby, setupSystemVolumeSlider, initializeAudioPlayback } from './audioManager.js';
import { setupSettingsModal, bindSettingsUI, getDisplayColor, getUltIntensity, getClickMode, getSystemVolume, getVoicePlaybackVolume, VOICE_GAIN } from './settingsManager.js';
import { getUserRating, applyRatingDisplay } from './eloRating.js';
import { recordPvpMatchAchievements, applyTitleDisplay, refreshTitleDisplay } from './achievementManager.js';
import { showAchievementToast, showCharacterUnlockModal } from './achievementToast.js';
import { drawBombMarker, playGravityFlipAnimation } from './specialAbilities.js';
import { playDiceRoll } from './diceRoll.js';

const ROWS = E.ROWS, COLS = E.COLS, CELL = 110;
const TIME_LIMIT = 100; // 1ターンの持ち時間(対人戦の player1_TimeLimit と同じ)
const STARTED_KEY = 'connectCpuMatchStarted'; // 途中経過(読み込み直した時に同じ局面へ戻すため)

let M = null;          // サーバーが決めた対局の内容
let st = null;         // エンジンの状態
let view = {};         // 画面に描いている石(演出の途中経過)
const log = [];        // プレイヤーの操作の記録
let busy = false;      // 演出・CPUの番の間は操作させない
let nowCol = 3;
let ultSelected = false;
let highlighted = null;
let blockOverlays = [];
let droppingKey = null;
let timer = null, timeRemaining = TIME_LIMIT;
let timerDeadline = 0, timerKey = ''; // 今の番の持ち時間の期限(読み込み直しで時間が戻らないように保存する)
let finished = false;
let comebackFlag = false; // 0-2 から勝った(アチーブ「大逆転」)
let charaP = null, charaC = null;
let voice = {};
const MY_SKIN = getMyStoneSkin();

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const canvas = () => $('connect4Canvas');
const ctx = () => canvas().getContext('2d');

// ---------------------------------------------------------------------------------------------
// 演出の強さ設定に合わせたフラッシュ・揺れ・紙吹雪(gameLogic.js と同じ)
function fxFlash(color, d) { const l = getUltIntensity(); if (l !== 'off') _flashScreen(color, l === 'weak' ? d * 0.5 : d); }
function fxShake(el, i, d) { const l = getUltIntensity(); if (l !== 'off') _shakeElement(el, l === 'weak' ? i * 0.5 : i, l === 'weak' ? d * 0.5 : d); }
function fxParticles(x, y, colors, n = 16) { const l = getUltIntensity(); if (l !== 'off') _spawnParticleBurst(x, y, colors, l === 'weak' ? Math.max(1, Math.round(n * 0.5)) : n); }

// ---------------------------------------------------------------------------------------------
// 描画
const myColor = () => M.playerColor;
function drawPiece(c, y, color) {
    const mine = color === myColor();
    _drawPiece(ctx(), c, y, getDisplayColor(color), CELL, mine ? MY_SKIN : null, getDisplayColor(mine ? E.otherColor(color) : myColor()));
}
function drawBoard() {
    const g = ctx();
    g.clearRect(0, 0, canvas().width, canvas().height);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        g.fillStyle = 'rgba(255, 255, 255, 0.4)'; g.fillRect(c * CELL, r * CELL, CELL, CELL);
        g.strokeStyle = '#fff'; g.strokeRect(c * CELL, r * CELL, CELL, CELL);
        const k = `${c}_${r}`;
        if (view[k] && k !== droppingKey) {
            drawPiece(c, r * CELL, view[k]);
            if (st?.bomb && st.bomb.key === k) drawBombMarker(g, c, r, CELL, st.bomb.turnsLeft);
        }
    }
}
function animateDrop(col, row, color) {
    return new Promise((resolve) => {
        let y = 0; const target = row * CELL; droppingKey = `${col}_${row}`;
        const iv = setInterval(() => {
            if (y < target) { y += 10; drawBoard(); drawPiece(col, Math.min(y, target), color); }
            else { clearInterval(iv); droppingKey = null; view[`${col}_${row}`] = color; drawBoard(); resolve(); }
        }, 10);
    });
}
function cellsOverlay(keys) {
    const rect = canvas().getBoundingClientRect(); const w = rect.width / COLS, h = rect.height / ROWS;
    return keys.map((k) => {
        const [c, r] = k.split('_').map(Number);
        const el = document.createElement('div');
        el.classList.add('cell', 'selected');
        Object.assign(el.style, { position: 'fixed', width: `${w}px`, height: `${h}px`, left: `${rect.left + c * w}px`, top: `${rect.top + r * h}px`, pointerEvents: 'none' });
        document.body.appendChild(el);
        return { el, x: rect.left + (c + 0.5) * w, y: rect.top + (r + 0.5) * h };
    });
}
async function highlightKeys(keys, ms) { const cells = cellsOverlay(keys.filter((k) => view[k])); await wait(ms); cells.forEach((x) => x.el.remove()); }
function gravityView() {
    const out = {};
    for (let c = 0; c < COLS; c++) { const col = []; for (let r = ROWS - 1; r >= 0; r--) if (view[`${c}_${r}`]) col.push(view[`${c}_${r}`]); col.forEach((v, i) => { out[`${c}_${ROWS - 1 - i}`] = v; }); }
    view = out;
}
function showBlock(cols) {
    blockOverlays.forEach((el) => el.remove()); blockOverlays = [];
    if (!cols.length) return;
    const wrap = $('boardWrap').getBoundingClientRect(), cr = canvas().getBoundingClientRect(), w = wrap.width / COLS;
    for (const c of cols) {
        const o = document.createElement('div');
        o.style.cssText = `position:fixed;width:${w}px;height:${cr.height}px;left:${wrap.left + c * w}px;top:${cr.top}px;pointer-events:none;background:rgba(80,80,80,0.38);border:2px dashed rgba(255,255,255,0.7);box-sizing:border-box;z-index:50`;
        const lb = document.createElement('div');
        lb.style.cssText = 'text-align:center;color:white;font-size:24px;margin-top:6px;text-shadow:0 0 6px #000;font-weight:bold;';
        lb.textContent = '×'; o.appendChild(lb); document.body.appendChild(o); blockOverlays.push(o);
    }
}
function isMyTurn() { return st && !st.over && st.turn === 'player' && !busy; }
function topStoneColor() { return st.changeStone > 0 ? E.otherColor(myColor()) : myColor(); }
function dispTopStone() {
    const tc = $('connect4Canvas_top'), g = tc.getContext('2d');
    g.clearRect(0, 0, tc.width, tc.height);
    if (!st || st.over) return;
    const turnColor = st.turn === 'player' ? topStoneColor() : (st.changeStone > 0 ? myColor() : E.otherColor(myColor()));
    const mine = turnColor === myColor();
    _drawStoneAt(g, nowCol * CELL + CELL / 2, tc.height / 2, CELL / 2 - 5, getDisplayColor(turnColor), mine ? MY_SKIN : null, getDisplayColor(mine ? E.otherColor(turnColor) : myColor()));
}
function highlightColumn(col) {
    if (highlighted) highlighted.remove(); highlighted = null;
    if (!isMyTurn()) return;
    const wrap = $('boardWrap').getBoundingClientRect(), cr = canvas().getBoundingClientRect(), w = wrap.width / COLS;
    highlighted = document.createElement('div');
    highlighted.classList.add('column', 'selected');
    Object.assign(highlighted.style, { position: 'fixed', width: `${w}px`, height: `${cr.height}px`, left: `${wrap.left + col * w}px`, top: `${cr.top}px`, pointerEvents: 'none', backgroundColor: 'rgba(0, 255, 0, 0.2)' });
    highlighted.style.setProperty('--shadow-color', 'rgba(0, 255, 0, 0.6)');
    document.body.appendChild(highlighted);
}
function updateGauge() {
    for (const [i, side] of [[1, 'player'], [2, 'cpu']]) {
        const v = st.charge[side];
        $(`chargeGageNow_${i}`).innerText = v;
        const g = $(`playerGauge${i}`);
        g.style.height = Math.min((v / 200) * 100, 100) + '%';
        g.style.backgroundColor = v >= 150 ? '#f00' : v >= 75 ? '#ffbb00' : '#1eff00';
        $(`thumbnailContainerP${i}`)?.classList.toggle('ult-ready', v >= 150);
    }
    const img = document.querySelector('#thumbnailContainerP1 img');
    const ready = isMyTurn() && E.ultAvailable(st, 'player');
    if (img) {
        if (ready) img.classList.add('ult-effect');
        else { img.classList.remove('ult-effect', 'glowing-effect', 'selected'); ultSelected = false; $('specialMoveButtonContainer').style.display = 'none'; }
    }
    canvas().style.pointerEvents = isMyTurn() ? 'auto' : 'none';
    $('connect4Canvas_top').style.pointerEvents = isMyTurn() ? 'auto' : 'none';
}
function updateWinLabels() {
    const lab = (n) => '◆'.repeat(n) + '◇'.repeat(Math.max(0, 3 - n));
    $('player1_win').innerText = lab(st.wins.player);
    $('player2_win').innerText = lab(st.wins.cpu);
}
function hexToRgba(hex, a) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }
function showTurnLabel() {
    const el = $('turnLabel');
    const mine = st.turn === 'player';
    const hex = getDisplayColor(mine ? myColor() : E.otherColor(myColor()));
    el.style.background = `linear-gradient(90deg, ${hexToRgba(hex, 0.8)}, ${hexToRgba(hex, 0.5)})`;
    el.innerHTML = `${mine ? t('turnYours') : t('turnOpponent')} <br> ${t('turnNum').replace('{n}', st.turnCount)}`;
    el.style.display = 'block';
    setTimeout(() => (el.style.opacity = 1), 10);
    setTimeout(() => (el.style.opacity = 0), 1000);
    setTimeout(() => (el.style.display = 'none'), 1500);
}
async function showWinner(winner) {
    const el = $('winLabel');
    const p = st.wins.player, c = st.wins.cpu;
    if (winner === 'draw') el.innerHTML = `${t('winLabelDraw')}<br>${p} - ${c}`;
    else if (winner === 'player') el.innerHTML = `${t('winLabelWin')}<br>${p} - ${c}`;
    else el.innerHTML = `${t('winLabelLose')}<br>${c} - ${p}`;
    const bx = window.innerWidth / 2, by = window.innerHeight / 2;
    if (winner === 'draw') fxFlash('rgba(200, 200, 200, 0.3)', 200);
    else if (winner === 'player') { fxFlash('rgba(255, 215, 0, 0.4)', 250); fxParticles(bx, by, ['#ffd700', '#ff7a00', '#fff6cc', '#5cff5c', '#5cc8ff'], 26); }
    else { fxFlash('rgba(180, 0, 0, 0.45)', 220); fxShake($('centerPanel'), 14, 400); }
    el.classList.remove('label-pop'); el.style.display = 'block';
    setTimeout(() => { el.style.opacity = 1; el.classList.add('label-pop'); }, 10);
    await wait(3000); el.style.opacity = 0;
    await wait(2000); el.style.display = 'none'; el.classList.remove('label-pop');
}
function showCutIn(chara) {
    return new Promise((resolve) => {
        const img = $('cutin-image'), box = $('cutin-container'), panel = $('centerPanel');
        let done = false;
        const run = () => {
            if (done) return; done = true;
            box.style.display = 'block';
            const w = panel.offsetWidth;
            img.classList.remove('ult-cutin-glow');
            img.style.transition = 'none'; img.style.right = `-${w}px`; img.style.opacity = '0'; img.style.transform = 'scale(1.3) rotate(-3deg)';
            setTimeout(() => {
                fxFlash('rgba(255, 60, 20, 0.55)', 250); fxShake(panel, 16, 500);
                img.style.transition = 'right 0.6s cubic-bezier(0.17, 0.84, 0.44, 1), opacity 0.4s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                img.style.right = '0'; img.style.opacity = '1'; img.style.transform = 'scale(1) rotate(0deg)'; img.classList.add('ult-cutin-glow');
            }, 50);
            setTimeout(() => {
                img.classList.remove('ult-cutin-glow');
                img.style.transition = 'right 1s ease-in-out, opacity 1s ease-in-out, transform 1s ease-in-out';
                img.style.right = `-${w}px`; img.style.opacity = '0'; img.style.transform = 'scale(1.1)';
                setTimeout(() => { box.style.display = 'none'; img.style.transform = ''; resolve(); }, 1000);
            }, 1800);
        };
        img.onload = run;
        img.src = chara.AbilityCutImage;
        setTimeout(run, 1500); // 画像の読み込みが止まっても進める
    });
}
const play = (a) => { if (!a) return; a.currentTime = 0; a.play().catch(() => {}); };

// ---------------------------------------------------------------------------------------------
// エンジンの出来事(ev)を順に演出する。最後に画面の石をエンジンの状態にそろえる
async function playEvents(evs) {
    for (const e of evs) {
        switch (e.t) {
            case 'ult': {
                const side = e.side, ch = side === 'player' ? charaP : charaC;
                AbilityStandby.volume = getSystemVolume(); play(AbilityStandby);
                play(side === 'player' ? voice.pUlt : voice.cUlt);
                updateGauge();
                await showCutIn(ch);
                break;
            }
            case 'drop':
                moveSound.currentTime = 0; moveSound.play().catch(() => {});
                await animateDrop(e.col, e.row, e.color);
                break;
            case 'destroy': {
                const keys = e.keys.filter((k) => view[k]);
                if (keys.length) {
                    const cells = cellsOverlay(keys);
                    cells.forEach((x) => fxParticles(x.x, x.y));
                    fxFlash('rgba(255, 140, 0, 0.35)', 180);
                    fxShake($('centerPanel'), Math.min(6 + keys.length, 18), 350);
                    await wait(450);
                    cells.forEach((x) => x.el.remove());
                    keys.forEach((k) => delete view[k]);
                    drawBoard();
                    if (e.gravity) { await wait(150); gravityView(); drawBoard(); }
                }
                break;
            }
            case 'convert': // 相手の石を自分の色に
                await highlightKeys(e.keys, 400);
                for (const k of e.keys) if (view[k]) view[k] = e.color;
                drawBoard();
                break;
            case 'flip': // 反転の一手: 色を入れ替える
                await highlightKeys(e.keys, 350);
                for (const k of e.keys) if (view[k]) view[k] = E.otherColor(view[k]);
                drawBoard();
                break;
            case 'gravityFlip':
                await playGravityFlipAnimation({ canvas: canvas(), stones: view, rows: ROWS, cols: COLS, cellSize: CELL,
                    drawPieces: (pieces) => { const g = ctx(); g.clearRect(0, 0, canvas().width, canvas().height);
                        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { g.fillStyle = 'rgba(255, 255, 255, 0.4)'; g.fillRect(c * CELL, r * CELL, CELL, CELL); g.strokeStyle = '#fff'; g.strokeRect(c * CELL, r * CELL, CELL, CELL); }
                        for (const p of pieces) drawPiece(p.c, p.y, p.value); } });
                view = { ...st.stones }; drawBoard();
                break;
            case 'dice': await playDiceRoll($('boardWrap'), e.n); break;
            case 'block': showBlock(e.cols); break;
            case 'bomb': await highlightKeys([e.key], 450); drawBoard(); break;
            case 'point': updateWinLabels(); await showWinner(e.side); break;
            case 'roundEnd': {
                updateWinLabels();
                const cells = cellsOverlay(e.positions.map(([r, c]) => `${c}_${r}`));
                await wait(1200); cells.forEach((x) => x.el.remove());
                if (st.wins.player === 0 && st.wins.cpu === 2) comebackFlag = true; // 0-2 から勝てば「大逆転」
                await showWinner(e.winner);
                break;
            }
            case 'newRound': view = {}; showBlock([]); drawBoard(); break;
            case 'colorSwap': case 'charge': case 'bombExplode': updateGauge(); break;
            case 'turn': break;
            case 'matchEnd': break;
        }
        updateGauge();
    }
    if (!st.over) view = { ...st.stones };
    drawBoard();
    updateWinLabels();
}

// ---------------------------------------------------------------------------------------------
// 制限時間(対人戦と同じ見た目。CPUの番もゲージは減る)
function turnKey() { return `${st.round}|${st.turn}|${st.turnCount}`; }
function resetTimer(sec = TIME_LIMIT) {
    clearInterval(timer);
    timeRemaining = sec;
    timerDeadline = Date.now() + sec * 1000; timerKey = turnKey(); saveProgress();
    const g = $('timeLimitGauge'); if (g) g.style.width = (timeRemaining / TIME_LIMIT) * 100 + '%';
    timer = setInterval(async () => {
        if (timeRemaining > 0) { timeRemaining--; if (g) g.style.width = (timeRemaining / TIME_LIMIT) * 100 + '%'; return; }
        clearInterval(timer);
        if (st.turn === 'player' && !st.over && !busy) await act({ a: 't' });
    }, 1000);
}

// プレイヤーの操作(記録して進める)
async function act(op) {
    if (busy || st.over || st.turn !== 'player') return;
    busy = true;
    if (highlighted) { highlighted.remove(); highlighted = null; }
    updateGauge();
    let evs;
    try {
        if (op.a === 'u') evs = E.doUlt(st, 'player');
        else if (op.a === 'd') evs = E.doDrop(st, 'player', op.c);
        else if (op.a === 't') evs = E.doTimeout(st, 'player');
        else return;
    } catch (e) { console.warn('[cpuMatch] invalid op', e); busy = false; updateGauge(); return; }
    log.push(op);
    saveProgress();
    if (op.a === 'd' || op.a === 't') play(voice.pAtk);
    await playEvents(evs);
    busy = false;
    await afterAction();
}
async function afterAction() {
    if (st.over) return endMatch();
    if (evTurnChanged()) { showTurnLabel(); resetTimer(); }
    updateGauge(); dispTopStone();
    if (st.turn === 'cpu') await cpuTurn();
    else highlightColumn(nowCol);
}
let lastTurnSide = null, lastTurnCount = null;
function evTurnChanged() { const ch = st.turn !== lastTurnSide || st.turnCount !== lastTurnCount; lastTurnSide = st.turn; lastTurnCount = st.turnCount; return ch; }

// CPUの番: 石が増えるほど長く考える(序盤1〜2秒、終盤3〜8秒くらい)
async function cpuTurn() {
    busy = true; updateGauge();
    const n = Object.keys(st.stones).length;
    const think = Math.min(8000, 900 + n * 90 + Math.random() * (900 + n * 110));
    const t0 = performance.now();
    const plan = E.cpuWantsUlt(st, 'cpu');
    await wait(Math.max(300, think * (plan.ult ? 0.5 : 1) - (performance.now() - t0)));
    if (plan.ult) {
        const evs = E.doUlt(st, 'cpu');
        await playEvents(evs);
        if (st.over) { busy = false; return endMatch(); }
        if (st.turn !== 'cpu') { busy = false; return afterAction(); }
        await wait(400 + Math.random() * 900);
    }
    const t1 = performance.now();
    const col = E.cpuChooseCol(st, 'cpu', M.profile, plan);
    const spent = performance.now() - t1;
    if (!plan.ult && spent < 200) await wait(100);
    const evs = E.doDrop(st, 'cpu', col);
    play(voice.cAtk);
    await playEvents(evs);
    busy = false;
    saveProgress();
    await afterAction();
}

// ---------------------------------------------------------------------------------------------
// 終了: サーバーに記録を送ってレートを確定し、対人戦と同じ勝利画面を出す
function saveProgress() { try { sessionStorage.setItem(STARTED_KEY, JSON.stringify({ matchId: M.matchId, log, comeback: comebackFlag, deadline: timerDeadline, dkey: timerKey })); } catch { /* 保存できなくても続ける */ } }
async function endMatch() {
    if (finished) return; finished = true;
    clearInterval(timer);
    showBlock([]);
    $('leaveButtonContainer').style.display = 'none';
    const won = st.result === 'player';
    const modal = $('victoryModal'), img = $('victoryImage'), msg = $('victoryMessage'), rc = $('ratingChange');
    if (st.result === 'draw') { img.src = charaP.src; msg.textContent = t('victoryMsgDraw'); }
    else { img.src = won ? charaP.src : charaC.src; msg.textContent = `${won ? M.playerName : M.cpuName} WIN!!`; }
    const bx = window.innerWidth / 2, by = window.innerHeight / 2;
    modal.classList.remove('victory-pop', 'victory-glow');
    if (won) { fxFlash('rgba(255, 215, 0, 0.5)', 300); fxParticles(bx, by, ['#ffd700', '#ff7a00', '#fff6cc', '#5cff5c', '#5cc8ff', '#ff5c8a'], 36); requestAnimationFrame(() => modal.classList.add('victory-glow')); }
    else { fxFlash('rgba(150, 0, 0, 0.4)', 220); fxShake($('centerPanel'), 10, 350); requestAnimationFrame(() => modal.classList.add('victory-pop')); }
    modal.style.display = 'block';
    rc.style.display = ''; rc.textContent = t('ratingCalculating');
    const settled = settle(rc);
    await Promise.all([wait(8000), Promise.race([settled, wait(60000)])]);
    location.href = 'select.html?mode=match';
}
async function settle(rc) {
    try {
        const res = await finishCpuMatch(M.matchId, log);
        try { sessionStorage.removeItem(CPU_MATCH_KEY); sessionStorage.removeItem(STARTED_KEY); } catch { /* */ }
        animateRating(rc, res.ratingBefore, res.ratingAfter);
        const uid = auth.currentUser?.uid;
        if (uid) {
            const unlocked = await recordPvpMatchAchievements(uid, {
                newRating: res.ratingAfter, ultCountThisMatch: st.ultCount.player, isWinner: res.result === 'player',
                isStraightWin: !!res.straight, isCleanWin: res.resultType === 'normal', isComebackWin: comebackFlag && res.result === 'player', myCharaId: M.playerCharaId,
            });
            unlocked.forEach((id) => { showAchievementToast(id); const c = characterData.find((x) => x.requiredAchievementId === id); if (c) showCharacterUnlockModal(c); });
        }
    } catch (e) {
        console.error('[cpuMatch] finish failed', e);
        // 送れなかった対局を残すと、キャラ選択画面が「途中のCPU戦」としてここへ戻し続けるので消す
        try { sessionStorage.removeItem(CPU_MATCH_KEY); sessionStorage.removeItem(STARTED_KEY); } catch { /* */ }
        rc.textContent = '';
    }
}
function animateRating(el, from, to) {
    const diff = to - from; el.className = diff >= 0 ? 'rating-up' : 'rating-down';
    const t0 = performance.now();
    const tick = (now) => {
        const p = Math.min((now - t0) / 2000, 1), cur = Math.round(from + diff * (1 - Math.pow(1 - p, 3)));
        if (p < 1) { el.textContent = `R: ${cur}`; requestAnimationFrame(tick); }
        else el.textContent = `R: ${to} (${diff >= 0 ? '+' : ''}${diff})`;
    };
    requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------------------------
// 画面の準備
function fitText(el) {
    if (!el) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        let size = parseFloat(getComputedStyle(el).fontSize); const min = 9;
        while (el.scrollHeight > el.clientHeight && size > min) { size -= 0.5; el.style.fontSize = size + 'px'; }
    }));
}
function dispInfo(i, chara, name) {
    $(`playerName_${i}`).innerText = name;
    $(`charaID_${i}`).innerText = getCharaText(chara.charaID, 'name') ?? chara.name;
    $(`charge_${i}`).innerText = chara.charge;
    $(`Ability_${i}`).innerText = getCharaText(chara.charaID, 'Ability') ?? chara.Ability;
    $(`AbilityDetail_${i}`).innerText = getCharaText(chara.charaID, 'AbilityDetail') ?? chara.AbilityDetail;
    fitText($(`Ability_${i}`)); fitText($(`AbilityDetail_${i}`));
    $(`chargeGageNow_${i}`).innerText = 0;
    $(`chargeGageMax_${i}`).innerText = chara.chargeMax;
    const box = $(`thumbnailContainerP${i}`); box.innerHTML = '';
    const img = document.createElement('img');
    img.src = chara.src; img.alt = chara.name; img.classList.add('character-thumbnail');
    box.appendChild(img);
    return img;
}
function colFromEvent(ev) {
    const x = ev.touches?.length ? ev.touches[0].clientX : ev.changedTouches?.length ? ev.changedTouches[0].clientX : ev.clientX;
    const r = $('boardWrap').getBoundingClientRect();
    return Math.floor((x - r.left) / (r.width / COLS));
}
function bindInput() {
    let lastCol = -1, pending = -1;
    const move = (ev) => {
        if (!isMyTurn() || ultSelected) return;
        const c = colFromEvent(ev); if (c < 0 || c >= COLS) return;
        if (c !== lastCol) { lastCol = c; moveSound.currentTime = 0; moveSound.play().catch(() => {}); }
        nowCol = c; highlightColumn(c); dispTopStone();
    };
    const drop = (c) => { if (!isMyTurn() || ultSelected) return; if (!E.playableCols(st, 'player').includes(c)) return; act({ a: 'd', c }); };
    const click = (ev) => {
        if (!isMyTurn() || ultSelected) return;
        const c = colFromEvent(ev); if (c < 0 || c >= COLS) return;
        if (getClickMode() === 'single') drop(c);
        else if (pending === c) { pending = -1; drop(c); }
        else { pending = c; nowCol = c; highlightColumn(c); dispTopStone(); }
    };
    for (const el of [canvas(), $('connect4Canvas_top')]) {
        el.addEventListener('mousemove', move);
        el.addEventListener('mousedown', move);
        el.addEventListener('click', click);
        el.addEventListener('dblclick', (ev) => { const c = colFromEvent(ev); if (c >= 0 && c < COLS) drop(c); });
        el.addEventListener('touchstart', (ev) => { ev.preventDefault(); move(ev); }, { passive: false });
        el.addEventListener('touchmove', (ev) => { ev.preventDefault(); move(ev); }, { passive: false });
        el.addEventListener('touchend', (ev) => click(ev));
    }
    // 必殺技: キャラ画像を押して選び、ボタンで発動(対人戦と同じ)
    const img = document.querySelector('#thumbnailContainerP1 img');
    img.addEventListener('click', () => {
        if (!isMyTurn() || !E.ultAvailable(st, 'player')) return;
        ultSelected = !ultSelected;
        if (ultSelected) {
            img.classList.add('glowing-effect', 'selected'); img.classList.remove('ult-effect');
            const s = new Audio(charaP.voice_ult); s.volume = getVoicePlaybackVolume(); AbilityStandby.volume = getSystemVolume(); play(AbilityStandby);
            $('specialMoveButtonContainer').style.display = 'block';
            if (highlighted) { highlighted.remove(); highlighted = null; }
        } else {
            img.classList.remove('glowing-effect', 'selected'); img.classList.add('ult-effect');
            $('specialMoveButtonContainer').style.display = 'none';
        }
    });
    // 対人戦用に付いているボタンの処理を外して、CPU戦用に付け直す
    const swap = (id) => { const old = $(id); const neu = old.cloneNode(true); old.replaceWith(neu); return neu; };
    swap('specialMoveButton').addEventListener('click', async () => {
        if (!ultSelected || !isMyTurn()) return;
        ultSelected = false;
        img.classList.remove('glowing-effect', 'selected', 'ult-effect');
        $('specialMoveButtonContainer').style.display = 'none';
        await act({ a: 'u' });
    });
    swap('leaveButton').addEventListener('click', async () => {
        if (!window.confirm(t('leaveConfirm'))) return;
        await leave();
        location.href = 'select.html?mode=match';
    });
}
async function leave() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    log.push({ a: 'l' });
    try { await finishCpuMatch(M.matchId, log); } catch (e) { console.error('[cpuMatch] leave failed', e); }
    try { sessionStorage.removeItem(CPU_MATCH_KEY); sessionStorage.removeItem(STARTED_KEY); } catch { /* */ }
}

export async function startCpuMatch() {
    try { M = JSON.parse(sessionStorage.getItem(CPU_MATCH_KEY)); } catch { M = null; }
    if (!M) { location.href = 'select.html?mode=match'; return; }

    // 読み込み直した時は、保存しておいた操作の記録を再生して同じ局面から続ける(2026-10-25。以前は退出の負けだった)。
    // CPU の手はシードから決まるので、サーバーの再現(E.replay)と同じ手順で同じ局面になる
    let prev = null; try { prev = JSON.parse(sessionStorage.getItem(STARTED_KEY)); } catch { /* */ }
    const resume = !!(prev && prev.matchId === M.matchId && Array.isArray(prev.log));
    if (resume) { log.push(...prev.log); comebackFlag = !!prev.comeback; }

    setupSettingsModal('settingsButton', 'settingsModal');
    bindSettingsUI($('settingsModal'), () => { drawBoard(); dispTopStone(); }, () => {
        for (const [i, ch] of [[1, charaP], [2, charaC]]) {
            if (!ch) continue;
            $(`charaID_${i}`).innerText = getCharaText(ch.charaID, 'name') ?? ch.name;
            const a = $(`Ability_${i}`); a.innerText = getCharaText(ch.charaID, 'Ability') ?? ch.Ability; fitText(a);
            const d = $(`AbilityDetail_${i}`); d.innerText = getCharaText(ch.charaID, 'AbilityDetail') ?? ch.AbilityDetail; fitText(d);
        }
        refreshTitleDisplay($('playerTitles_1'));
    });
    initLang();
    applyBattleBackground();
    try { await authReady; } catch (e) { console.error(e); }

    charaP = characterData.find((c) => c.charaID === M.playerCharaId);
    charaC = characterData.find((c) => c.charaID === M.cpuCharaId);
    const matchOpts = { seed: M.seed, playerCharaID: M.playerCharaId, cpuCharaID: M.cpuCharaId, playerColor: M.playerColor };
    st = E.createMatch(matchOpts);
    if (resume) {
        try { st = E.replay({ ...matchOpts, profile: M.profile }, log); }
        catch (e) { console.error('[cpuMatch] resume failed', e); log.length = 0; st = E.createMatch(matchOpts); }
    }

    dispInfo(1, charaP, M.playerName);
    dispInfo(2, charaC, M.cpuName);
    const left = $('leftPane'), right = $('rightPane');
    left.style.backgroundColor = M.playerColor === 'red' ? '#ffe5e5' : '#ffffe5';
    right.style.backgroundColor = M.playerColor === 'red' ? '#ffffe5' : '#ffe5e5';
    let me = null; try { me = await getUserRating(auth.currentUser?.uid); } catch { /* */ }
    applyRatingDisplay($('playerRating_1'), me || { rating: M.playerRating }, $('rankBadge_1'), $('playerRankName_1'));
    applyRatingDisplay($('playerRating_2'), { rating: M.cpuRating }, $('rankBadge_2'), $('playerRankName_2'));
    applyTitleDisplay($('playerTitles_1'), me);
    applyTitleDisplay($('playerTitles_2'), {});

    const vol = getVoicePlaybackVolume();
    voice = { pAtk: new Audio(charaP.voice_attack), cAtk: new Audio(charaC.voice_attack), pUlt: new Audio(charaP.voice_ult), cUlt: new Audio(charaC.voice_ult) };
    Object.values(voice).forEach((a) => (a.volume = vol));
    document.addEventListener('click', () => initializeAudioPlayback(Object.values(voice)), { once: true });
    const sys = document.getElementById('systemvolumeSlider'); if (sys) setupSystemVolumeSlider(sys);
    const vs = document.getElementById('voicevolumeSlider');
    if (vs) { const h = (ev) => { const v = parseFloat(ev.target.value) * VOICE_GAIN; Object.values(voice).forEach((a) => (a.volume = v)); }; vs.addEventListener('input', h); vs.addEventListener('change', h); }

    bindInput();
    // 確認用(自分のPCで開いた時だけ): コンソールから対局の状態を見られる
    if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__cpu = { get st() { return st; }, log, get busy() { return busy; }, E };
    view = resume ? { ...st.stones } : {};
    drawBoard(); updateWinLabels(); updateGauge();
    if (st.over) return endMatch(); // 決着した後(結果を送る前)に読み込み直した時
    if (resume && st.turn === 'player') showBlock(E.blockedFor(st, 'player'));
    lastTurnSide = st.turn; lastTurnCount = st.turnCount;
    // 同じ番の途中で読み込み直したなら、持ち時間は続きから(読み込み直しで時間が戻らないように)
    const secLeft = resume && prev.dkey === turnKey() && prev.deadline ? Math.ceil((prev.deadline - Date.now()) / 1000) : TIME_LIMIT;
    showTurnLabel(); resetTimer(Math.max(1, Math.min(TIME_LIMIT, secLeft))); dispTopStone();
    if (st.turn === 'cpu') await cpuTurn(); else highlightColumn(nowCol);
}
