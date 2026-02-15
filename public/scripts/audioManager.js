// audioManager.js - システムSEの生成・初期化・音量制御

// システムSE
export const chargeSound = new Audio('public/scripts/sound/charge.mp3');
chargeSound.volume = 0.2;

export const moveSound = new Audio('public/scripts/sound/moveSound.wav');
moveSound.volume = 0.2;

export const highlightSound = new Audio('public/scripts/sound/stone_highlight.wav');
highlightSound.volume = 0.2;

export const AbilityStandby = new Audio('public/scripts/sound/AbilityStandby.mp3');
AbilityStandby.volume = 0.2;

/**
 * 初回クリック時に音声再生を初期化する（ブラウザの自動再生制限対策）
 * @param {Audio[]} voiceAudios - キャラボイス系Audioの配列 [pLeft_Attack, pRight_Attack, pLeft_ult, pRight_ult]
 */
export function initializeAudioPlayback(voiceAudios) {
    const audioFiles = [...voiceAudios, chargeSound];

    audioFiles.forEach(audio => {
        // 再生前にミュートを設定
        audio.volume = 0.2;
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
        slider.addEventListener('input', (event) => {
            const newVolume = parseFloat(event.target.value); // 数値として取得
            if (chargeSound) chargeSound.volume = newVolume; // 音量を更新
            if (moveSound) moveSound.volume = newVolume; // 音量を更新
            if (highlightSound) highlightSound.volume = newVolume; // 音量を更新
            if (AbilityStandby) AbilityStandby.volume = newVolume; // 音量を更新
        });
    } else {
        console.error("systemvolumeSlider が見つかりません");
    }
}
