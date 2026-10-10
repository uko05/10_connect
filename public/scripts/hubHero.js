// hubHero.js — トップ画面(ハブ)の左に出すキャラの設定(2026-10-11追加)
// 「ランダム」か「固定(キャラ1人)」をこの端末に保存する(localStorage)。
// 候補は通常キャラ+解放済みの隠しキャラ(未解放の隠しキャラは、ネタバレになるので出さない)。
// 将来ガチャなどで表示できるイラストを増やす場合は、heroCandidates() に候補を足せばよい。
import { characterData } from './characterData.js';

const HUB_HERO_KEY = 'connectHubHero';
// 1人に固定できるのは、そのキャラでランク戦にこの回数以上勝ったキャラだけ(2026-10-11)
export const HERO_FIXED_MIN_WINS = 5;

// そのキャラでのランク戦の勝利数(connectUsers.charaWins、サーバーが記録)
export function heroWins(userData, charaID) {
    return (userData?.charaWins || {})[charaID] || 0;
}

export function canFixHero(userData, charaID) {
    return heroWins(userData, charaID) >= HERO_FIXED_MIN_WINS;
}

export function getHubHeroSetting() {
    try { return localStorage.getItem(HUB_HERO_KEY) || 'random'; } catch (e) { return 'random'; }
}

export function setHubHeroSetting(value) {
    try { localStorage.setItem(HUB_HERO_KEY, value || 'random'); } catch (e) { /* 保存できなくても動作は続ける */ }
}

// userData: connectUsers/{uid}(未取得ならnull。その場合は隠しキャラを候補に入れない)
export function heroCandidates(userData) {
    const unlocked = userData?.unlockedHiddenCharas || {};
    const achs = new Set(userData?.achievements || []);
    return characterData.filter((c) => c.src
        && (!c.requiredAchievementId || unlocked[c.charaID] || achs.has(c.requiredAchievementId)));
}

// 設定に従って1人選ぶ。固定にしたキャラが候補に無い(未解放など)か、条件(5勝)を満たしていないときはランダムにする
export function pickHubHero(userData) {
    const pool = heroCandidates(userData);
    const setting = getHubHeroSetting();
    if (setting !== 'random') {
        const fixed = pool.find((c) => c.charaID === setting);
        if (fixed && canFixHero(userData, fixed.charaID)) return fixed;
    }
    return pool[Math.floor(Math.random() * pool.length)] || null;
}
