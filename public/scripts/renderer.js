// renderer.js - Canvas描画系の純粋なレンダリング処理
import { drawSkinMark } from './designSettings.js';

/**
 * 石を1つ描画する（碁石風: つや消し+ふちの丸み+下側の厚み、2026-10-10に変更）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} column - 列番号
 * @param {number} y - Y座標（ピクセル、マスの上端）
 * @param {string} color - 石の色（#rrggbb）
 * @param {number} cellSize - セルのサイズ
 * @param {object|null} skin - 石のスキン(designSettings.js)。自分の石にだけ渡す。nullなら標準
 * @param {string|null} oppColor - 相手の石の表示色。スキンの色とかぶる時だけ自分の色の輪を付けるのに使う
 */
export function drawPiece(ctx, column, y, color, cellSize, skin = null, oppColor = null) {
    drawStoneAt(ctx, column * cellSize + cellSize / 2, y + cellSize / 2, (cellSize / 2) - 5, color, skin, oppColor);
}

// #rrggbb を明るく(amt>0)/暗く(amt<0)した色を返す。#rrggbb以外はそのまま返す
function shadeColor(hex, amt) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const n = parseInt(hex.slice(1), 16);
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    const mix = (v) => Math.round((t - v) * p + v);
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/**
 * 中心座標と半径を指定して碁石風の石を描く（盤面の石・盤面上のカーソル石で共通）。
 * 影はshadowBlurを使わずに描く(マスの外にはみ出すと、石を消した時に影の跡が残るため)。
 */
export function drawStoneAt(ctx, cx, cy, R, color, skin = null, oppColor = null) {
    // 形: 'round'(丸) か 'square'(角丸の四角)。スキンが無ければ丸(2026-10-11、形ごとに別アイテム)
    const shape = skin?.shape === 'square' ? 'square' : 'round';
    // 元素・国のスキンは、石そのものをテーマ色にして白いマークを重ねる。
    // ただしスキンの色が相手の石の色に近くて見分けにくい時(かぶった時)だけ、外側に自分の色(赤/黄)の
    // 太い輪を残して、内側にスキンを小さめに描く(2026-10-11、案A)
    if (skin && skin.color && oppColor && isSkinClash(skin.color, color, oppColor)) {
        drawGoBody(ctx, cx, cy, R, color, shape);
        const r = R * 0.74;
        drawGoBody(ctx, cx, cy - R * 0.02, r, skin.color, shape, false);
        if (skin.icon) drawSkinMark(ctx, cx, cy - R * 0.02, r, skin);
        drawGoHighlight(ctx, cx, cy, R, shape);
        return;
    }
    if (skin && skin.color) color = skin.color;
    drawGoBody(ctx, cx, cy, R, color, shape);
    if (skin && skin.icon) drawSkinMark(ctx, cx, cy, R, skin);
    drawGoHighlight(ctx, cx, cy, R, shape);
}

