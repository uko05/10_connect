// audioManager.js - システムSEの生成・初期化・音量制御
import { getSystemVolume } from './settingsManager.js';

// システムSE
export const chargeSound = new Audio('public/scripts/sound/charge.mp3');
chargeSound.volume = getSystemVolume();

export const moveSound = new Audio('public/scripts/sound/moveSound.wav');
moveSound.volume = getSystemVolume();

export const highlightSound = new Audio('public/scripts/sound/stone_highlight.wav');
highlightSound.volume = getSystemVolume();

export const AbilityStandby = new Audio('public/scripts/sound/AbilityStandby.mp3');
AbilityStandby.volume = getSystemVolume();

/**
 * 初回クリック時に音声再生を初期化する（ブラウザの自動再生制限対策）
 * @param {Audio[]} voiceAudios - キャラボイス系Audioの配列 [pLeft_Attack, pRight_Attack, pLeft_ult, pRight_ult]
 */
export function initializeAudioPlayback(voiceAudios) {
    const audioFiles = [...voiceAudios, chargeSound];

    audioFiles.forEach(audio => {
        // 再生前にミュートを設定(音量は設定どおりのまま。ここで上書きしない)
        audio.muted = true;
        // 再生を試みる
        audio.play()
            .then(() => {
                // 再生終了後に停止してリセット
                audio.pause();
                audio.currentTime = 0; // 再生位置をリセット
            })
            .catch(error => {
                console.warn(`Failed to initialize ${audio.src}:`, error);
            });
    });

    // ミュート解除（すべての音声が停止してから）
    setTimeout(() => {
        audioFiles.forEach(audio => {
            audio.muted = false; // ミュート解除
        });
    }, 1000); // 必要に応じて調整
}

/**
 * システム音量スライダーのイベントリスナーを設定する
 * @param {HTMLInputElement} slider - システム音量スライダー要素
 */
export function setupSystemVolumeSlider(slider) {
    if (slider) {
        const handler = (event) => {
            const newVolume = parseFloat(event.target.value);
            if (chargeSound) chargeSound.volume = newVolume;
            if (moveSound) moveSound.volume = newVolume;
            if (highlightSound) highlightSound.volume = newVolume;
            if (AbilityStandby) AbilityStandby.volume = newVolume;
        };
        slider.addEventListener('input', handler);
        slider.addEventListener('change', handler); // iOS Safari対策
    } else {
        // 音量バーは「設定・プレイヤー情報」に移した(2026-10-12)ので、普段はバーが無い。保存済みの設定を使う
        [chargeSound, moveSound, highlightSound, AbilityStandby].forEach((a) => { a.volume = getSystemVolume(); });
    }
}
