// renderer.js - Canvas描画系の純粋なレンダリング処理

/**
 * 石を1つ描画する（光沢付き円）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} column - 列番号
 * @param {number} y - Y座標（ピクセル）
 * @param {string} color - 石の色
 * @param {number} cellSize - セルのサイズ
 */
export function drawPiece(ctx, column, y, color, cellSize) {
    // メインの円
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
        column * cellSize + cellSize / 2, // X座標
        y + cellSize / 2, // Y座標
        (cellSize / 2) - 5, // 半径
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.closePath();

    // 光沢の円
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(
        column * cellSize + cellSize / 2 - 10, // X座標（少しずらす）
        y + cellSize / 2 - 10, // Y座標（少しずらす）
        (cellSize / 2) - 20, // 半径（小さめ）
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.closePath();
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
