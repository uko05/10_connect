// main.js - ハブ画面（モード選択）。キャラ選択・対戦ロジックは characterSelect.js が担当する
import { APP_VERSION } from './version.js';
import { setupSettingsModal, bindSettingsUI } from './settingsManager.js';
import { initLang, t, getCharaText } from './i18n.js';
import { characterData } from './characterData.js';
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
// ハブ画面の左の大きなキャラ(開くたびに完全ランダム、2026-10-11のデザイン変更)
// ※ 将来ガチャなどで表示できるイラストの種類を増やす場合は、ここで選ぶ候補を増やせばよい

const heroImg = document.getElementById('hubHeroImg');
if (heroImg) {
    const pool = characterData.filter((c) => c.src);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) {
        heroImg.src = pick.src;
        document.getElementById('hubHeroName').textContent = getCharaText(pick.charaID, 'name') || pick.name;
    }
}

//------------------------------------------------------------------------------------------------
// 自分のランク表示(ランクバッジ・レート・戦績)。読み込めなかった時は欄ごと出さない

(async () => {
    const box = document.getElementById('hubPlayer');
    if (!box) return;
    try {
        const user = await authReady;
        const data = user ? await getUserRating(user.uid) : null;
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
    } catch (e) {
        console.warn('[hub] rank load failed', e);
    }
})();
