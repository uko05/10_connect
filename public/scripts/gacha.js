// gacha.js — トップ画面のガチャ(2026-11-23 ユーザーの決定)
//
// きまり:
//  - UPで引く。1回50UP、11連は500UP(10回分の値段で1回おまけ)。11連はSR以上が1つ確定。
//  - 半分以上はハズレ。ハズレは「つなぎのかけら」が5個。かけらを貯めると好きな景品と交換できる。
//  - 景品: R=背景(002〜038) / SR=元素・国の石(丸・四角) / SSR=元素・国の石(八角形)。石は形ごとに別アイテム。
//  - ダブったらかけらに変わる(R 25個 / SR 50個 / SSR 100個)。
//  - かけらの交換: R 100個 / SR 200個 / SSR 300個(持っていない景品だけ選べる)。
//
// データ: omikujiUsers/{共有ID}
//   ukoPoints(UP。おみくじ・UP交換所と共通)
//   connectGacha: { shards: かけらの数, items: { 'st:el_hi:round': 枚数, 'bg:bb002': 枚数 }, pulls: 引いた回数 }
//   UPを減らす・景品を足すは1つのトランザクションで行い、ukoPointsLog に記録を残す(type 'connectGacha' / 'connectGachaExchange')。
//   omikujiUsers はおみくじ・UP交換所と同じく画面側から書く(サーバーの抽選はまだ無い)。
//
// 読み取り: ガチャ画面を開いた時に omikujiUsers を1件読むだけ。引いた後はトランザクションの結果を使う。

import { db, getSharedUserId } from './firebaseConfig.js';
import {
    doc, getDoc, runTransaction, increment, collection, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    STONE_SKINS, BATTLE_BACKGROUNDS, getStoneSkinById, setGachaOwned, stoneItemKey, bgItemKey,
} from './designSettings.js';
import { drawStoneAt } from './renderer.js';
import { ensureLatestVersion } from './versionGuard.js';
import { playGachaFx } from './gachaFx.js';

const PRICE_ONE = 50;
const PRICE_TEN = 500;   // 11回
const TEN_COUNT = 11;
const MISS_SHARDS = 5;
// 確率(合計100)。ハズレが半分以上(2026-11-23 ユーザーの決定)
const RATES = { miss: 60, R: 30, SR: 8.5, SSR: 1.5 };
const DUP_SHARDS = { R: 25, SR: 50, SSR: 100 };
const EXCHANGE_COST = { R: 100, SR: 200, SSR: 300 };
const SHAPE_NAME = { round: ['丸', 'Round'], square: ['四角', 'Square'], octagon: ['八角形', 'Octagon'] };

const isEn = () => localStorage.getItem('lang') === 'en';
const L = (ja, en) => (isEn() ? en : ja);
const SHARD_NAME = () => L('つなぎのかけら', 'Link Shards');

// ===== 景品の一覧 =====
const PRIZES = (() => {
    const list = [];
    BATTLE_BACKGROUNDS.filter((b) => !b.free).forEach((b) => {
        const num = b.file.match(/_(\d+)\.jpg$/)[1];
        list.push({ key: bgItemKey(b.id), rarity: 'R', kind: 'bg', bg: b, name: [`背景 No.${num}`, `Background No.${num}`] });
    });
    STONE_SKINS.filter((s) => s.group !== 'basic').forEach((s) => {
        ['round', 'square', 'octagon'].forEach((shape) => {
            list.push({
                key: stoneItemKey(s.id, shape), rarity: shape === 'octagon' ? 'SSR' : 'SR', kind: 'stone',
                skinId: s.id, shape,
                name: [`${s.name}の石（${SHAPE_NAME[shape][0]}）`, `${s.nameEn} Stone (${SHAPE_NAME[shape][1]})`],
            });
        });
    });
    return list;
})();
const PRIZE_BY_KEY = new Map(PRIZES.map((p) => [p.key, p]));
const prizeName = (p) => (isEn() ? p.name[1] : p.name[0]);

