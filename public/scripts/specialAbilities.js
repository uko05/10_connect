// specialAbilities.js — 新しい必殺技(2026-10-21)の、盤面を変える計算と描画の共通部品
// 対人戦(gameLogic.js)・CPU戦(soloLogic.js)の両方から使う。どちらも盤面は stones["列_行"] の形
// (行0が一番上)。値は対人戦が { color, turnCount, bomb? }、CPU戦が色の文字列。
//
//   重力反転   ult_gravityFlip : 盤面を上下にひっくり返し、石が重力で落ち直す(各列の積み順が逆になる)
//   爆弾       ult_bomb        : 相手の石を1つランダムに爆弾にし、使った人の2回後の自分の番の開始時に
//                                周り8マス(と爆弾自身)を敵味方関係なく破壊する
//   反転の一手 ult_flipTouch   : 必殺技を使ったターンに置いた石の下・左・右の色を反転し、
//                                最後に置いた石自身も相手の色になる
// 両者が同時に4つ並んだ場合は、通常どおり両者に1ポイント。

export const BOMB_TURNS = 2;

// 盤面を上下にひっくり返して落とし直す。各列の石の積み順が逆になる(一番上の石が一番下に)。
// 戻り値: { stones: 新しい盤面, moved: { 元のキー: 新しいキー } }
export function gravityFlip(stones, rows, cols) {
    const out = {};
    const moved = {};
    for (let c = 0; c < cols; c++) {
        const keys = [];
        for (let r = 0; r < rows; r++) if (stones[`${c}_${r}`] !== undefined && stones[`${c}_${r}`] !== null) keys.push(`${c}_${r}`);
        // keys は上から順。逆順にして、下から積み直す
        const n = keys.length;
        keys.forEach((key, i) => {
            // 上から i 番目の石 → 下から i 番目(=行 rows-1-i)
            const to = `${c}_${rows - 1 - i}`;
            out[to] = stones[key];
            moved[key] = to;
        });
        void n;
    }
    return { stones: out, moved };
}

// 置いた石(col,row)の下・左・右のマス(盤面の内側だけ)
export function flipTouchNeighbors(col, row, rows, cols) {
    const keys = [];
    if (row + 1 < rows) keys.push(`${col}_${row + 1}`);
    if (col - 1 >= 0) keys.push(`${col - 1}_${row}`);
    if (col + 1 < cols) keys.push(`${col + 1}_${row}`);
    return keys;
}

// 爆弾(key)の爆発で壊れるマス(爆弾自身と周り8マス。盤面の内側だけ)
export function bombBlastKeys(key, rows, cols) {
    const [c, r] = key.split('_').map(Number);
    const keys = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) keys.push(`${cc}_${rr}`);
    }
    return keys;
}

export const otherColor = (color) => (color === 'red' ? 'yellow' : 'red');

// 爆弾の印(石の上に重ねる)。黒い輪と、爆発までの残り回数
export function drawBombMarker(ctx, col, row, cellSize, turnsLeft) {
    const cx = col * cellSize + cellSize / 2;
    const cy = row * cellSize + cellSize / 2;
    const rad = cellSize * 0.42;
    ctx.save();
    ctx.lineWidth = Math.max(3, cellSize * 0.06);
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.85)';
    ctx.setLineDash([cellSize * 0.09, cellSize * 0.06]);
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(20, 20, 20, 0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.2, 0, Math.PI * 2);
    ctx.fill();
    if (turnsLeft != null) {
        ctx.fillStyle = '#ff5a3c';
        ctx.font = `bold ${Math.round(cellSize * 0.28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(turnsLeft), cx, cy + 1);
    }
    ctx.restore();
}

// 重力反転の演出(2026-10-21、Downloads\コネバト演出試作\重力反転試作.html と同じ):
// ① 盤面(canvas)ごと奥に向かってひっくり返る(上下だけ反転。左右はそのまま)
// ② 石が上側に張り付いた状態を一呼吸見せる
// ③ 重力で下へ落ちる(各列、下にある石から少しずつ遅れて落ち、着地で小さく弾む)
// ④ 着地で盤面が軽く揺れる
// drawPieces(pieces) は呼び出し側の描画(グリッド+石)。pieces は [{ c, y(px), value }]。
// 戻り値の盤面の確定(stonesの差し替え)は呼び出し側で行う。
export async function playGravityFlipAnimation({ canvas, stones, rows, cols, cellSize, drawPieces }) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (canvas && canvas.animate) {
        await canvas.animate([{ transform: 'perspective(1400px) rotateX(0deg)' }, { transform: 'perspective(1400px) rotateX(180deg)' }],
            { duration: 700, easing: 'cubic-bezier(.55,0,.35,1)', fill: 'forwards' }).finished;
    }
    // ひっくり返った見た目(行 r → rows-1-r)を、向きを戻した盤面に描き直す(見た目は同じなので継ぎ目なし)
    const pieces = [];
    for (const key in stones) {
        if (stones[key] === undefined || stones[key] === null) continue;
        const [c, r] = key.split('_').map(Number);
        const mr = rows - 1 - r;
        pieces.push({ c, r: mr, y: mr * cellSize, value: stones[key] });
    }
    if (canvas) canvas.getAnimations().forEach((a) => a.cancel());
    drawPieces(pieces);
    await wait(350);

    for (let c = 0; c < cols; c++) {
        pieces.filter((p) => p.c === c).sort((a, b) => b.r - a.r)   // 下にある順
            .forEach((p, i) => { p.target = (rows - 1 - i) * cellSize; p.delay = i * 40; p.v = 0; p.done = false; p.bounced = false; });
    }
    const g = 0.0072 * cellSize / 110;   // 4マス分を約0.35秒で落ちる重力(px/ms²)
    await new Promise((resolve) => {
        const t0 = performance.now();
        let last = t0;
        function frame(now) {
            const dt = Math.min(32, now - last); last = now;
            let allDone = true;
            for (const p of pieces) {
                if (p.done) continue;
                if (now - t0 < p.delay) { allDone = false; continue; }
                p.v += g * dt;
                p.y += p.v * dt;
                if (p.y >= p.target) {
                    if (!p.bounced && p.v > 0.6 * cellSize / 110) { p.y = p.target; p.v = -p.v * 0.22; p.bounced = true; }
                    else { p.y = p.target; p.done = true; }
                }
                if (!p.done) allDone = false;
            }
            drawPieces(pieces);
            if (!allDone) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
    });
    if (canvas && canvas.animate) {
        canvas.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(5px)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }],
            { duration: 300 });
    }
}
