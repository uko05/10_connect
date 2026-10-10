// designSettings.js — 「デザイン変更」タブの設定(石のデザイン・バトル中の背景)。2026-10-11追加
// 設定はこの端末に保存する(localStorage)。
//
// 石のデザイン: 自分の石だけに反映する(相手の石はいつもの色)。いずれガチャの景品にする予定で、
// 今はテストのため全部持っている扱いにしている(TEST_OWN_ALL_SKINS)。
// 元素・国のスキンは「石そのものをテーマ色にして白いマークを重ねる」デザイン(2026-10-10決定)。

const STONE_SKIN_KEY = 'connectStoneSkin';
const BATTLE_BG_KEY = 'connectBattleBg';

// テスト用: すべてのスキンを持っている扱いにする。ガチャを作ったら所持チェックに置き換える
export const TEST_OWN_ALL_SKINS = true;

const ICON_BASE = 'https://cdn.jsdelivr.net/gh/uko05/99_SharedImage@main/';

// group: 'basic' | 'element' | 'nation'
export const STONE_SKINS = [
    { id: 'go', group: 'basic', name: 'デフォルト', nameEn: 'Default' },
    { id: 'el_hi', group: 'element', name: '炎', nameEn: 'Pyro', color: '#e8452c', icon: '01_Genshin/Genso/hi.png' },
    { id: 'el_mizu', group: 'element', name: '水', nameEn: 'Hydro', color: '#2f8ff0', icon: '01_Genshin/Genso/mizu.png' },
    { id: 'el_kaze', group: 'element', name: '風', nameEn: 'Anemo', color: '#35c9a6', icon: '01_Genshin/Genso/kaze.png' },
    { id: 'el_kaminari', group: 'element', name: '雷', nameEn: 'Electro', color: '#a35be0', icon: '01_Genshin/Genso/kaminari.png' },
    { id: 'el_kusa', group: 'element', name: '草', nameEn: 'Dendro', color: '#7fc02a', icon: '01_Genshin/Genso/kusa.png' },
    { id: 'el_koori', group: 'element', name: '氷', nameEn: 'Cryo', color: '#6fcde6', icon: '01_Genshin/Genso/koori.png' },
    { id: 'el_iwa', group: 'element', name: '岩', nameEn: 'Geo', color: '#e0a52a', icon: '01_Genshin/Genso/iwa.png' },
    { id: 'na_mond', group: 'nation', name: 'モンド', nameEn: 'Mondstadt', color: '#3fb8a8', icon: '01_Genshin/country/Mondstadt.png' },
    { id: 'na_liyue', group: 'nation', name: '璃月', nameEn: 'Liyue', color: '#d9a12e', icon: '01_Genshin/country/Liyue.png' },
    { id: 'na_inazuma', group: 'nation', name: '稲妻', nameEn: 'Inazuma', color: '#8a52c8', icon: '01_Genshin/country/Inazuma.png' },
    { id: 'na_sumeru', group: 'nation', name: 'スメール', nameEn: 'Sumeru', color: '#5aa83a', icon: '01_Genshin/country/Sumeru.png' },
    { id: 'na_fontaine', group: 'nation', name: 'フォンテーヌ', nameEn: 'Fontaine', color: '#3a72d0', icon: '01_Genshin/country/Fontaine.png' },
    { id: 'na_natlan', group: 'nation', name: 'ナタ', nameEn: 'Natlan', color: '#e2632a', icon: '01_Genshin/country/Natlan.png' },
    { id: 'na_snezhnaya', group: 'nation', name: 'スネージナヤ', nameEn: 'Snezhnaya', color: '#8fb4d8', icon: '01_Genshin/country/Snezhnaya.png' },
    { id: 'na_nodkrai', group: 'nation', name: 'ナド・クライ', nameEn: 'Nod-Krai', color: '#4a5f8a', icon: '01_Genshin/country/NodKrai.png' },
];

export const STONE_SKIN_GROUPS = [
    { id: 'basic', name: '標準', nameEn: 'Standard' },
    { id: 'element', name: '原神の元素', nameEn: 'Genshin elements' },
    { id: 'nation', name: '原神の国', nameEn: 'Genshin nations' },
];

export function ownsStoneSkin(skinId) {
    return skinId === 'go' || TEST_OWN_ALL_SKINS;
}

export function getStoneSkinId() {
    try {
        const id = localStorage.getItem(STONE_SKIN_KEY) || 'go';
        return STONE_SKINS.some((s) => s.id === id) && ownsStoneSkin(id) ? id : 'go';
    } catch (e) { return 'go'; }
}

export function setStoneSkinId(id) {
    try { localStorage.setItem(STONE_SKIN_KEY, id || 'go'); } catch (e) { /* 保存できなくても続ける */ }
}

export function skinIconUrl(skin) {
    return skin?.icon ? ICON_BASE + skin.icon : '';
}

