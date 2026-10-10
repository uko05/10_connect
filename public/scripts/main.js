// main.js - ハブ画面（モード選択）。キャラ選択・対戦ロジックは characterSelect.js が担当する
import { APP_VERSION } from './version.js';
import { setupSettingsModal, bindSettingsUI } from './settingsManager.js';
import { initLang, t, getCharaText } from './i18n.js';
import { pickHubHero } from './hubHero.js';
import { applyBattleBackground } from './designSettings.js';

// 背景(プレイヤー情報 > デザイン変更 で選んだもの)
applyBattleBackground();
import { authReady } from './firebaseConfig.js';
import { getUserRating } from './eloRating.js';
import { getRankByRating, getRankBadgePath } from './rankConfig.js';

// 設定ダイアログ（石カラー・必殺技演出強度・音量）
setupSettingsModal('settingsButton', 'settingsModal');
bindSettingsUI(document.getElementById('settingsModal'));
initLang();

// バージョン表示
document.getElementById('version').textContent = APP_VERSION;

// 縦持ち時の「横画面にしてください」ラベル設定
const orientationLabel = document.getElementById('orientationLabel');
if (orientationLabel) {
    orientationLabel.innerHTML =
        `<div>${t('orientationMsg')}</div>` +
        `<div style="font-size:0.45em; margin-top:0.5em; line-height:1.4;">${t('orientationSub')}</div>`;
}

//------------------------------------------------------------------------------------------------
// ヘルプモーダル

const helpModal = document.getElementById('helpModal');
const helpButton = document.getElementById('helpButton');
const closeModalButton = helpModal.querySelector('.close');
const slides = document.querySelectorAll('.slide');
const prevButton = document.querySelector('.prev-btn');
const nextButton = document.querySelector('.next-btn');
let currentSlide = 0;

helpButton.addEventListener('click', () => {
    helpModal.style.display = 'block';
});
closeModalButton.addEventListener('click', () => {
    helpModal.style.display = 'none';
});
window.addEventListener('click', (event) => {
    if (event.target === helpModal) {
        helpModal.style.display = 'none';
    }
});

function updateSlides() {
    slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === currentSlide);
    });
}
prevButton.addEventListener('click', () => {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateSlides();
});
nextButton.addEventListener('click', () => {
    currentSlide = (currentSlide + 1) % slides.length;
    updateSlides();
});
updateSlides();

//------------------------------------------------------------------------------------------------
// モード選択（各ボタンからキャラ選択画面／プレイヤー情報画面へ遷移）

document.getElementById('goCpuButton').addEventListener('click', () => {
    window.location.href = 'select.html?mode=cpu';
});
document.getElementById('goMatchButton').addEventListener('click', () => {
    window.location.href = 'select.html?mode=match';
});
document.getElementById('goPlayerInfoButton').addEventListener('click', () => {
    window.location.href = 'playerInfo.html';
});

//------------------------------------------------------------------------------------------------
// ハブ画面: 左の大きなキャラ(設定に従ってランダム/固定、hubHero.js)と、自分のランク表示
// 自分のデータ(解放済みの隠しキャラ・レート)を読んでから両方を出す。読み込みが遅い時は通常キャラだけで先に出す

const myDataPromise = (async () => {
    try {
        const user = await authReady;
        return user ? await getUserRating(user.uid) : null;
    } catch (e) {
        console.warn('[hub] user data load failed', e);
        return undefined; // 読み込み失敗(ランク欄は出さない)
    }
})();

function showHero(userData) {
    const img = document.getElementById('hubHeroImg');
    if (!img || img.dataset.shown) return;
    const pick = pickHubHero(userData);
    if (!pick) return;
    img.dataset.shown = '1';
    img.src = pick.src;
    document.getElementById('hubHeroName').textContent = getCharaText(pick.charaID, 'name') || pick.name;
}
const heroFallbackTimer = setTimeout(() => showHero(null), 1500);

(async () => {
    const data = await myDataPromise;
    clearTimeout(heroFallbackTimer);
    showHero(data || null);

    const box = document.getElementById('hubPlayer');
    if (!box || data === undefined) return;
    const rating = data?.rating ?? 1500;
    const matchCount = data?.matchCount || 0;
    const winCount = data?.winCount || 0;
    const tier = getRankByRating(rating);
    document.getElementById('hubRankBadge').src = getRankBadgePath(rating);
    document.getElementById('hubRankBadge').alt = tier.name;
    document.getElementById('hubRankName').textContent = tier.name.toUpperCase();
    document.getElementById('hubPlayerName').textContent = data?.playerName || t('hubDefaultName');
    document.getElementById('hubPlayerRate').textContent = matchCount > 0
        ? t('hubRate').replace('{rate}', Math.round(rating).toLocaleString())
            .replace('{win}', winCount).replace('{lose}', Math.max(0, matchCount - winCount))
        : t('hubNoRanked');
    box.hidden = false;
})();
