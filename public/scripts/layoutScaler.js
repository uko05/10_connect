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
 * PC と同じアスペクト比（770:800 = topCanvas+canvas+timer）を維持しつつ
 * centerPanel 内を最大限使い切る
 *
 * ② topCanvas のバッファサイズも CSS サイズに合わせて再設定（石の潰れ防止）
 * ④ 縦基準がボトルネックの場合、dropArea / timeBar を削減して盤面優先
 * ⑥ 緑バー下に余白（padding-bottom）追加
 *
 * @param {string} wrapId - boardWrap の ID
 * @param {number} bufferWidth - canvas バッファ幅（770）
 * @param {number} bufferHeight - canvas バッファ高さ（660）
 * @param {number} topCanvasBufferH - topCanvas バッファ高さ（110）
 * @param {number} timerBaseH - タイマー基準高さ（30）
 * @param {function} [onScale] - scale 確定後のコールバック (scale) => void
 * @returns {function} setupLayout
 */
export function setupMobileBoardLayout(wrapId, bufferWidth, bufferHeight, topCanvasBufferH, timerBaseH, onScale) {
    function setupLayout() {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;

        const topCanvasEl = document.getElementById('connect4Canvas_top');
        const mainCanvas = document.getElementById('connect4Canvas');
        const timer = document.getElementById('timeLimitContainer');
        if (!topCanvasEl || !mainCanvas || !timer) return;

        // transform:scale を明示的に無効化
        wrap.style.transform = 'none';

        // centerPanel の実サイズを取得
        const centerPanel = document.getElementById('centerPanel');
        if (!centerPanel) return;
        const panelRect = centerPanel.getBoundingClientRect();
        const availW = panelRect.width;
        const availH = panelRect.height;

        // PC と同じ全体アスペクト比: 770 : 800 (= topCanvas110 + canvas660 + timer30)
        const totalBaseH = topCanvasBufferH + bufferHeight + timerBaseH; // 800
        const totalRatio = bufferWidth / totalBaseH; // 770/800 = 0.9625

        // 利用可能領域にフィットさせる
        let totalW, totalH;
        if (availH * totalRatio <= availW) {
            // 高さがボトルネック → 高さを使い切る
            totalH = availH;
            totalW = Math.round(totalH * totalRatio);
        } else {
            // 幅がボトルネック
            totalW = availW;
            totalH = Math.round(totalW / totalRatio);
        }

        const scale = totalW / bufferWidth;

        // 各パーツの高さをスケール比率で配分
        const topH = Math.round(topCanvasBufferH * scale);
        const timerH = Math.round(timerBaseH * scale);
        const canvasH = totalH - topH - timerH;

        // ⑥ 緑バー下の余白 = timerH と同じ
        centerPanel.style.paddingBottom = timerH + 'px';

        // CSS 実寸を直接設定
        wrap.style.width = totalW + 'px';

        topCanvasEl.style.width = totalW + 'px';
        topCanvasEl.style.height = topH + 'px';
        // ② バッファサイズはPC同様(770x110)のまま維持 → 描画ロジックをPCと統一
        //    CSS style.width/height で縮小表示するだけ

        mainCanvas.style.width = totalW + 'px';
        mainCanvas.style.height = canvasH + 'px';
        mainCanvas.style.maxWidth = 'none';
        mainCanvas.style.maxHeight = 'none';

        timer.style.width = totalW + 'px';
        timer.style.height = timerH + 'px';

        if (onScale) onScale(scale);

        // デバッグログ
        console.log('[Mobile Layout (CSS実寸)]', {
            scale, availW, availH,
            totalW, totalH, topH, canvasH, timerH,
            topCanvasRect: topCanvasEl.getBoundingClientRect(),
            canvasRect: mainCanvas.getBoundingClientRect(),
            timerRect: timer.getBoundingClientRect(),
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
