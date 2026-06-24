// settingsManager.js - 石カラー・必殺技演出強度などのユーザー設定を管理する共通モジュール
// localStorageに保存し、ハブ(index.html)・キャラ選択(select.html)・バトル(battle.html)など各画面から利用する

const STORAGE_KEY = "gameSettings";

export const STONE_COLOR_PRESETS = [
    { id: "classic", label: "クラシック", red: "#ff0000", yellow: "#ffff00" },
    { id: "colorsafeA", label: "カラーセーフ(青/オレンジ)", red: "#0072B2", yellow: "#E69F00" },
    { id: "colorsafeB", label: "カラーセーフ(緑/紫)", red: "#009E73", yellow: "#CC79A7" },
];

export const ULT_INTENSITY_LEVELS = [
    { id: "strong", label: "強(おすすめ)" },
    { id: "weak", label: "弱(控えめ)" },
    { id: "off", label: "なし" },
];

// ソロモード(CPU対戦)の難易度。depthはミニマックス探索の先読み手数
export const CPU_DIFFICULTY_LEVELS = [
    { id: "easy", label: "EASY", depth: 1 },
    { id: "normal", label: "NORMAL", depth: 3 },
    { id: "hard", label: "HARD", depth: 6 },
    { id: "bakatare", label: "BAKATARE", depth: 10 },
];

export const CLICK_MODE_OPTIONS = [
    { id: "single", label: "1クリックで石を落とす" },
    { id: "double", label: "2クリックで石を落とす（列選択→確定）" },
];

const DEFAULT_SETTINGS = {
    stoneColorPreset: "classic",
    ultIntensity: "strong",
    cpuDifficulty: "normal",
    clickMode: "single",
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
        console.warn("[settings] 設定の読み込みに失敗、デフォルトを使用:", e);
        return { ...DEFAULT_SETTINGS };
    }
}

let currentSettings = loadSettings();

function persist() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    } catch (e) {
        console.warn("[settings] 設定の保存に失敗:", e);
    }
}

export function getSettings() {
    return { ...currentSettings };
}

export function setStoneColorPreset(presetId) {
    if (!STONE_COLOR_PRESETS.some(p => p.id === presetId)) return;
    currentSettings.stoneColorPreset = presetId;
    persist();
}

export function setUltIntensity(level) {
    if (!ULT_INTENSITY_LEVELS.some(l => l.id === level)) return;
    currentSettings.ultIntensity = level;
    persist();
}

export function setCpuDifficulty(difficultyId) {
    if (!CPU_DIFFICULTY_LEVELS.some(d => d.id === difficultyId)) return;
    currentSettings.cpuDifficulty = difficultyId;
    persist();
}

export function getCpuDifficulty() {
    return currentSettings.cpuDifficulty;
}

// 現在の難易度設定に対応するミニマックス探索の深さを返す
export function getCpuSearchDepth() {
    const level = CPU_DIFFICULTY_LEVELS.find(d => d.id === currentSettings.cpuDifficulty);
    return (level || CPU_DIFFICULTY_LEVELS[1]).depth;
}

function getActivePreset() {
    return STONE_COLOR_PRESETS.find(p => p.id === currentSettings.stoneColorPreset) || STONE_COLOR_PRESETS[0];
}

/**
 * 石の役割名('red'|'yellow')から、現在の設定における実際の表示色(hex)を返す
 * @param {string} role - 'red' または 'yellow'（ゲームロジック上の色の役割。データ構造は変更しない）
 */
export function getDisplayColor(role) {
    const preset = getActivePreset();
    if (role === "red") return preset.red;
    if (role === "yellow") return preset.yellow;
    return role; // 想定外の値が来た場合はそのまま返す
}

export function getUltIntensity() {
    return currentSettings.ultIntensity;
}

export function setClickMode(id) {
    if (!CLICK_MODE_OPTIONS.some(o => o.id === id)) return;
    currentSettings.clickMode = id;
    persist();
}

export function getClickMode() {
    return currentSettings.clickMode;
}

/**
 * 設定モーダル内のUI(色スウォッチ・演出強度ラジオ)を現在の設定値で初期化し、
 * クリック/変更イベントをバインドする。
 * @param {Document|HTMLElement} root - モーダルのルート要素（document可）
 * @param {function} [onColorChange] - 石カラー変更時に呼ばれるコールバック（再描画用）
 */
export function bindSettingsUI(root, onColorChange) {
    // 色スウォッチ
    const swatchButtons = root.querySelectorAll(".color-swatch");
    swatchButtons.forEach(btn => {
        const presetId = btn.getAttribute("data-preset-id");
        btn.classList.toggle("selected", presetId === currentSettings.stoneColorPreset);
        btn.addEventListener("click", () => {
            setStoneColorPreset(presetId);
            swatchButtons.forEach(b => b.classList.toggle("selected", b === btn));
            if (onColorChange) onColorChange();
        });
    });

    // 必殺技演出強度
    const intensityRadios = root.querySelectorAll('input[name="ultIntensity"]');
    intensityRadios.forEach(radio => {
        radio.checked = radio.value === currentSettings.ultIntensity;
        radio.addEventListener("change", () => {
            if (radio.checked) setUltIntensity(radio.value);
        });
    });

    // クリック操作モード
    const clickModeRadios = root.querySelectorAll('input[name="clickMode"]');
    clickModeRadios.forEach(radio => {
        radio.checked = radio.value === currentSettings.clickMode;
        radio.addEventListener("change", () => {
            if (radio.checked) setClickMode(radio.value);
        });
    });
}

/**
 * 設定ボタン/モーダルの開閉イベントを設定する（ヘルプモーダルと同じ開閉パターン）
 * @param {string} buttonId
 * @param {string} modalId
 */
export function setupSettingsModal(buttonId, modalId) {
    const button = document.getElementById(buttonId);
    const modal = document.getElementById(modalId);
    if (!button || !modal) return;

    const closeButton = modal.querySelector(".close");

    button.addEventListener("click", () => {
        modal.style.display = "block";
    });
    if (closeButton) {
        closeButton.addEventListener("click", () => {
            modal.style.display = "none";
        });
    }
    window.addEventListener("click", (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });
}