function rand() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
}
const pickFrom = (arr) => arr[Math.floor(rand() * arr.length)];

// 1回分を引く。minSR なら SR 以上だけから(SR:SSR は確率の比のまま)
function rollOne(minSR = false) {
    let r = rand() * 100;
    let rarity;
    if (minSR) {
        rarity = rand() * (RATES.SR + RATES.SSR) < RATES.SSR ? 'SSR' : 'SR';
    } else if ((r -= RATES.miss) < 0) {
        return { miss: true };
    } else if ((r -= RATES.R) < 0) {
        rarity = 'R';
    } else if ((r -= RATES.SR) < 0) {
        rarity = 'SR';
    } else {
        rarity = 'SSR';
    }
    return { prize: pickFrom(PRIZES.filter((p) => p.rarity === rarity)) };
}

function rollMany(n) {
    const out = Array.from({ length: n }, () => rollOne());
    // 11連の確定: SR 以上が1つも無ければ、最後の1回を SR 以上に引き直す
    if (n === TEN_COUNT && !out.some((o) => o.prize && o.prize.rarity !== 'R')) out[n - 1] = rollOne(true);
    return out;
}

// ===== データ =====
let state = { exists: false, up: 0, shards: 0, items: {} };

function readGacha(data) {
    const g = data?.connectGacha || {};
    return { shards: g.shards || 0, items: { ...(g.items || {}) }, pulls: g.pulls || 0 };
}

async function loadState() {
    const snap = await getDoc(doc(db, 'omikujiUsers', getSharedUserId()));
    const data = snap.exists() ? snap.data() : null;
    const g = readGacha(data);
    state = { exists: !!data, up: data?.ukoPoints || 0, shards: g.shards, items: g.items };
    setGachaOwned(g.items);
}

async function drawTx(count, cost) {
    const userId = getSharedUserId();
    const ref = doc(db, 'omikujiUsers', userId);
    let results = [];
    let after = null;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('NO_UP');
        const data = snap.data();
        if ((data.ukoPoints || 0) < cost) throw new Error('NO_UP');
        const g = readGacha(data);
        results = rollMany(count).map((o) => {
            if (o.miss) { g.shards += MISS_SHARDS; return { miss: true, shards: MISS_SHARDS }; }
            const had = g.items[o.prize.key] || 0;
            g.items[o.prize.key] = had + 1;
            if (had > 0) { g.shards += DUP_SHARDS[o.prize.rarity]; return { prize: o.prize, dup: true, shards: DUP_SHARDS[o.prize.rarity] }; }
            return { prize: o.prize, isNew: true };
        });
        g.pulls += count;
        tx.update(ref, { ukoPoints: increment(-cost), connectGacha: g });
        tx.set(doc(collection(db, 'ukoPointsLog')), {
            userId, amount: -cost, type: 'connectGacha',
            meta: { count, got: results.filter((r) => r.prize).map((r) => r.prize.key) },
            createdAt: serverTimestamp(),
        });
        after = { up: (data.ukoPoints || 0) - cost, g };
    });
    state = { exists: true, up: after.up, shards: after.g.shards, items: after.g.items };
    setGachaOwned(after.g.items);
    return results;
}

async function exchangeTx(prize) {
    const userId = getSharedUserId();
    const ref = doc(db, 'omikujiUsers', userId);
    const cost = EXCHANGE_COST[prize.rarity];
    let after = null;
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('NO_SHARDS');
        const g = readGacha(snap.data());
        if (g.shards < cost) throw new Error('NO_SHARDS');
        if ((g.items[prize.key] || 0) > 0) throw new Error('OWNED');
        g.shards -= cost;
        g.items[prize.key] = 1;
        tx.update(ref, { connectGacha: g });
        tx.set(doc(collection(db, 'ukoPointsLog')), {
            userId, amount: 0, type: 'connectGachaExchange', meta: { key: prize.key, shards: cost },
            createdAt: serverTimestamp(),
        });
        after = { up: snap.data().ukoPoints || 0, g };
    });
    state = { exists: true, up: after.up, shards: after.g.shards, items: after.g.items };
    setGachaOwned(after.g.items);
}

