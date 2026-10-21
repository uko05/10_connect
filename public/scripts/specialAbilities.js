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

// 重力反転の演出: 盤面(canvas)を縦にくるっと回し、真ん中(見えない瞬間)で盤面を入れ替える
export async function flipBoardAnimation(canvas, onMiddle) {
    if (!canvas || !canvas.animate) { await onMiddle(); return; }
    const t = 260;
    await canvas.animate([{ transform: 'perspective(800px) rotateX(0deg)' }, { transform: 'perspective(800px) rotateX(90deg)' }],
        { duration: t, easing: 'ease-in', fill: 'forwards' }).finished;
    await onMiddle();
    await canvas.animate([{ transform: 'perspective(800px) rotateX(-90deg)' }, { transform: 'perspective(800px) rotateX(0deg)' }],
        { duration: t, easing: 'ease-out', fill: 'forwards' }).finished;
    canvas.getAnimations().forEach((a) => a.cancel());
}
