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
 * 石を描画し、パーティクル演出を追加する
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {number} column - 列番号
 * @param {number} y - Y座標（ピクセル）
 * @param {string} color - 石の色
 * @param {number} cellSize - セルのサイズ
 */
export function drawPieceWithParticles(ctx, canvas, column, y, color, cellSize) {
    // 通常の石を描画
    drawPiece(ctx, column, y, color, cellSize);

    // パーティクル用キャンバス
    const particleCanvas = document.createElement('canvas');
    const particleCtx = particleCanvas.getContext('2d');
    particleCanvas.width = canvas.width;
    particleCanvas.height = canvas.height;
    document.body.appendChild(particleCanvas);

    // パーティクルの設定
    const particles = Array.from({ length: 20 }, () => ({
        x: column * cellSize + cellSize / 2 + (Math.random() - 0.5) * 10,
        y: y + cellSize / 2 + (Math.random() - 0.5) * 10,
        radius: Math.random() * 4 + 2,
        dx: (Math.random() - 0.5) * 6,
        dy: (Math.random() - 0.5) * 6,
        alpha: 1.0,
    }));

    function animateParticles() {
        particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

        particles.forEach(p => {
            particleCtx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
            particleCtx.beginPath();
            particleCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            particleCtx.fill();
            particleCtx.closePath();

            p.x += p.dx;
            p.y += p.dy;
            p.radius *= 0.98;
            p.alpha -= 0.01;
        });

        if (particles.some(p => p.alpha > 0)) {
            requestAnimationFrame(animateParticles);
        } else {
            // パーティクル終了後にキャンバスを削除
            document.body.removeChild(particleCanvas);
        }
    }
    animateParticles();
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