// ===== 見た目 =====
const SHARD_SVG = '<img class="gc-shard-img" src="public/items/shard.webp?v=1" alt="" aria-hidden="true" draggable="false">';
const UP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.5 11.5L12 8l3.5 3.5"/></svg>';

function prizeVisual(prize, size = 64) {
    if (prize.kind === 'bg') {
        const img = document.createElement('img');
        img.className = 'gc-bg-thumb';
        img.src = prize.bg.thumb;
        img.alt = '';
        img.loading = 'lazy';
        return img;
    }
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(size * dpr);
    cv.style.width = cv.style.height = `${size}px`;
    const ctx = cv.getContext('2d');
    const skin = getStoneSkinById(prize.skinId, prize.shape);
    const draw = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        drawStoneAt(ctx, size / 2, size / 2, size / 2 - 3, skin?.color || '#888', skin);
    };
    draw();
    // マーク画像は読み込みに少し時間がかかるので、少し後にもう一度描く
    setTimeout(draw, 400);
    setTimeout(draw, 1500);
    return cv;
}

function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
}

let modal = null;
let busy = false;
let tab = 'draw';

function buildModal() {
    modal = el('div', 'gacha-modal');
    modal.innerHTML = `
      <div class="gc-panel" role="dialog" aria-modal="true">
        <button class="gc-close" aria-label="close">&times;</button>
        <div class="gc-head">
          <h2 class="gc-title">${L('ガチャ', 'Gacha')}<small>GACHA</small></h2>
          <div class="gc-wallet">
            <span class="gc-up">${UP_SVG}<b class="gc-up-n">-</b> UP</span>
            <span class="gc-shard">${SHARD_SVG}<span class="gc-shard-name"></span><b class="gc-shard-n">-</b></span>
          </div>
        </div>
        <div class="gc-tabs">
          <button data-tab="draw">${L('ガチャをひく', 'Draw')}</button>
          <button data-tab="exchange">${L('かけら交換', 'Shard Exchange')}</button>
          <button data-tab="rates">${L('確率', 'Rates')}</button>
        </div>
        <div class="gc-body">
          <section class="gc-sec" data-sec="draw">
            <div class="gc-show">
              <div class="gc-show-text">
                <div class="gc-show-tag">SSR</div>
                <div class="gc-show-title">${L('元素・国の石（八角形）', 'Element & Nation Stones (Octagon)')}</div>
                <div class="gc-show-sub">${L('ほかに 石（丸・四角）・背景 も出ます', 'Also round/square stones and backgrounds')}</div>
              </div>
              <div class="gc-show-stones"></div>
            </div>
            <div class="gc-buttons">
              <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
                <radialGradient id="gcStone" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset="0.5" stop-color="#dcd6f0"/><stop offset="1" stop-color="#8a83a8"/></radialGradient>
              </defs></svg>
              <button class="gc-pull" data-n="1">
                <span class="gc-pull-ic"><svg viewBox="0 0 40 40"><circle class="st" cx="20" cy="20" r="11"/></svg></span>
                <span class="gc-pull-main">
                  <span class="gc-pull-label">${L('1回ひく', 'Draw x1')}</span>
                  <span class="gc-pull-row"><span class="gc-pull-price">${UP_SVG}${PRICE_ONE}</span></span>
                </span>
              </button>
              <button class="gc-pull gc-pull-ten" data-n="11">
                <span class="gc-pull-ic"><svg viewBox="0 0 40 40"><path class="ln" d="M6 34L34 6"/><circle class="st" cx="6" cy="34" r="5.5"/><circle class="st" cx="15.3" cy="24.7" r="5.5"/><circle class="st" cx="24.7" cy="15.3" r="5.5"/><circle class="st" cx="34" cy="6" r="5.5"/></svg></span>
                <span class="gc-pull-main">
                  <span class="gc-pull-label">${L('11連ひく', 'Draw x11')}</span>
                  <span class="gc-pull-row"><span class="gc-pull-price">${UP_SVG}${PRICE_TEN}</span><span class="gc-pull-badge">${L('SR以上1つ確定', 'SR+ guaranteed')}</span></span>
                </span>
              </button>
            </div>
            <div class="gc-confirm" hidden>
              <div class="gc-confirm-box">
                <div class="gc-confirm-kind"></div>
                <div class="gc-confirm-cost"></div>
                <div class="gc-confirm-left"></div>
                <div class="gc-confirm-btns">
                  <button class="gc-confirm-no" type="button">${L('やめる', 'Cancel')}</button>
                  <button class="gc-confirm-yes" type="button">${L('ひく', 'Draw')}</button>
                </div>
              </div>
            </div>
            <div class="gc-msg"></div>
            <p class="gc-note"></p>
          </section>
          <section class="gc-sec" data-sec="exchange" hidden>
            <p class="gc-note gc-ex-note"></p>
            <div class="gc-ex-list"></div>
          </section>
          <section class="gc-sec" data-sec="rates" hidden>
            <div class="gc-rates"></div>
          </section>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) closeGacha(); });
    modal.querySelector('.gc-close').addEventListener('click', closeGacha);
    modal.querySelectorAll('.gc-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    modal.querySelectorAll('.gc-pull').forEach((b) => b.addEventListener('click', () => askPull(Number(b.dataset.n))));
    modal.querySelector('.gc-confirm-no').addEventListener('click', hideConfirm);
    modal.querySelector('.gc-confirm-yes').addEventListener('click', () => {
        const n = Number(modal.querySelector('.gc-confirm').dataset.n);
        hideConfirm();
        doPull(n);
    });
    modal.querySelector('.gc-shard-name').textContent = SHARD_NAME();
    // 見本の帯: SSRの石をランダムに7つ並べる(少しずつずらして浮かせる)
    const show = modal.querySelector('.gc-show-stones');
    [...PRIZES.filter((p) => p.rarity === 'SSR')].sort(() => rand() - 0.5).slice(0, 7).forEach((p, i) => {
        const cv = prizeVisual(p, 52);
        cv.style.animationDelay = `${-i * 0.4}s`;
        show.appendChild(cv);
    });
    modal.querySelector('[data-sec="draw"] .gc-note').textContent = L(
        `ハズレのときは${SHARD_NAME()}が${MISS_SHARDS}個もらえます。持っている景品がまた出たときも、かけらに変わります。かけらは「かけら交換」で好きな景品と交換できます。`,
        `A miss gives ${MISS_SHARDS} ${SHARD_NAME()}. Duplicates turn into shards too. Trade shards for any prize in "Shard Exchange".`);
    renderRates();
}

function setTab(t) {
    tab = t;
    modal.querySelectorAll('.gc-tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === t));
    modal.querySelectorAll('.gc-sec').forEach((s) => { s.hidden = s.dataset.sec !== t; });
    if (t === 'exchange') renderExchange();
}

function renderWallet() {
    modal.querySelector('.gc-up-n').textContent = state.up.toLocaleString();
    modal.querySelector('.gc-shard-n').textContent = state.shards.toLocaleString();
    modal.querySelectorAll('.gc-pull').forEach((b) => {
        const cost = Number(b.dataset.n) === 1 ? PRICE_ONE : PRICE_TEN;
        b.disabled = busy || state.up < cost;
    });
}

function setMsg(text) {
    modal.querySelector('.gc-msg').textContent = text || '';
}

// 引く前の確認(2026-11-23 作り直し): 選んだ方(1回/11連)の色の小さな箱を真ん中に出し、何をひくかを大きく見せる
function askPull(n) {
    if (busy) return;
    const cost = n === 1 ? PRICE_ONE : PRICE_TEN;
    const box = modal.querySelector('.gc-confirm');
    box.dataset.n = String(n);
    box.dataset.kind = n === 1 ? 'one' : 'ten';
    box.querySelector('.gc-confirm-kind').textContent = n === 1 ? L('1回ひく', 'Draw x1') : L('11連ひく', 'Draw x11');
    box.querySelector('.gc-confirm-cost').innerHTML = `${UP_SVG}<b>${cost}</b> UP`;
    box.querySelector('.gc-confirm-left').textContent = L(
        `のこり ${(state.up - cost).toLocaleString()} UP`, `${(state.up - cost).toLocaleString()} UP left`);
    modal.querySelectorAll('.gc-pull').forEach((b) => b.classList.toggle('is-selected', Number(b.dataset.n) === n));
    box.hidden = false;
}
function hideConfirm() {
    modal.querySelector('.gc-confirm').hidden = true;
    modal.querySelectorAll('.gc-pull').forEach((b) => b.classList.remove('is-selected'));
}

async function doPull(n) {
    if (busy) return;
    if (!(await ensureLatestVersion())) return;
    busy = true;
    renderWallet();
    setMsg('');
    let again = false;
    try {
        const cost = n === 1 ? PRICE_ONE : PRICE_TEN;
        const results = await drawTx(n, cost);
        renderWallet();
        // 演出の最後に「OK」と「もう1度引く」を出す(引いた後、ガチャ画面には結果の一覧を出さない)
        const choice = await playGachaFx(results, (r) => resultCard(r, 0, 100), againOpt(n));
        again = choice === 'again';
    } catch (e) {
        console.error('[gacha] draw failed', e);
        setMsg(e.message === 'NO_UP'
            ? L('UPが足りません。原神おみくじなどでUPを貯めてね。', 'Not enough UP.')
            : L('ガチャに失敗しました。時間をおいてもう一度お試しください。（UPは減っていません）', 'The draw failed. Please try again later. (No UP was used.)'));
    } finally {
        busy = false;
        renderWallet();
    }
    if (again) doPull(n);
}

function againOpt(n) {
    const cost = n === 1 ? PRICE_ONE : PRICE_TEN;
    return {
        againLabel: L(`もう1度引く（${cost}UP）`, `Draw again (${cost} UP)`),
        againEnabled: state.up >= cost,
    };
}

function resultCard(r, i, size = 56) {
    const rarity = r.miss ? 'miss' : r.prize.rarity;
    const card = el('div', `gc-card gc-r-${rarity}${r.dup ? ' gc-is-dup' : ''}`);
    card.style.animationDelay = `${i * 0.12}s`;
    const vis = el('div', 'gc-card-vis');
    if (r.miss) vis.innerHTML = `<span class="gc-card-shard">${SHARD_SVG}</span>`;
    else vis.appendChild(prizeVisual(r.prize, size));
    // かぶった時: 何がかぶったか分かるように景品はそのまま見せ、その上にかけらの数を重ねる
    if (r.dup) vis.appendChild(el('div', 'gc-dup-over', `${SHARD_SVG}<b>×${r.shards}</b>`));
    card.appendChild(el('div', 'gc-card-rarity', r.miss ? '' : rarity));
    card.appendChild(vis);
    const name = el('div', 'gc-card-name');
    name.textContent = r.miss ? L(`かけら ×${r.shards}`, `Shards x${r.shards}`) : prizeName(r.prize);
    card.appendChild(name);
    if (r.isNew) card.appendChild(el('div', 'gc-card-tag gc-tag-new', 'NEW'));
    if (r.dup) card.appendChild(el('div', 'gc-card-tag', L('かぶり → かけら', 'Duplicate → shards')));
    return card;
}

function renderExchange() {
    modal.querySelector('.gc-ex-note').textContent = L(
        `${SHARD_NAME()}を使って、まだ持っていない景品と交換できます。R ${EXCHANGE_COST.R}個 / SR ${EXCHANGE_COST.SR}個 / SSR ${EXCHANGE_COST.SSR}個`,
        `Trade ${SHARD_NAME()} for a prize you don't own yet. R ${EXCHANGE_COST.R} / SR ${EXCHANGE_COST.SR} / SSR ${EXCHANGE_COST.SSR}`);
    const list = modal.querySelector('.gc-ex-list');
    list.innerHTML = '';
    ['SSR', 'SR', 'R'].forEach((rarity) => {
        const items = PRIZES.filter((p) => p.rarity === rarity);
        const head = el('h3', `gc-ex-head gc-r-${rarity}`);
        const owned = items.filter((p) => (state.items[p.key] || 0) > 0).length;
        head.textContent = `${rarity}  ${L('（必要なかけら', '(cost ')}${EXCHANGE_COST[rarity]}${L('個）', ')')}  ${owned} / ${items.length}`;
        list.appendChild(head);
        const grid = el('div', 'gc-ex-grid');
        items.forEach((p) => {
            const have = (state.items[p.key] || 0) > 0;
            const cell = el('button', `gc-ex-item gc-r-${rarity}${have ? ' is-owned' : ''}`);
            cell.type = 'button';
            cell.title = prizeName(p);
            cell.disabled = have || busy || state.shards < EXCHANGE_COST[rarity];
            cell.appendChild(prizeVisual(p, 44));
            const nm = el('span', 'gc-ex-name');
            nm.textContent = have ? L('所持', 'Owned') : prizeName(p);
            cell.appendChild(nm);
            if (!have) cell.addEventListener('click', () => askExchange(p, cell));
            grid.appendChild(cell);
        });
        list.appendChild(grid);
    });
}