// スキンの色(skinHex)が、相手の色(oppHex)に近くて自分の色(myHex)より相手に近い時に「かぶり」とみなす。
// 例: 自分が黄・相手が赤で「炎」を選んでいる → かぶり。自分が赤で「炎」 → かぶらない(赤い石のまま自然に見える)
function isSkinClash(skinHex, myHex, oppHex) {
    const rgb = (h) => {
        if (typeof h !== 'string' || !/^#[0-9a-f]{6}$/i.test(h)) return null;
        const n = parseInt(h.slice(1), 16);
        return [n >> 16, (n >> 8) & 255, n & 255];
    };
    const s = rgb(skinHex), m = rgb(myHex), o = rgb(oppHex);
    if (!s || !m || !o) return false;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const toOpp = dist(s, o);
    return toOpp < 200 && toOpp <= dist(s, m);
}

// 石の輪郭のパスを作る(rx,ryは半径。四角は角を丸めた正方形)
function stonePath(ctx, cx, cy, rx, ry, shape) {
    ctx.beginPath();
    if (shape === 'square') {
        const w = rx * 0.92, h = ry * 0.92, r = Math.min(w, h) * 0.32;
        const x = cx - w, y = cy - h;
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + 2 * w, y, x + 2 * w, y + 2 * h, r);
        ctx.arcTo(x + 2 * w, y + 2 * h, x, y + 2 * h, r);
        ctx.arcTo(x, y + 2 * h, x, y, r);
        ctx.arcTo(x, y, x + 2 * w, y, r);
        ctx.closePath();
    } else {
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
}

// 碁石風の本体(接地の影・下側の厚み・上面)。withShadow=falseなら接地の影を省く(内側に重ねる時用)
function drawGoBody(ctx, cx, cy, R, color, shape = 'round', withShadow = true) {
    ctx.save();
    if (withShadow) {
        // 接地の影(マスからはみ出さない大きさに抑える)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        stonePath(ctx, cx, cy + R * 0.1, R * 0.98, R * 0.94, shape);
        ctx.fill();
    }
    // 下側の厚み
    ctx.fillStyle = shadeColor(color, -0.3);
    stonePath(ctx, cx, cy + R * 0.05, R * 0.97, R * 0.92, shape);
    ctx.fill();
    // 上面(左上から光が当たるなめらかなグラデーション)
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * (shape === 'square' ? 1.15 : 1));
    g.addColorStop(0, shadeColor(color, 0.35));
    g.addColorStop(1, shadeColor(color, -0.2));
    ctx.fillStyle = g;
    stonePath(ctx, cx, cy - R * 0.03, R * 0.95, R * 0.89, shape);
    ctx.fill();
    ctx.restore();
}

// やわらかいハイライト(石のいちばん上に重ねる。石の形からはみ出さないように切り抜く)
function drawGoHighlight(ctx, cx, cy, R, shape = 'round') {
    ctx.save();
    stonePath(ctx, cx, cy - R * 0.03, R * 0.95, R * 0.89, shape);
    ctx.clip();
    const h = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, 0, cx - R * 0.3, cy - R * 0.4, R * 0.5);
    h.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    h.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = h;
    ctx.beginPath();
    ctx.arc(cx - R * 0.3, cy - R * 0.4, R * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/**
 * 画面全体を一瞬フラッシュさせる（必殺技発動の衝撃演出）
 * @param {string} color - フラッシュ色（rgba推奨）
 * @param {number} duration - フラッシュの合計時間(ms)
 */
export function flashScreen(color = 'rgba(255, 255, 255, 0.7)', duration = 200) {
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.inset = '0';
    flash.style.backgroundColor = color;
    flash.style.zIndex = '10000';
    flash.style.pointerEvents = 'none';
    document.body.appendChild(flash);

    const anim = flash.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }],
        { duration, easing: 'ease-out' }
    );
    anim.onfinish = () => flash.remove();
}

/**
 * 指定要素を短時間振動させる（衝撃の演出）。要素のinline transformは元々の値に依存しないよう、終了後は何も残さない。
 * @param {HTMLElement} el - 振動させる要素
 * @param {number} intensity - 振幅(px)
 * @param {number} duration - 振動時間(ms)
 */
