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

// group: 'basic' | 'element' | 'nation' | 'srElement'
export const STONE_SKINS = [
    { id: 'go', group: 'basic', name: '標準（碁石風）', nameEn: 'Standard' },
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
    { id: 'sr_butsuri', group: 'srElement', name: '物理', nameEn: 'Physical', color: '#9aa0a8', icon: '02_Starrail/Genso/butsuri.png' },
    { id: 'sr_hi', group: 'srElement', name: '炎', nameEn: 'Fire', color: '#e8452c', icon: '02_Starrail/Genso/hi.png' },
    { id: 'sr_koori', group: 'srElement', name: '氷', nameEn: 'Ice', color: '#6fcde6', icon: '02_Starrail/Genso/koori.png' },
    { id: 'sr_kaminari', group: 'srElement', name: '雷', nameEn: 'Lightning', color: '#a35be0', icon: '02_Starrail/Genso/kaminari.png' },
    { id: 'sr_kaze', group: 'srElement', name: '風', nameEn: 'Wind', color: '#35c9a6', icon: '02_Starrail/Genso/kaze.png' },
    { id: 'sr_ryoushi', group: 'srElement', name: '量子', nameEn: 'Quantum', color: '#5a50c8', icon: '02_Starrail/Genso/ryoushi.png' },
    { id: 'sr_kyosuu', group: 'srElement', name: '虚数', nameEn: 'Imaginary', color: '#e6c32a', icon: '02_Starrail/Genso/kyosuu.png' },
];

export const STONE_SKIN_GROUPS = [
    { id: 'basic', name: '標準', nameEn: 'Standard' },
    { id: 'element', name: '原神の元素', nameEn: 'Genshin elements' },
    { id: 'nation', name: '原神の国', nameEn: 'Genshin nations' },
    { id: 'srElement', name: 'スタレの属性', nameEn: 'Star Rail types' },
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

// 自分が選んでいる石のスキン(標準ならnull)。ページを開いた時にマーク画像を先読みしておく
export function getMyStoneSkin() {
    const skin = STONE_SKINS.find((s) => s.id === getStoneSkinId());
    if (!skin || skin.id === 'go') return null;
    tintedIcon(skin, '#ffffff');
    tintedIcon(skin, 'rgba(0, 0, 0, 0.25)');
    return skin;
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
// 今は標準の1枚だけ。画像を用意したらここに足す(file: public/scripts/wallpaper/ 配下)
export const BATTLE_BACKGROUNDS = [
    { id: 'default', name: '標準（館の広間）', nameEn: 'Standard (Hall)', file: 'public/scripts/wallpaper/battleback001.png' },
];

export function getBattleBgId() {
    try {
        const id = localStorage.getItem(BATTLE_BG_KEY) || 'default';
        return BATTLE_BACKGROUNDS.some((b) => b.id === id) ? id : 'default';
    } catch (e) { return 'default'; }
}

export function setBattleBgId(id) {
    try { localStorage.setItem(BATTLE_BG_KEY, id || 'default'); } catch (e) { /* 保存できなくても続ける */ }
}

// バトル画面(solo.html / battle.html)で呼ぶ: 標準以外を選んでいたら背景を差し替える
export function applyBattleBackground() {
    const id = getBattleBgId();
    if (id === 'default') return;
    const bg = BATTLE_BACKGROUNDS.find((b) => b.id === id);
    if (bg) document.body.style.backgroundImage = `url('${bg.file}')`;
}
