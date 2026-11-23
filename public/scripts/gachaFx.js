// gachaFx.js — ガチャの演出(2026-11-23)。gacha.js から playGachaFx(results, makeFace) を呼ぶ。
//
// 流れ(コネクトバトルらしく「4つそろう」を演出にする):
//  1. 暗転して、盤面の列のうっすらした線の上に、石が4つ斜めに落ちてくる
//  2. 4つの石を光の線がつなぐ。線の色がその回の一番いい当たり(青=R以下 / 紫=SR / 金=SSR)
//     SSRの時は、いったん紫で光ってから金に変わる(格上げ)
//  3. 白く光って衝撃波と光の粒がはじける
//  4. 裏向きのカードが並ぶ(縁の色でレア度がわかる)→ 1枚ずつめくれる。SR・SSRはためてからめくる
//  画面のどこかを押すと、残りを一気にめくる。全部めくれたら「OK」で閉じる。

const COLORS = {
    miss: '#7fb8d8',
    R: '#5aa0ff',
    SR: '#c77dff',
    SSR: '#f2cf7a',
};
const rarityOf = (r) => (r.miss ? 'miss' : r.prize.rarity);
const bestOf = (results) => (results.some((r) => rarityOf(r) === 'SSR') ? 'SSR'
    : results.some((r) => rarityOf(r) === 'SR') ? 'SR' : 'R');

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function mix(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const BACK_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 32L32 8" class="ln"/><circle cx="8" cy="32" r="3.6"/><circle cx="16" cy="24" r="3.6"/><circle cx="24" cy="16" r="3.6"/><circle cx="32" cy="8" r="3.6"/></svg>';

// ===== 1〜3: キャンバスの演出 =====
function runIntro(canvas, best, skipSignal) {
    return new Promise((resolve) => {
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = window.innerWidth, H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

        const S = Math.min(W, H) * 0.15;        // 石の間隔
        const R = S * 0.4;                      // 石の半径
        const cx = W / 2, cy = H / 2;
        const stones = [0, 1, 2, 3].map((i) => ({
            x: cx + (i - 1.5) * S, y: cy + (1.5 - i) * S, start: 120 + i * 230,
        }));
        const FALL = 420;
        const LINE_AT = 120 + 3 * 230 + FALL + 120;   // 線を引き始める時刻
        const LINE_DUR = 380;
        const UPGRADE = best === 'SSR' ? 650 : 0;       // SSRは紫→金にためる時間
        const BURST_AT = LINE_AT + LINE_DUR + 260 + UPGRADE;
        const END = BURST_AT + 650;
        const finalColor = COLORS[best];
        const lineColor0 = best === 'SSR' ? COLORS.SR : finalColor;

        const parts = [];
        let burstDone = false;
        let t0 = null;

        function burst(color) {
            const n = best === 'SSR' ? 180 : best === 'SR' ? 130 : 90;
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const sp = (2 + Math.random() * 9) * (Math.min(W, H) / 700);
                parts.push({
                    x: cx + (Math.random() - 0.5) * S * 3, y: cy + (Math.random() - 0.5) * S * 3,
                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, size: 1 + Math.random() * 3,
                    color: Math.random() < 0.3 ? '#ffffff' : color,
                });
            }
        }

        function stoneAt(s, t) {
            const k = clamp01((t - s.start) / FALL);
            if (k <= 0) return null;
            // 落ちてきて、最後に少しだけ弾む
            let y;
            if (k < 0.8) y = -R * 2 + (s.y + R * 2) * Math.pow(k / 0.8, 2);
            else { const b = (k - 0.8) / 0.2; y = s.y - Math.sin(b * Math.PI) * R * 0.35; }
            return { x: s.x, y };
        }

        function drawStone(x, y, glow, color) {
            const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.45, mix('#d9dde8', color, glow * 0.6));
            g.addColorStop(1, mix('#5b6074', color, glow * 0.8));
            ctx.save();
            if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = R * 1.6 * glow; }
            ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
            ctx.restore();
        }

        function frame(now) {
            if (t0 == null) t0 = now;
            let t = (now - t0) * (window.__gfxSpeed || 1);   // __gfxSpeed: 見た目の確認用にゆっくり再生する
            if (skipSignal.skip) t = Math.max(t, END);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            // SSRの格上げ中は画面を揺らす
            const shaking = UPGRADE && t > LINE_AT + LINE_DUR + 200 && t < BURST_AT;
            if (shaking) {
                const m = 2 + 4 * clamp01((t - (LINE_AT + LINE_DUR + 200)) / UPGRADE);
                ctx.setTransform(dpr, 0, 0, dpr, (Math.random() - 0.5) * m * dpr, (Math.random() - 0.5) * m * dpr);
            }

            // 後ろの光の筋(線が光ってから)
            const raysA = clamp01((t - LINE_AT) / 400) * (1 - clamp01((t - BURST_AT) / 300));
            if (raysA > 0) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(t / 2600);
                ctx.globalAlpha = raysA * (best === 'R' ? 0.10 : 0.18);
                const c0 = UPGRADE ? mix(lineColor0, finalColor, clamp01((t - (LINE_AT + LINE_DUR + 200)) / UPGRADE)) : finalColor;
                ctx.fillStyle = c0;
                const big = Math.hypot(W, H);
                for (let i = 0; i < 16; i++) {
                    ctx.rotate(Math.PI / 8);
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(big, -big * 0.06); ctx.lineTo(big, big * 0.06); ctx.closePath(); ctx.fill();
                }
                ctx.restore();
            }

            // 盤面の列(うっすら)
            ctx.save();
            ctx.globalAlpha = 0.28 * clamp01(t / 400) * (1 - clamp01((t - BURST_AT) / 400));
            ctx.strokeStyle = '#9aa4ff';
            ctx.lineWidth = 1;
            for (let i = -3; i <= 3; i++) {
                const x = cx + i * S;
                ctx.beginPath(); ctx.moveTo(x - S / 2, cy - S * 2.6); ctx.lineTo(x - S / 2, cy + S * 2.6); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(cx - S * 3.5, cy + S * 2.1); ctx.lineTo(cx + S * 3.5, cy + S * 2.1); ctx.stroke();
            ctx.restore();

            // 線の色(SSRは途中で紫→金)
            const up = UPGRADE ? clamp01((t - (LINE_AT + LINE_DUR + 200)) / UPGRADE) : 1;
            const color = UPGRADE ? mix(lineColor0, finalColor, easeOutCubic(up)) : finalColor;
            const lineK = clamp01((t - LINE_AT) / LINE_DUR);
            const glow = lineK > 0 ? 0.4 + 0.6 * lineK : 0;
            const fadeOut = 1 - clamp01((t - BURST_AT) / 300);

            // 光の線
            if (lineK > 0 && fadeOut > 0) {
                const a = stones[0], b = stones[3];
                const ex = a.x + (b.x - a.x) * easeOutCubic(lineK), ey = a.y + (b.y - a.y) * easeOutCubic(lineK);
                const pulse = UPGRADE && up > 0 && up < 1 ? 1 + Math.sin(t / 40) * 0.25 : 1;
                ctx.save();
                ctx.globalAlpha = fadeOut;
                ctx.lineCap = 'round';
                ctx.shadowColor = color;
                ctx.shadowBlur = 30 * pulse;
                ctx.strokeStyle = hexA(color, 0.55);
                ctx.lineWidth = R * 0.9 * pulse;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.shadowBlur = 12;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = R * 0.22;
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
                // つながったら、線が画面の端まで伸びる
                const ext = clamp01((t - LINE_AT - LINE_DUR) / 260);
                if (ext > 0) {
                    const dx = (b.x - a.x), dy = (b.y - a.y), L = Math.hypot(dx, dy);
                    const ux = dx / L, uy = dy / L, far = Math.hypot(W, H) * easeOutCubic(ext);
                    ctx.globalAlpha = fadeOut * 0.8;
                    ctx.shadowBlur = 20;
                    ctx.strokeStyle = hexA(color, 0.7);
                    ctx.lineWidth = R * 0.12;
                    ctx.beginPath();
                    ctx.moveTo(a.x - ux * far, a.y - uy * far);
                    ctx.lineTo(b.x + ux * far, b.y + uy * far);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // 石(落ちる間は光の尾、着地したら波紋)
            if (fadeOut > 0) {
                ctx.save();
                ctx.globalAlpha = fadeOut;
                stones.forEach((s) => {
                    const p = stoneAt(s, t);
                    if (!p) return;
                    const k = (t - s.start) / FALL;
                    if (k < 0.8) {
                        const tg = ctx.createLinearGradient(p.x, p.y - S * 2.2, p.x, p.y);
                        tg.addColorStop(0, 'rgba(180,190,255,0)');
                        tg.addColorStop(1, 'rgba(200,210,255,0.55)');
                        ctx.fillStyle = tg;
                        ctx.fillRect(p.x - R * 0.55, p.y - S * 2.2, R * 1.1, S * 2.2);
                    }
                    const lk = clamp01((t - s.start - FALL * 0.8) / 500);
                    if (lk > 0 && lk < 1) {
                        ctx.save();
                        ctx.globalAlpha = (1 - lk) * fadeOut;
                        ctx.strokeStyle = '#cfd6ff';
                        ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.arc(s.x, s.y, R * (1 + lk * 1.6), 0, Math.PI * 2); ctx.stroke();
                        ctx.restore();
                    }
                    drawStone(p.x, p.y, glow, color);
                });
                ctx.restore();
            }

            // 文字
            const txtA = clamp01(t / 300) * (1 - clamp01((t - BURST_AT + 200) / 300));
            if (txtA > 0) {
                ctx.save();
                ctx.globalAlpha = txtA * 0.85;
                ctx.fillStyle = lineK > 0 ? color : '#aab3ff';
                ctx.font = `700 ${Math.round(Math.min(W, H) * 0.028)}px 'SDK_JP_WEB', sans-serif`;
                ctx.textAlign = 'center';
                const label = lineK >= 1 ? 'CONNECTED' : 'CONNECTING';
                const sp = Math.min(W, H) * 0.012;
                ctx.letterSpacing = `${sp}px`;
                ctx.fillText(label, cx + sp / 2, cy + S * 2.9);
                ctx.restore();
            }

            // 衝撃波・白い光・粒
            if (t >= BURST_AT && !burstDone) { burstDone = true; burst(finalColor); }
            const bk = clamp01((t - BURST_AT) / 600);
            if (bk > 0 && bk < 1) {
                ctx.save();
                ctx.globalAlpha = (1 - bk) * 0.9;
                ctx.strokeStyle = finalColor;
                ctx.shadowColor = finalColor;
                ctx.shadowBlur = 25;
                ctx.lineWidth = 6 * (1 - bk) + 1;
                ctx.beginPath(); ctx.arc(cx, cy, easeOutCubic(bk) * Math.max(W, H) * 0.6, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
                ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.85 - bk * 1.6)})`;
                ctx.fillRect(0, 0, W, H);
            }
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.04; p.life -= 0.012;
                if (p.life <= 0) { parts.splice(i, 1); continue; }
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            if (t >= END) { resolve(); keepParticles(); return; }
            requestAnimationFrame(frame);
        }

        // カードの段階になっても、残った粒は流し続ける
        function keepParticles() {
            if (!canvas.isConnected) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            if (Math.random() < 0.5) {
                parts.push({ x: Math.random() * W, y: H + 5, vx: (Math.random() - 0.5) * 0.3, vy: -0.6 - Math.random() * 1.2,
                    life: 1, size: 0.8 + Math.random() * 1.8, color: Math.random() < 0.5 ? '#ffffff' : finalColor, slow: true });
            }
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                p.x += p.vx; p.y += p.vy;
                if (!p.slow) { p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.04; }
                p.life -= p.slow ? 0.004 : 0.012;
                if (p.life <= 0) { parts.splice(i, 1); continue; }
                ctx.globalAlpha = p.life * (p.slow ? 0.6 : 1);
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(keepParticles);
        }

        requestAnimationFrame(frame);
    });
}

// ===== 4: カード =====
function buildCard(r, i, makeFace) {
    const rar = rarityOf(r);
    const card = document.createElement('div');
    card.className = `gfx-card gfx-${rar}`;
    card.style.setProperty('--c', COLORS[rar]);
    card.style.animationDelay = `${i * 0.06}s`;
    card.innerHTML = `<div class="gfx-inner"><div class="gfx-back">${BACK_SVG}</div><div class="gfx-front"></div></div>`;
    card.querySelector('.gfx-front').appendChild(makeFace(r));
    return card;
}

function flip(card, rar) {
    card.classList.add('is-flipped');
    if (rar === 'SSR') {
        const ring = document.createElement('span');
        ring.className = 'gfx-ring';
        card.appendChild(ring);
        if (rar === 'SSR') {
            const rays = document.createElement('span');
            rays.className = 'gfx-rays';
            card.appendChild(rays);
        }
    }
}

// results: gacha.js の結果。makeFace(r): カードの表に入れる要素を返す
// opts: { againLabel, againEnabled }。戻り値: 'ok' | 'again'(もう1度引く)
export async function playGachaFx(results, makeFace, opts = {}) {
    const best = bestOf(results);
    const ov = document.createElement('div');
    ov.className = `gfx gfx-best-${best}`;
    ov.innerHTML = `
      <canvas class="gfx-canvas"></canvas>
      <div class="gfx-cards ${results.length > 1 ? 'is-multi' : 'is-single'}"></div>
      <button class="gfx-skip" type="button">SKIP</button>
      <div class="gfx-foot"><button class="gfx-ok" type="button">OK</button><button class="gfx-again" type="button"></button></div>`;
    const againBtn = ov.querySelector('.gfx-again');
    if (opts.againLabel) {
        againBtn.textContent = opts.againLabel;
        againBtn.disabled = !opts.againEnabled;
    } else {
        againBtn.hidden = true;
    }
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-in'));

    const skip = { skip: false };
    const onSkip = () => { skip.skip = true; };
    ov.querySelector('.gfx-skip').addEventListener('click', (e) => { e.stopPropagation(); onSkip(); });
    ov.addEventListener('click', onSkip);

    if (!reduced()) await runIntro(ov.querySelector('.gfx-canvas'), best, skip);

    // カードを並べる(裏向き)
    const box = ov.querySelector('.gfx-cards');
    const dim = document.createElement('div');
    dim.className = 'gfx-dim';
    box.appendChild(dim);
    const cards = results.map((r, i) => buildCard(r, i, makeFace));
    cards.forEach((c) => box.appendChild(c));
    ov.classList.add('is-cards');
    skip.skip = false;
    // 押すと止まる待ち時間(SKIPした時は残りの待ちを飛ばす)
    const wait = (ms) => new Promise((res) => {
        if (reduced()) { res(); return; }
        const t0 = performance.now();
        const total = ms * (window.__gfxSlow || 1);   // __gfxSlow: 見た目の確認用に待ち時間を伸ばす
        const tick = () => (skip.skip || performance.now() - t0 >= total ? res() : setTimeout(tick, 30));
        tick();
    });
    await wait(600 + results.length * 60);
    cards.forEach((c) => c.classList.add('is-dealt'));   // 配る動きを外して、transform を使えるようにする

    // 1枚ずつ、ゆっくりめくる(2026-11-23 ユーザー: レア度にかかわらずゆっくり)。
    // SR・SSRは、おみくじのアルカナのように画面の真ん中へ大きく飛び出してきて、ためてからめくる。SSRはもっとためる
    for (let i = 0; i < cards.length; i++) {
        const rar = rarityOf(results[i]);
        const card = cards[i];
        const big = rar === 'SR' || rar === 'SSR';
        // SR: Rなどと同じめくり方で、ひと呼吸おいてから、めくれる時に少し前に出る(1.5倍)(揺れ・光はなし。2026-11-23 ユーザー)
        if (rar === 'SR' && !skip.skip && !reduced()) {
            await wait(450);   // めくる前にひと呼吸おく
            card.classList.add('is-focus');
            card.style.transform = 'scale(1.5)';
            flip(card, rar);
            await wait(500);
            card.style.transform = '';
            await wait(550);
            card.classList.remove('is-focus');
            continue;
        }
        if (!big || skip.skip || reduced()) {
            flip(card, rar);
            await wait(650);
            continue;
        }
        // おみくじのガチャと同じく「その場でためる → めくれながら前へ近づいてくる」(2026-11-23 ユーザー)。
        // SRとSSRの違いは近づいてくる大きさ(SSRの方が大きい)と、SSRだけためる(揺れ付き)こと
        // SRはためずに、すぐめくれながら近づく(2026-11-23 ユーザー: シャドバのレアを引く時のイメージ)。SSRだけためる
        card.classList.add('is-focus');
        ov.classList.add('is-focusing');
        if (rar === 'SSR') {
            card.classList.add('is-charge-big');
            ov.classList.add('is-shake');
            await wait(1000);
            ov.classList.add('is-shake-hard');
            await wait(1100);
        } else {
            await wait(250);
        }
        card.classList.remove('is-charge-big');
        ov.classList.remove('is-shake', 'is-shake-hard');
        // 白く光って、めくれながら真ん中へ大きくなる
        const rc = card.getBoundingClientRect();
        const k = rar === 'SSR'
            ? Math.min(3.2, (window.innerHeight * 0.66) / rc.height)
            : Math.min(2.1, (window.innerHeight * 0.44) / rc.height);
        const dx = window.innerWidth / 2 - (rc.left + rc.width / 2);
        const dy = window.innerHeight / 2 - (rc.top + rc.height / 2);
        const flash = document.createElement('div');
        flash.className = `gfx-flash gfx-flash-${rar}`;
        ov.appendChild(flash);
        setTimeout(() => flash.remove(), 900);
        card.classList.add('is-approach');
        card.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
        flip(card, rar);
        await wait(rar === 'SSR' ? 2200 : 1600);
        // 元の場所へ戻る
        card.style.transform = '';
        ov.classList.remove('is-focusing');
        await wait(550);
        card.classList.remove('is-focus', 'is-approach');
    }
    // SKIPで途中を飛ばした時の後始末
    cards.forEach((c, i) => {
        if (!c.classList.contains('is-flipped')) flip(c, rarityOf(results[i]));
        c.style.transform = '';
        c.classList.remove('is-focus', 'is-charge', 'is-charge-big', 'is-approach');
    });
    ov.classList.remove('is-focusing', 'is-shake', 'is-shake-hard');
    ov.querySelector('.gfx-skip').hidden = true;
    ov.removeEventListener('click', onSkip);
    await sleep(250);
    ov.classList.add('is-done');

    const choice = await new Promise((res) => {
        const close = (v) => { document.removeEventListener('keydown', onKey); res(v); };
        const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') close('ok'); };
        ov.querySelector('.gfx-ok').addEventListener('click', () => close('ok'));
        againBtn.addEventListener('click', () => { if (!againBtn.disabled) close('again'); });
        document.addEventListener('keydown', onKey);
    });
    ov.classList.remove('is-in');
    await sleep(250);
    ov.remove();
    return choice;
}
