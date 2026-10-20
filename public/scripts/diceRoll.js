// diceRoll.js — アベンチュリンの必殺技「ダイスロール」の演出(2026-10-21)
// 対人戦(gameLogic.js)・CPU戦(soloLogic.js)共通。演出だけを担当し、効果の処理は呼び出し側で行う。
// 見た目は Downloads\コネバト演出試作\ダイスロール試作.html の「転がす」版:
// 左から投げ込まれて跳ね、角を支点に転がって止まる。斜め上(66度)から見下ろす視点で、上を向いた面が出目。
// 止まった後は真上寄り(82度)に回り込みながら中央上へ移動し、出目の数字と効果を表示する。
import { getCurrentLang } from './i18n.js';

// 出目ごとの効果(説明表示用)。順番は 1〜6
export const DICE_EFFECTS = {
    ja: [
        '自分の石をランダムに2個破壊',
        '相手のチャージ +50',
        '相手の石をランダムに1個破壊',
        '相手の石を1個、自分の石に変える',
        '石を1個追加で落とす ＋ 自分のチャージ +50',
        '相手の石をランダムに3個破壊',
    ],
    en: [
        'Destroy 2 of your stones',
        'Opponent +50 charge',
        'Destroy 1 enemy stone',
        'Convert 1 enemy stone',
        'Drop 1 extra stone + your charge +50',
        'Destroy 3 enemy stones',
    ],
};

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// その目を正面に向ける回転。さらに rotateX(90deg) で正面を上に倒すと、その目が上になる
const SHOW = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
const topOf = (n) => `rotateX(90deg) rotateX(${SHOW[n][0]}deg) rotateY(${SHOW[n][1]}deg)`;
const CAM_ROLL = -66;
const CAM_END = -82;
const SIZE = 150, R = SIZE / 2;

const CSS = `
.dice-fx { position: absolute; inset: 0; z-index: 60; pointer-events: none; }
.dice-dim { position: absolute; inset: 0; background: rgba(0,0,0,0); transition: background .3s; }
.dice-dim.on { background: rgba(0,0,0,.5); }
.dice-scene { position: absolute; width: ${SIZE}px; height: ${SIZE}px; perspective: 700px; }
.dice-cam, .dice-cube { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; }
.dice-face { position: absolute; inset: 0; border-radius: 22px;
  background: radial-gradient(circle at 30% 25%, #fffdf6, #efe6cf 70%, #d8caa6);
  border: 3px solid #f3c969; box-shadow: inset 0 0 18px rgba(155,116,38,.35);
  display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); padding: 20px; }
.dice-core { position: absolute; inset: 0; background: #d8caa6; }
.dice-pip { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #444, #111); align-self: center; justify-self: center; }
.dice-face.one .dice-pip { background: radial-gradient(circle at 35% 35%, #ff6b6b, #b00000); width: 34px; height: 34px; }
.dice-shadow { position: absolute; left: 50%; bottom: -26px; width: 120px; height: 18px; margin-left: -60px; border-radius: 50%; background: rgba(0,0,0,.45); filter: blur(6px); }
.dice-result { position: absolute; left: 50%; top: 58%; transform: translate(-50%, -50%) scale(.6); opacity: 0; text-align: center;
  transition: opacity .25s, transform .4s cubic-bezier(.2,1.5,.4,1); }
.dice-result.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.dice-num { font-size: 110px; font-weight: 900; line-height: 1.1; -webkit-text-stroke: 2px rgba(0,0,0,.35); }
.dice-effect { margin-top: 10px; display: inline-block; padding: 10px 26px; background: rgba(10,12,24,.82);
  border: 1px solid rgba(255,255,255,.25); border-radius: 10px; font-size: 22px; white-space: nowrap; color: #fff; }
.dice-good .dice-num { background: linear-gradient(180deg, #fff4c2, #f3c969 45%, #c98a1c); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 6px rgba(0,0,0,.6)); }
.dice-bad .dice-num { background: linear-gradient(180deg, #d9e3ff, #7d8db8 50%, #3c4766); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 6px rgba(0,0,0,.6)); }
.dice-best .dice-num { background: linear-gradient(90deg, #ff6b6b, #ffd36b, #7dff9b, #6bd5ff, #c08bff); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 8px rgba(0,0,0,.6)); }
.dice-flash { position: fixed; inset: 0; pointer-events: none; z-index: 61; background: radial-gradient(circle, rgba(255,230,140,.55), transparent 60%); opacity: 0; transition: opacity .2s; }
.dice-flash.on { opacity: 1; }
/* 演出中は、列を選ぶ緑の帯(body直下の .column.selected)がサイコロの上にかぶらないよう隠す */
body.dice-active .column.selected { visibility: hidden; }
`;