async function askExchange(prize, cell) {
    if (busy) return;
    const cost = EXCHANGE_COST[prize.rarity];
    if (cell.dataset.ask !== '1') {
        // 1回目で確認の表示にし、もう一度押したら交換する
        modal.querySelectorAll('.gc-ex-item[data-ask="1"]').forEach((c) => { c.dataset.ask = ''; c.classList.remove('is-ask'); c.querySelector('.gc-ex-name').textContent = c.title; });
        cell.dataset.ask = '1';
        cell.classList.add('is-ask');
        cell.querySelector('.gc-ex-name').textContent = L(`かけら${cost}個で交換`, `Trade ${cost}`);
        return;
    }
    busy = true;
    try {
        await exchangeTx(prize);
        renderWallet();
        busy = false;
        renderExchange();
        modal.querySelector('.gc-ex-note').textContent = L(`「${prizeName(prize)}」と交換しました。`, `Got "${prizeName(prize)}".`);
    } catch (e) {
        console.error('[gacha] exchange failed', e);
        busy = false;
        renderExchange();
        modal.querySelector('.gc-ex-note').textContent = e.message === 'NO_SHARDS'
            ? L('かけらが足りません。', 'Not enough shards.')
            : e.message === 'OWNED' ? L('もう持っています。', 'Already owned.')
                : L('交換に失敗しました。時間をおいてもう一度お試しください。', 'Failed. Please try again later.');
    }
    renderWallet();
}