export function shakeElement(el, intensity = 12, duration = 400) {
    if (!el) return;
    const steps = 8;
    const frames = [];
    for (let i = 0; i <= steps; i++) {
        const decay = 1 - i / steps;
        const x = (i % 2 === 0 ? 1 : -1) * intensity * decay;
        const y = (i % 2 === 0 ? -1 : 1) * (intensity * 0.5) * decay;
        frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` });
    }
    frames.push({ transform: 'translate(0, 0)' });
    el.animate(frames, { duration, easing: 'ease-out' });
}

/**
 * 指定座標（viewport基準のfixed座標）から弾けるパーティクルを発生させる（石破壊の演出）
 * @param {number} x - 中心X座標
 * @param {number} y - 中心Y座標
 * @param {string[]} colors - パーティクル色のバリエーション
 * @param {number} count - パーティクル数
 */
export function spawnParticleBurst(x, y, colors = ['#ff7a00', '#ffd400', '#fff6cc'], count = 16) {
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        const size = 4 + Math.random() * 6;
        particle.style.position = 'fixed';
        particle.style.left = `${x - size / 2}px`;
        particle.style.top = `${y - size / 2}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.borderRadius = '50%';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        particle.style.boxShadow = '0 0 6px 2px rgba(255, 180, 0, 0.6)';
        particle.style.zIndex = '9998';
        particle.style.pointerEvents = 'none';
        document.body.appendChild(particle);

        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 70;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const duration = 450 + Math.random() * 250;

        const anim = particle.animate(
            [
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.2)`, opacity: 0 }
            ],
            { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        );
        anim.onfinish = () => particle.remove();
    }
}

/**
 * 指定位置の石を消去する
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} column - 列番号
 * @param {number} row - 行番号
 * @param {number} cellSize - セルのサイズ
 */
export function clearPiece(ctx, column, row, cellSize) {
    ctx.clearRect(column * cellSize, row * cellSize, cellSize, cellSize);
}

/**
 * キャンバス全体をクリアする
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 */
export function disp_DeleteStone(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.log("・disp_DeleteStone");
}

/**
 * 石が砕けて飛び散るシャード演出（Canvas overlay）
 * @param {{cx: number, cy: number, color: string}[]} stones - viewport固定座標と色('red'/'yellow')の配列
 */
export function spawnStoneShatter(stones) {
    if (!stones || stones.length === 0) return;

    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9997';
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    document.body.appendChild(cvs);
    const ctx2d = cvs.getContext('2d');

    const PALETTES = {
        red:    ['#cc1100', '#e83000', '#ff5500', '#8b2000', '#ff7744', '#dd3311'],
        yellow: ['#c08800', '#e0aa00', '#ffcc00', '#a07000', '#ffe055', '#ddaa11'],
    };
    const DEFAULT_PALETTE = ['#cc7700', '#ee9900', '#ffcc44', '#aa5500', '#ffaa00'];

    const shards = [];
    for (const { cx, cy, color } of stones) {
        const palette = PALETTES[color] || DEFAULT_PALETTE;
        const count = 6 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.7;
            const speed = 3 + Math.random() * 5;
            const size = 8 + Math.random() * 14;
            const verts = Array.from({ length: 4 }, (_, j) => {
                const a = (Math.PI * 2 / 4) * j + (Math.random() - 0.5) * 1.0;
                const r = size * (0.4 + Math.random() * 0.6);
                return [Math.cos(a) * r, Math.sin(a) * r];
            });
            shards.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.5,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.22,
                verts,
                color: palette[Math.floor(Math.random() * palette.length)],
                alpha: 1,
            });
        }
    }

    const duration = 500;
    const start = performance.now();

    function animate(now) {
        const t = Math.min((now - start) / duration, 1);
        ctx2d.clearRect(0, 0, cvs.width, cvs.height);
        for (const s of shards) {
            s.x += s.vx;
            s.y += s.vy;
            s.vy += 0.45;
            s.rot += s.rotSpeed;
            s.alpha = (1 - t) * (1 - t);
            ctx2d.save();
            ctx2d.globalAlpha = s.alpha;
            ctx2d.translate(s.x, s.y);
            ctx2d.rotate(s.rot);
            ctx2d.fillStyle = s.color;
            ctx2d.beginPath();
            ctx2d.moveTo(s.verts[0][0], s.verts[0][1]);
            for (let vi = 1; vi < s.verts.length; vi++) ctx2d.lineTo(s.verts[vi][0], s.verts[vi][1]);
            ctx2d.closePath();
            ctx2d.fill();
            ctx2d.restore();
        }
        if (t < 1) requestAnimationFrame(animate);
        else cvs.remove();
    }

    requestAnimationFrame(animate);
}
