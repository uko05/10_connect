// layoutScaler.js - スマホ対応スケーリング共通関数

/**
 * header高さ・親要素を考慮してスケールを計算する
 * containerEl 指定時はコンテナの幅・高さをDOM実測して使用（スマホで安定）
 * containerEl 省略時は window.innerHeight ベース（PC向け）
 * @param {number} baseWidth - コンテンツの論理幅
 * @param {number} baseHeight - コンテンツの論理高さ
 * @param {HTMLElement} [containerEl] - 幅・高さの基準となる親要素（省略時はmainまたはviewport）
 * @returns {number} scale（0〜1）
 */
export function calcFitScale(baseWidth, baseHeight, containerEl) {
    const header = document.querySelector("header");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const viewportH = window.innerHeight - headerH;

    let vw, vh;

    if (containerEl) {
        // DOM実測: コンテナの幅と、コンテナ高さ/ビューポート高さの小さい方を使用
        // （PCでブラウザ縮小時にもスケールダウンが効くようにする）
        const rect = containerEl.getBoundingClientRect();
        vw = rect.width;
        vh = Math.min(rect.height, viewportH);
    } else {
        // PC向け: header高さを引いた viewport ベース
        const main = document.querySelector("main");
        const vv = window.visualViewport;
        vw = main ? main.clientWidth : (vv ? vv.width : document.documentElement.clientWidth);
        vh = viewportH;
    }

    const margin = containerEl ? 0 : 16;
    return Math.min(1, (vw - margin) / baseWidth, (vh - margin) / baseHeight);
}

/**
 * 指定要素にスケールを適用し、resize / orientationchange / visualViewport resize で自動再計算する
 * wrap要素の親要素の幅・高さを基準にスケール計算する
 * @param {string} wrapId - スケール対象要素のID
 * @param {number} baseWidth - コンテンツの論理幅
 * @param {number} baseHeight - コンテンツの論理高さ
 * @param {function} [onScale] - スケール適用後のコールバック (scale) => void
 * @returns {function} setupLayout - 手動で再計算を呼ぶための関数
 */
export function setupScaledLayout(wrapId, baseWidth, baseHeight, onScale) {
    function setupLayout() {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;
        const container = wrap.parentElement;
        const scale = calcFitScale(baseWidth, baseHeight, container);
        wrap.style.transform = `scale(${scale})`;
        if (onScale) onScale(scale);
    }

    setupLayout();

    window.addEventListener('resize', setupLayout);
    window.addEventListener('orientationchange', setupLayout);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setupLayout);
        window.visualViewport.addEventListener('scroll', setupLayout);
    }

    return setupLayout;
}

/**
 * スマホ用：transform:scale() を使わず CSS 実寸でレイアウトする
 * centerPanel の実サイズを測定し、canvas / topCanvas / timer の CSS 幅・高さを直接設定
 * → 石投下エリアの上端クリップ問題を根本解消
 * → 盤面を最大化（transform のオーバーヘッドなし）
 *
 * @param {string} wrapId - boardWrap の ID
 * @param {number} bufferWidth - canvas バッファ幅（770）
 * @param {number} bufferHeight - canvas バッファ高さ（660）
 * @param {number} topCanvasBufferH - topCanvas バッファ高さ（110）
 * @param {number} timerCssH - タイマー CSS 高さ（15）
 * @param {function} [onScale] - scale 確定後のコールバック (scale) => void
 * @returns {function} setupLayout - 手動で再計算を呼ぶための関数
 */
export function setupMobileBoardLayout(wrapId, bufferWidth, bufferHeight, topCanvasBufferH, timerCssH, onScale) {
    function setupLayout() {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;

        const topCanvasEl = document.getElementById('connect4Canvas_top');
        const mainCanvas = document.getElementById('connect4Canvas');
        const timer = document.getElementById('timeLimitContainer');
        if (!topCanvasEl || !mainCanvas || !timer) return;

        // transform:scale を明示的に無効化（CSS実寸レイアウト）
        wrap.style.transform = 'none';

        // centerPanel の実サイズを取得
        const centerPanel = document.getElementById('centerPanel');
        if (!centerPanel) return;
        const panelRect = centerPanel.getBoundingClientRect();
        const availW = panelRect.width;
        const availH = panelRect.height;

        // topCanvas は固定高さ（石が欠けない最小限確保: バッファ高さの比率で計算）
        // 石の半径 = cellSize/2 - 5 = 50 → 石の直径100、中心=55 → 上端=5 → 比率 5/110 ≈ 5%
        // 表示高さを十分確保（バッファ高さの25%程度）
        const topCanvasRatio = 0.30; // バッファ高さの30%を表示（上端にマージン確保）
        const topH = Math.max(20, Math.round(topCanvasBufferH * topCanvasRatio));

        // メインcanvasが使える高さ
        const canvasAvailH = availH - topH - timerCssH;
        if (canvasAvailH <= 0) return;

        // メインcanvasのアスペクト比を維持しつつ最大化
        const canvasRatio = bufferWidth / bufferHeight; // 770/660 ≈ 1.167
        let canvasW, canvasH;
        if (canvasAvailH * canvasRatio <= availW) {
            // 高さがボトルネック
            canvasH = canvasAvailH;
            canvasW = Math.round(canvasH * canvasRatio);
        } else {
            // 幅がボトルネック
            canvasW = availW;
            canvasH = Math.round(canvasW / canvasRatio);
        }

        const scale = canvasW / bufferWidth;

        // CSS 実寸を直接設定
        wrap.style.width = canvasW + 'px';

        topCanvasEl.style.width = canvasW + 'px';
        topCanvasEl.style.height = topH + 'px';

        mainCanvas.style.width = canvasW + 'px';
        mainCanvas.style.height = canvasH + 'px';
        mainCanvas.style.maxWidth = 'none';
        mainCanvas.style.maxHeight = 'none';

        timer.style.width = canvasW + 'px';
        timer.style.height = timerCssH + 'px';

        if (onScale) onScale(scale);

        // デバッグログ
        console.log('[Mobile Layout (CSS実寸)]', {
            scale,
            availW, availH,
            topH, canvasW, canvasH, timerCssH,
            topCanvasRect: topCanvasEl.getBoundingClientRect(),
            canvasRect: mainCanvas.getBoundingClientRect(),
            timerRect: timer.getBoundingClientRect(),
            boardWrapRect: wrap.getBoundingClientRect(),
        });
    }

    setupLayout();

    window.addEventListener('resize', setupLayout);
    window.addEventListener('orientationchange', setupLayout);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setupLayout);
        window.visualViewport.addEventListener('scroll', setupLayout);
    }

    return setupLayout;
}
