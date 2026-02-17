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
 * スマホ用：boardWrapのscrollHeightをDOM実測してbaseHeightとして使用する
 * transform:scale(1)に一時リセットして正確な高さを取得
 * @param {string} wrapId - スケール対象要素のID
 * @param {number} baseWidth - コンテンツの論理幅
 * @param {function} [onScale] - スケール適用後のコールバック (scale) => void
 * @returns {function} setupLayout - 手動で再計算を呼ぶための関数
 */
export function setupMobileBoardLayout(wrapId, baseWidth, onScale) {
    function setupLayout() {
        const wrap = document.getElementById(wrapId);
        if (!wrap) return;

        // transform を一時リセットして正確な scrollHeight を取得
        wrap.style.transform = 'scale(1)';
        const baseHeight = wrap.scrollHeight;

        const container = wrap.parentElement;
        const scale = calcFitScale(baseWidth, baseHeight, container);
        wrap.style.transform = `scale(${scale})`;
        if (onScale) onScale(scale);

        // デバッグログ
        const containerRect = container.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const leftPane = document.getElementById('leftPane');
        const rightPane = document.getElementById('rightPane');
        const timeBar = document.getElementById('timeLimitContainer');
        console.log('[Mobile Layout Debug]', {
            scale,
            baseWidth,
            baseHeight,
            containerRect: { w: containerRect.width, h: containerRect.height, top: containerRect.top, left: containerRect.left },
            boardWrapRect: { w: wrapRect.width, h: wrapRect.height, top: wrapRect.top, left: wrapRect.left },
            leftPaneRect: leftPane ? { w: leftPane.getBoundingClientRect().width } : null,
            rightPaneRect: rightPane ? { w: rightPane.getBoundingClientRect().width } : null,
            timeBarRect: timeBar ? { w: timeBar.getBoundingClientRect().width, h: timeBar.getBoundingClientRect().height } : null,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            visualViewport: window.visualViewport ? { w: window.visualViewport.width, h: window.visualViewport.height } : null,
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
