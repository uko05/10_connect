// layoutScaler.js - スマホ対応スケーリング共通関数

/**
 * visualViewport / header高さを考慮してスケールを計算する
 * @param {number} baseWidth - コンテンツの論理幅
 * @param {number} baseHeight - コンテンツの論理高さ
 * @returns {number} scale（0〜1）
 */
export function calcFitScale(baseWidth, baseHeight) {
    const header = document.querySelector("header");
    const headerH = header ? header.getBoundingClientRect().height : 0;

    const vv = window.visualViewport;
    const main = document.querySelector("main");
    const vw = main ? main.clientWidth : (vv ? vv.width : document.documentElement.clientWidth);
    const vh = (vv ? vv.height : document.documentElement.clientHeight) - headerH;

    return Math.min(1, (vw - 16) / baseWidth, (vh - 16) / baseHeight);
}

/**
 * 指定要素にスケールを適用し、resize / orientationchange / visualViewport resize で自動再計算する
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
        const scale = calcFitScale(baseWidth, baseHeight);
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