function renderRates() {
    const box = modal.querySelector('.gc-rates');
    const cnt = (r) => PRIZES.filter((p) => p.rarity === r).length;
    const per = (r) => (RATES[r] / cnt(r)).toFixed(3);
    const rows = [
        [L('ハズレ（かけら×5）', `Miss (${MISS_SHARDS} shards)`), `${RATES.miss}%`, '-'],
        [L(`R：背景（${cnt('R')}種）`, `R: Backgrounds (${cnt('R')})`), `${RATES.R}%`, `${per('R')}%`],
        [L(`SR：元素・国の石 丸・四角（${cnt('SR')}種）`, `SR: Element/Nation stones, round & square (${cnt('SR')})`), `${RATES.SR}%`, `${per('SR')}%`],
        [L(`SSR：元素・国の石 八角形（${cnt('SSR')}種）`, `SSR: Element/Nation stones, octagon (${cnt('SSR')})`), `${RATES.SSR}%`, `${per('SSR')}%`],
    ];
    box.innerHTML = `
      <table class="gc-rate-table">
        <thead><tr><th>${L('種類', 'Type')}</th><th>${L('確率', 'Rate')}</th><th>${L('1種あたり', 'Each')}</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>
      </table>
      <ul class="gc-rate-notes">
        <li>${L(`11連は、SR以上が1つも出なかったときだけ、最後の1回がSR以上になります（SR ${(RATES.SR / (RATES.SR + RATES.SSR) * 100).toFixed(0)}% / SSR ${(RATES.SSR / (RATES.SR + RATES.SSR) * 100).toFixed(0)}%）。`,
            `In an 11-draw, if no SR or better appears, the last draw becomes SR or better.`)}</li>
        <li>${L(`持っている景品がまた出たら、かけらに変わります（R ${DUP_SHARDS.R}個 / SR ${DUP_SHARDS.SR}個 / SSR ${DUP_SHARDS.SSR}個）。`,
            `Duplicates become shards (R ${DUP_SHARDS.R} / SR ${DUP_SHARDS.SR} / SSR ${DUP_SHARDS.SSR}).`)}</li>
        <li>${L('石は形ごとに別の景品です（「炎の石（丸）」と「炎の石（四角）」は別）。', 'Each stone shape is a separate prize.')}</li>
      </ul>`;
}