function injectCss() {
    if (document.getElementById('dice-roll-css')) return;
    const st = document.createElement('style');
    st.id = 'dice-roll-css';
    st.textContent = CSS;
    document.head.appendChild(st);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function buildCube() {
    const cube = document.createElement('div');
    cube.className = 'dice-cube';
    const place = { 1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 2: 'rotateY(90deg)', 5: 'rotateY(-90deg)', 3: 'rotateX(90deg)', 4: 'rotateX(-90deg)' };
    // 芯: 面の角が丸い分のすき間から反対側が見えないよう、少し内側に角ばった板を置く
    for (const n of [1, 2, 3, 4, 5, 6]) {
        const core = document.createElement('div');
        core.className = 'dice-core';
        core.style.transform = `${place[n]} translateZ(${R - 5}px)`;
        cube.appendChild(core);
    }
    for (const n of [1, 2, 3, 4, 5, 6]) {
        const f = document.createElement('div');
        f.className = 'dice-face' + (n === 1 ? ' one' : '');
        f.style.transform = `${place[n]} translateZ(${R}px)`;
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            if (PIPS[n].includes(i)) cell.className = 'dice-pip';
            f.appendChild(cell);
        }
        cube.appendChild(f);
    }
    return cube;
}

/**
 * 盤面の上でサイコロを転がし、出目 n で止めて結果を表示する。演出が終わると消える。
 * @param {HTMLElement} host 盤面を包む要素(#boardWrap)
 * @param {number} n 出目(1〜6)
 */
export async function playDiceRoll(host, n) {
    injectCss();
    if (!host) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    const fx = document.createElement('div');
    fx.className = 'dice-fx';
    const dim = document.createElement('div');
    dim.className = 'dice-dim';
    const scene = document.createElement('div');
    scene.className = 'dice-scene';
    const cam = document.createElement('div');
    cam.className = 'dice-cam';
    const cube = buildCube();
    const shadow = document.createElement('div');
    shadow.className = 'dice-shadow';
    cam.appendChild(cube);
    scene.append(cam, shadow);
    const result = document.createElement('div');
    result.className = 'dice-result';
    fx.append(dim, scene, result);
    host.appendChild(fx);
    document.body.classList.add('dice-active');

    const W = host.offsetWidth, H = host.offsetHeight;
    const floorY = H * 0.68;
    const quarter = 4 + Math.floor(Math.random() * 2);
    const dist = quarter * (Math.PI / 2) * R;
    const endX = W / 2, startX = endX - dist - 120;
    const airTurns = 360 * (1 + Math.floor(Math.random() * 2));
    const T = 2300, HOP = 0.4;
    const view = Math.cos(Math.abs(CAM_ROLL) * Math.PI / 180);
    cam.style.transform = `rotateX(${CAM_ROLL}deg)`;

    await wait(20);
    dim.classList.add('on');

    // 転がす
    await new Promise((resolve) => {
        const t0 = performance.now();
        function frame(now) {
            const t = Math.min(1, (now - t0) / T);
            const e = 1 - Math.pow(1 - t, 3);
            const deg = quarter * 90 * e;
            const rad = deg * Math.PI / 180;
            const lift = R * (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad))) - R;
            let hop = 0;
            if (t < HOP) { const u = t / HOP; hop = 150 * Math.pow(1 - u, 2) * Math.abs(Math.sin(u * Math.PI * 3)); }
            const air = t < HOP ? airTurns * (1 - Math.pow(1 - t / HOP, 2)) : airTurns;
            const cx = startX + (endX - startX) * e;
            const cy = floorY - R - (lift + hop) * view;
            scene.style.left = `${cx - R}px`;
            scene.style.top = `${cy - R}px`;
            scene.style.transform = `scale(${1 + hop / 500})`;
            // 転がり(rotateZ)は最後にちょうど0度になるよう、残りの角度で回す → 止まった時に出目が上
            cube.style.transform = `rotateZ(${deg - quarter * 90}deg) rotateX(${air}deg) ${topOf(n)}`;
            shadow.style.transform = `translateY(${(hop + lift) * view}px) scale(${1 - hop / 300})`;
            shadow.style.opacity = String(1 - hop / 250);
            if (t < 1) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
    });

    // 止まったら、中央上へ移動しながら真上寄りに回り込み、出目と効果を表示
    await wait(250);
    scene.style.transition = 'left .45s ease, top .45s ease, transform .45s ease';
    scene.style.left = `${W / 2 - R}px`;
    scene.style.top = `${H / 2 - 190 - R}px`;
    scene.style.transform = 'scale(.72)';
    shadow.style.transition = 'opacity .3s';
    shadow.style.opacity = '0';
    cam.style.transition = 'transform .45s ease';
    cam.style.transform = `rotateX(${CAM_END}deg)`;

    const lang = getCurrentLang() === 'en' ? 'en' : 'ja';
    const tier = n === 6 ? 'dice-best' : n >= 3 ? 'dice-good' : 'dice-bad';
    result.innerHTML = '<div class="dice-num"></div><div class="dice-effect"></div>';
    result.querySelector('.dice-num').textContent = String(n);
    result.querySelector('.dice-effect').textContent = DICE_EFFECTS[lang][n - 1];
    result.classList.add(tier);
    await wait(20);
    result.classList.add('show');
    if (n === 6) {
        const flash = document.createElement('div');
        flash.className = 'dice-flash';
        document.body.appendChild(flash);
        await wait(20);
        flash.classList.add('on');
        setTimeout(() => { flash.classList.remove('on'); setTimeout(() => flash.remove(), 300); }, 350);
    }

    await wait(1800);
    fx.style.transition = 'opacity .3s';
    fx.style.opacity = '0';
    await wait(300);
    fx.remove();
    document.body.classList.remove('dice-active');
}
