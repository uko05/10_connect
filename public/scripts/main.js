// main.js - ハブ画面（モード選択）。キャラ選択・対戦ロジックは characterSelect.js が担当する
import { APP_VERSION } from './version.js';
import { setupSettingsModal, bindSettingsUI } from './settingsManager.js';

// 設定ダイアログ（石カラー・必殺技演出強度・音量）
setupSettingsModal('settingsButton', 'settingsModal');
bindSettingsUI(document.getElementById('settingsModal'));

// バージョン表示
document.getElementById('version').textContent = APP_VERSION;

// 縦持ち時の「横画面にしてください」ラベル設定
const orientationLabel = document.getElementById('orientationLabel');
if (orientationLabel) {
    orientationLabel.innerHTML =
        '<div>横画面にしてください</div>' +
        '<div style="font-size:0.45em; margin-top:0.5em; line-height:1.4;">This game currently supports Japanese only.<br>Thanks for your support!</div>';
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