// 盤面に描く用のマーク画像(白く塗ったもの)。読み込みが終わるまではマーク無しで描かれる
const tintedIconCache = new Map(); // skinId -> canvas(白) | 'loading'
function tintedIcon(skin, color) {
    const key = `${skin.id}|${color}`;
    const cached = tintedIconCache.get(key);
    if (cached && cached !== 'loading') return cached;
    if (!cached) {
        tintedIconCache.set(key, 'loading');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const x = c.getContext('2d');
            x.drawImage(img, 0, 0, 128, 128);
            x.globalCompositeOperation = 'source-in';
            x.fillStyle = color;
            x.fillRect(0, 0, 128, 128);
            tintedIconCache.set(key, c);
        };
        img.onerror = () => tintedIconCache.delete(key);
        img.src = skinIconUrl(skin);
    }
    return null;
}

// スキンIDから石のスキンを返す(デフォルト・不明ならnull)。マーク画像を先読みしておく
export function getStoneSkinById(id) {
    const skin = STONE_SKINS.find((s) => s.id === id);
    if (!skin || skin.id === 'go') return null;
    tintedIcon(skin, '#ffffff');
    tintedIcon(skin, 'rgba(0, 0, 0, 0.25)');
    return skin;
}

// 自分が選んでいる石のスキン(標準ならnull)
export function getMyStoneSkin() {
    return getStoneSkinById(getStoneSkinId());
}

// 相手の石のスキンを表示するか(2026-10-11)。設定で「相手の石をデフォルトで表示する」にチェックした人は表示しない
const HIDE_OPP_SKIN_KEY = 'connectHideOppSkin';
export function getHideOpponentSkin() {
    try { return localStorage.getItem(HIDE_OPP_SKIN_KEY) === 'true'; } catch (e) { return false; }
}
export function setHideOpponentSkin(hide) {
    try { localStorage.setItem(HIDE_OPP_SKIN_KEY, hide ? 'true' : 'false'); } catch (e) { /* 保存できなくても続ける */ }
}

// 相手が選んでいるスキンID(対戦部屋の player1_StoneSkin / player2_StoneSkin)から、表示する相手のスキンを返す
export function getOpponentStoneSkin(skinId) {
    if (getHideOpponentSkin()) return null;
    return getStoneSkinById(skinId);
}

// renderer.js の drawStoneAt から呼ぶ: 石の上に白いマーク(うっすら影付き)を重ねる
export function drawSkinMark(ctx, cx, cy, R, skin) {
    const white = tintedIcon(skin, '#ffffff');
    const shadow = tintedIcon(skin, 'rgba(0, 0, 0, 0.25)');
    if (!white) return;
    const s = R * 1.1;
    if (shadow) ctx.drawImage(shadow, cx - s / 2 + 1, cy - s / 2 + 1.5 - R * 0.03, s, s);
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(white, cx - s / 2, cy - s / 2 - R * 0.03, s, s);
    ctx.restore();
}

// ===== バトル中の背景 =====
// 画像は public/scripts/wallpaper/battleback_001.jpg 〜 battleback_XXX.jpg(連番・JPG、1920×1080)。
// 選択肢には名前を出さず画像だけ見せる。設定画面の一覧には軽いサムネイル(wallpaper/thumb/同じファイル名、384×216)を使う。
// 背景を増やしたら、画像とサムネイルを置いて BATTLE_BG_COUNT を増やす。
const BATTLE_BG_COUNT = 39;
export const BATTLE_BACKGROUNDS = Array.from({ length: BATTLE_BG_COUNT }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    return {
        id: i === 0 ? 'default' : `bb${num}`, // 001は最初からある標準の背景
        file: `public/scripts/wallpaper/battleback_${num}.jpg`,
        thumb: `public/scripts/wallpaper/thumb/battleback_${num}.jpg`,
    };
});

export function getBattleBgId() {
    try {
        const id = localStorage.getItem(BATTLE_BG_KEY) || 'default';
        return BATTLE_BACKGROUNDS.some((b) => b.id === id) ? id : 'default';
    } catch (e) { return 'default'; }
}

export function setBattleBgId(id) {
    try { localStorage.setItem(BATTLE_BG_KEY, id || 'default'); } catch (e) { /* 保存できなくても続ける */ }
}

// すべての画面(トップ・キャラ選択・プレイヤー情報・CPU対戦・マッチング対戦)で呼ぶ: 選んだ背景にする。
// 2026-10-11: バトル中だけでなく全画面の背景に変更。設定画面で選んだ瞬間にも呼んで、その場で切り替える
export function applyBattleBackground() {
    const id = getBattleBgId();
    const bg = BATTLE_BACKGROUNDS.find((b) => b.id === id);
    // 標準(001)はCSSの背景のままにする(インラインの指定を外す)
    document.body.style.backgroundImage = bg && id !== 'default' ? `url('${bg.file}')` : '';
}