export async function openGacha() {
    if (!modal) buildModal();
    modal.classList.add('is-open');
    setTab('draw');
    hideConfirm();
    setMsg(L('読み込み中…', 'Loading...'));
    try {
        await loadState();
        setMsg(state.exists ? '' : L('UPがありません。原神おみくじなどでUPを貯めると引けます。', 'You have no UP yet.'));
    } catch (e) {
        console.error('[gacha] load failed', e);
        setMsg(L('読み込みに失敗しました。', 'Failed to load.'));
    }
    renderWallet();
}

export function closeGacha() {
    if (modal) modal.classList.remove('is-open');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.gfx')) closeGacha(); });

// 見た目の確認用(手元のサーバーでだけ): UPを使わずに結果の表示だけを出す
if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
    window.__gachaPreview = async (n = 11) => {
        const owned = new Set();
        const results = rollMany(n).map((o) => {
            if (o.miss) return { miss: true, shards: MISS_SHARDS };
            if (owned.has(o.prize.key)) return { prize: o.prize, dup: true, shards: DUP_SHARDS[o.prize.rarity] };
            owned.add(o.prize.key);
            return { prize: o.prize, isNew: true };
        });
        if (await playGachaFx(results, (r) => resultCard(r, 0, 100), againOpt(n)) === 'again') window.__gachaPreview(n);
    };
    // 一番いい当たりを決めて見る用: __gachaPreviewAs('SSR')
    window.__gachaPreviewAs = async (best = 'SSR', n = 11) => {
        const pick = (rar) => ({ prize: pickFrom(PRIZES.filter((p) => p.rarity === rar)), isNew: true });
        const results = Array.from({ length: n }, (_, i) => (i === Math.floor(n / 2) ? pick(best) : (i % 3 ? { miss: true, shards: MISS_SHARDS } : pick('R'))));
        if (n > 1) results[0] = { ...pick('R'), isNew: false, dup: true, shards: DUP_SHARDS.R };   // かぶりの見た目の確認用
        if (await playGachaFx(results, (r) => resultCard(r, 0, 100), againOpt(n)) === 'again') window.__gachaPreviewAs(best, n);
    };
}
