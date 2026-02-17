// layoutScaler.js - スマホ対応スケーリング共通関数

/**
 * header高さ・親要素幅を考慮してスケールを計算する
 * 高さは window.innerHeight を使用（キーボード表示時にも安定）
 * @param {number} baseWidth - コンテンツの論理幅
 * @param {number} baseHeight - コンテンツの論理高さ
 * @param {HTMLElement} [containerEl] - 幅の基準となる親要素（省略時はmainまたはviewport）
 * @returns {number} scale（0〜1）
 */
export function calcFitScale(baseWidth, baseHeight, containerEl) {
    const header = document.querySelector("header");
    const headerH = header ? header.getBoundingClientRect().height : 0;

    let vw;
    if (containerEl) {
        vw = containerEl.clientWidth;
    } else {
        const main = document.querySelector("main");
        const vv = window.visualViewport;
        vw = main ? main.clientWidth : (vv ? vv.width : document.documentElement.clientWidth);
    }
    const vh = window.innerHeight - headerH;

    const margin = containerEl ? 4 : 16;
    return Math.min(1, (vw - margin) / baseWidth, (vh - margin) / baseHeight);
}

/**
 * 指定要素にスケールを適用し、resize / orientationchange / visualViewport resize で自動再計算する
 * wrap要素の親要素の幅を基準にスケール計算する
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
