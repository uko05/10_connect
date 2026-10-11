// hubHero.js — トップ画面(ハブ)の左に出すキャラの設定(2026-10-11追加)
// 「ランダム」か「固定(1人・1枚)」をこの端末に保存する(localStorage)。
// 候補は通常キャラ+解放済みの隠しキャラ(未解放の隠しキャラは、ネタバレになるので出さない)+
// 原神おみくじの裏面(同じ裏面を10枚持ったことがあるもの)。
//
// 裏面の解放(2026-10-11決定):
// - 同じ裏面を10枚持った時点で解放。オークションで買った分も数える。
// - 一度解放したら、売って枚数が減ってもずっと使える(connectUsers.hubArtUnlocked に記録)。
// - 解放した裏面はランダムの候補にも入る。固定にも条件なしで選べる(キャラの「5勝」条件はキャラだけ)。
import { characterData } from './characterData.js';
import { db, getSharedUserId } from './firebaseConfig.js';
import { doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ALL_CARD_DESIGNS } from 'https://uko05.github.io/14_GenshinOmikuji/gachaBacks.js';

const HUB_HERO_KEY = 'connectHubHero';
// 1人に固定できるのは、そのキャラでランク戦にこの回数以上勝ったキャラだけ(2026-10-11)
export const HERO_FIXED_MIN_WINS = 5;
// 同じ裏面をこの枚数持ったら、トップ画面に使えるようになる
export const CARD_UNLOCK_COPIES = 10;
const CARD_PREFIX = 'card:';
const CARD_BY_ID = new Map(ALL_CARD_DESIGNS.map((d) => [d.id, d]));

// そのキャラでのランク戦の勝利数(connectUsers.charaWins、サーバーが記録)
export function heroWins(userData, charaID) {
    return (userData?.charaWins || {})[charaID] || 0;
}

// 固定にできるか(裏面は解放済みなら条件なし。キャラはランク戦5勝以上)
export function canFixHero(userData, heroId) {
    if (String(heroId).startsWith(CARD_PREFIX)) return true;
    return heroWins(userData, heroId) >= HERO_FIXED_MIN_WINS;
}

export function getHubHeroSetting() {
    try { return localStorage.getItem(HUB_HERO_KEY) || 'random'; } catch (e) { return 'random'; }
}

export function setHubHeroSetting(value) {
    try { localStorage.setItem(HUB_HERO_KEY, value || 'random'); } catch (e) { /* 保存できなくても動作は続ける */ }
}

// userData: connectUsers/{uid}(未取得ならnull。その場合は隠しキャラ・裏面を候補に入れない)
// 戻り値の要素: { charaID(候補のID), src, name, kind: 'chara' | 'card' }
export function heroCandidates(userData) {
    const unlocked = userData?.unlockedHiddenCharas || {};
    const achs = new Set(userData?.achievements || []);
    const charas = characterData
        .filter((c) => c.src && (!c.requiredAchievementId || unlocked[c.charaID] || achs.has(c.requiredAchievementId)))
        .map((c) => ({ ...c, kind: 'chara' }));
    const cards = (userData?.hubArtUnlocked || [])
        .map((id) => CARD_BY_ID.get(id))
        .filter(Boolean)
        .map((d) => ({ charaID: CARD_PREFIX + d.id, src: d.url, name: d.name, kind: 'card' }));
    return [...charas, ...cards];
}

// 設定に従って1つ選ぶ。固定にしたものが候補に無い(未解放など)か、条件を満たしていないときはランダムにする
export function pickHubHero(userData) {
    const pool = heroCandidates(userData);
    const setting = getHubHeroSetting();
    if (setting !== 'random') {
        const fixed = pool.find((c) => c.charaID === setting);
        if (fixed && canFixHero(userData, fixed.charaID)) return fixed;
    }
    return pool[Math.floor(Math.random() * pool.length)] || null;
}

// 原神おみくじの裏面の枚数を見て、10枚以上の裏面を解放済みに追加する(一度解放したらずっと使える)。
// connectUsers(自分のuid)の hubArtUnlocked を更新し、更新後の userData を返す。
export async function syncHubArtUnlocks(uid, userData) {
    // connectUsers に共有IDがまだ書かれていない(初回)こともあるので、この端末の共有IDも使う
    const sharedUserId = userData?.sharedUserId || getSharedUserId();
    if (!uid || !sharedUserId || !userData) return userData;
    try {
        const snap = await getDoc(doc(db, 'omikujiUsers', sharedUserId));
        const cardBacks = snap.exists() ? (snap.data().cardBacks || {}) : {};
        const have = new Set(userData.hubArtUnlocked || []);
        const add = Object.entries(cardBacks)
            .filter(([id, n]) => (n || 0) >= CARD_UNLOCK_COPIES && CARD_BY_ID.has(id) && !have.has(id))
            .map(([id]) => id);
        if (!add.length) return userData;
        await updateDoc(doc(db, 'connectUsers', uid), { hubArtUnlocked: arrayUnion(...add) });
        return { ...userData, hubArtUnlocked: [...have, ...add] };
    } catch (e) {
        console.warn('[hubHero] card unlock sync failed', e);
        return userData;
    }
}

// 裏面の外側の明るさ(0〜1)から、端を暗くする強さを決める(明るい裏面ほど強く。暗い裏面は0)
export function cardEdgeDarkness(img) {
    try {
        const c = document.createElement('canvas');
        c.width = 40; c.height = 68;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 40, 68);
        const d = x.getImageData(0, 0, 40, 68).data;
        let s = 0, k = 0;
        for (let y = 0; y < 68; y++) {
            for (let xx = 0; xx < 40; xx++) {
                if (xx > 9 && xx < 30 && y > 16 && y < 51) continue; // 中央(キャラのあたり)は数えない
                const i = (y * 40 + xx) * 4;
                s += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
                k++;
            }
        }
        return Math.max(0, Math.min(0.6, (s / k - 0.4) * 1.3));
    } catch (e) {
        return 0; // 画像が読めない(CORSなど)時は暗くしない
    }
}
