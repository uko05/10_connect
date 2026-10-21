// challengeManager.js — ソロモードの挑戦モード(2026-10-22)。キャラ選択画面(characterSelect.js)とソロ画面(soloLogic.js)で使う
//
//   連勝の挑戦 streak : 自分で選んだキャラで、No.001〜016の16キャラ(順番はランダム)にHARDで連勝する → 018 解放
//   万象の挑戦 all    : 自分も相手もランダム(被りなし・同じキャラ同士の対戦なし)で16試合。最後には全キャラを使い、全キャラと戦う → 019 解放
//   逆転の挑戦 reverse: 毎試合ランダムに選ばれたキャラで、BAKATAREの020に3連勝する → 020 解放
//
// どの挑戦も3本先取。1回でも負けたら最初から。試合の合間に中断できる(進み具合はサーバーの connectUsers.challengeProgress に保存)。
// 試合の途中で画面を閉じた場合は負け扱い(負けそうな試合を抜けてやり直すのを防ぐため。試合開始時に playing: true を書き、
// 結果が出たら外す。次にキャラ選択画面を開いた時に playing が残っていたら失敗として最初からにする)。
// 挑戦できる条件: 連勝・万象は No.001〜016 をすべて解放済み、逆転は 020 以外の19キャラをすべて解放済み。
import { db } from './firebaseConfig.js';
import { doc, getDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { characterData } from './characterData.js';
import { getCurrentLang } from './i18n.js';

export const CHALLENGE_MODES = ['streak', 'all', 'reverse'];
export const BASE_IDS = characterData.map((c) => c.charaID).filter((id) => id >= '001' && id <= '016');
export const BOSS_ID = '020';
export const REVERSE_WINS = 3;

export const CHALLENGE_INFO = {
    streak: {
        difficulty: 'hard',
        ja: { name: '連勝の挑戦', desc: '自分で選んだキャラで、No.001〜016の16キャラ（順番はランダム）に連続で勝利する。難易度はHARD、各試合3本先取。1回でも負けると最初からやり直し。試合の合間なら中断できる（試合の途中で抜けると負け扱い）。クリアすると新しいキャラが解放される。', need: 'No.001〜016のキャラをすべて解放すると挑戦できます' },
        en: { name: 'Winning Streak', desc: 'With a character of your choice, defeat all 16 characters No.001–016 in a row (random order). HARD difficulty, best of 5 rounds (first to 3). One loss and you start over. You can take a break between matches (leaving mid-match counts as a loss). Clearing it unlocks a new character.', need: 'Unlock all characters No.001–016 to try this.' },
    },
    all: {
        difficulty: 'hard',
        ja: { name: '万象の挑戦', desc: '自分のキャラも相手のキャラも毎試合ランダム（同じキャラは二度出ず、同じキャラ同士の対戦もなし）。16試合で、No.001〜016の全キャラを使い、全キャラと戦う。難易度はHARD、各試合3本先取。1回でも負けると最初からやり直し。試合の合間なら中断できる（試合の途中で抜けると負け扱い）。クリアすると新しいキャラが解放される。', need: 'No.001〜016のキャラをすべて解放すると挑戦できます' },
        en: { name: 'All Things', desc: 'Both your character and your opponent are random each match (no repeats, no mirror matches). Over 16 matches you play as every character No.001–016 and face every one of them. HARD difficulty, first to 3 rounds. One loss and you start over. You can take a break between matches (leaving mid-match counts as a loss). Clearing it unlocks a new character.', need: 'Unlock all characters No.001–016 to try this.' },
    },
    reverse: {
        difficulty: 'bakatare',
        ja: { name: '逆転の挑戦', desc: '毎試合ランダムに選ばれたキャラで、BAKATARE難易度の最後のキャラに3連勝する。各試合3本先取。1回でも負けると最初からやり直し。試合の合間なら中断できる（試合の途中で抜けると負け扱い）。クリアすると最後のキャラが解放される。', need: '他の19キャラをすべて解放すると挑戦できます' },
        en: { name: 'Reversal', desc: 'With a randomly chosen character each match, win 3 times in a row against the final character on BAKATARE difficulty. First to 3 rounds per match. One loss and you start over. You can take a break between matches (leaving mid-match counts as a loss). Clearing it unlocks the final character.', need: 'Unlock the other 19 characters to try this.' },
    },
};
export const challengeText = (mode) => CHALLENGE_INFO[mode][getCurrentLang() === 'en' ? 'en' : 'ja'];

// クリアで付くアチーブメント(achStats のフラグ)。achievements.js / characterData.js の requiredAchievementId と対応
export const CLEAR_STAT = { streak: 'challengeStreakClear', all: 'challengeAllClear', reverse: 'challengeReverseClear' };

// 挑戦できるか。isUnlocked(chara) はそのキャラを使えるか
export function canChallenge(mode, isUnlocked) {
    if (mode === 'reverse') return characterData.filter((c) => c.charaID !== BOSS_ID).every(isUnlocked);
    return characterData.filter((c) => BASE_IDS.includes(c.charaID)).every(isUnlocked);
}

const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 万象の挑戦の組み合わせ: 自分側も相手側も16キャラを1回ずつ。同じキャラ同士にならないよう並べる(完全順列)
export function makeAllPairs() {
    const mine = shuffle(BASE_IDS);
    let opp;
    do { opp = shuffle(BASE_IDS); } while (opp.some((id, i) => id === mine[i]));
    return mine.map((m, i) => [m, opp[i]]);
}

// 逆転の挑戦: 自分のキャラは020以外からランダム
export function randomReverseChara() {
    const pool = characterData.filter((c) => c.charaID !== BOSS_ID).map((c) => c.charaID);
    return pool[Math.floor(Math.random() * pool.length)];
}

export async function loadProgress(uid) {
    if (!uid) return {};
    const snap = await getDoc(doc(db, 'connectUsers', uid));
    return (snap.exists() && snap.data().challengeProgress) || {};
}
export async function saveProgress(uid, mode, data) {
    await updateDoc(doc(db, 'connectUsers', uid), { [`challengeProgress.${mode}`]: data ?? deleteField() });
}

// 次の試合の組み合わせ(自分・相手・難易度)。progress が無ければ新しく作る
export function nextMatch(mode, progress, chosenChara) {
    if (mode === 'streak') {
        const p = progress || { chara: chosenChara, order: shuffle(BASE_IDS), index: 0 };
        return { progress: p, player: p.chara, cpu: p.order[p.index], total: p.order.length, done: p.index };
    }
    if (mode === 'all') {
        const p = progress || { pairs: makeAllPairs(), index: 0 };
        const [player, cpu] = p.pairs[p.index];
        return { progress: p, player, cpu, total: p.pairs.length, done: p.index };
    }
    const p = progress || { wins: 0 };
    // 試合ごとにランダム。開始前に決めて保存しておく(画面を開き直して引き直せないように)
    if (!p.chara) p.chara = randomReverseChara();
    return { progress: p, player: p.chara, cpu: BOSS_ID, total: REVERSE_WINS, done: p.wins };
}

// 試合に勝った後の進み具合。戻り値 { progress, cleared }
export function afterWin(mode, p) {
    if (mode === 'reverse') {
        const wins = (p.wins || 0) + 1;
        return wins >= REVERSE_WINS ? { progress: null, cleared: true } : { progress: { wins, chara: randomReverseChara(), playing: false }, cleared: false };
    }
    const index = p.index + 1;
    const total = mode === 'streak' ? p.order.length : p.pairs.length;
    return index >= total ? { progress: null, cleared: true } : { progress: { ...p, index, playing: false }, cleared: false };
}

// ソロ画面に渡す挑戦の情報(sessionStorage)
const SS_KEY = 'soloChallenge';
export function setSoloChallenge(info) { sessionStorage.setItem(SS_KEY, JSON.stringify(info)); }
export function getSoloChallenge() { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch { return null; } }
export function clearSoloChallenge() { sessionStorage.removeItem(SS_KEY); }
