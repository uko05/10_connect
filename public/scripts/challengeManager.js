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

// 説明文は (i) のポップアップに出す。\n は改行(CSS の white-space: pre-line で表示)。
// 一般の人に「No.001〜016」は伝わらないので「キャラ選択画面の最初の16人」と書く(2026-10-22)
export const CHALLENGE_INFO = {
    streak: {
        difficulty: 'hard',
        ja: {
            name: '連勝の挑戦',
            desc: '自分で選んだキャラで、16人の相手に続けて勝つ挑戦です。\n\n・相手：キャラ選択画面の最初の16人（順番はランダム）\n・難易度：HARD／各試合3本先取\n・1回でも負けると最初からやり直し\n・試合と試合の間なら中断できます（試合の途中で抜けると負け扱い）\n・クリアすると新しいキャラが解放されます',
            need: 'キャラ選択画面の最初の16人をすべて解放すると挑戦できます',
        },
        en: {
            name: 'Winning Streak',
            desc: 'Win 16 matches in a row with a character of your choice.\n\n- Opponents: the first 16 characters on the character select screen (random order)\n- Difficulty: HARD / first to 3 rounds\n- One loss and you start over\n- You can take a break between matches (leaving mid-match counts as a loss)\n- Clearing it unlocks a new character',
            need: 'Unlock the first 16 characters on the select screen to try this.',
        },
    },
    all: {
        difficulty: 'hard',
        ja: {
            name: '万象の挑戦',
            desc: '自分のキャラも相手のキャラも、毎試合ランダムで決まる挑戦です。\n\n・16試合で、キャラ選択画面の最初の16人を全員1回ずつ使い、全員と1回ずつ戦います\n・同じキャラ同士の対戦はありません\n・難易度：HARD／各試合3本先取\n・1回でも負けると最初からやり直し\n・試合と試合の間なら中断できます（試合の途中で抜けると負け扱い）\n・クリアすると新しいキャラが解放されます',
            need: 'キャラ選択画面の最初の16人をすべて解放すると挑戦できます',
        },
        en: {
            name: 'All Things',
            desc: 'Both your character and your opponent are chosen at random every match.\n\n- Over 16 matches you play as each of the first 16 characters once and face each of them once\n- No mirror matches\n- Difficulty: HARD / first to 3 rounds\n- One loss and you start over\n- You can take a break between matches (leaving mid-match counts as a loss)\n- Clearing it unlocks a new character',
            need: 'Unlock the first 16 characters on the select screen to try this.',
        },
    },
    reverse: {
        difficulty: 'bakatare',
        ja: {
            name: '逆転の挑戦',
            desc: '毎試合ランダムに選ばれるキャラで、最後のキャラに3回続けて勝つ挑戦です。\n\n・相手：最後のキャラ（難易度BAKATARE）\n・自分のキャラ：毎試合ランダム\n・各試合3本先取\n・1回でも負けると最初からやり直し\n・試合と試合の間なら中断できます（試合の途中で抜けると負け扱い）\n・クリアすると最後のキャラが解放されます',
            need: '最後のキャラ以外をすべて解放すると挑戦できます',
        },
        en: {
            name: 'Reversal',
            desc: 'Beat the final character 3 times in a row, with a randomly chosen character each match.\n\n- Opponent: the final character (BAKATARE difficulty)\n- Your character: random every match\n- First to 3 rounds per match\n- One loss and you start over\n- You can take a break between matches (leaving mid-match counts as a loss)\n- Clearing it unlocks the final character',
            need: 'Unlock every character except the final one to try this.',
        },
    },
};
export const challengeText = (mode) => CHALLENGE_INFO[mode][getCurrentLang() === 'en' ? 'en' : 'ja'];

// クリアで付くアチーブメント(achStats のフラグ)。achievements.js / characterData.js の requiredAchievementId と対応
export const CLEAR_STAT = { streak: 'challengeStreakClear', all: 'challengeAllClear', reverse: 'challengeReverseClear' };

// 挑戦できるか。isUnlocked(chara) はそのキャラを使えるか
export function canChallenge(mode, isUnlocked) {
    // UP交換所で解放するキャラ(requiredUpPerk)は条件に含めない(UPを使わないと挑戦できない、にはしない)
    if (mode === 'reverse') return characterData.filter((c) => c.charaID !== BOSS_ID && !c.requiredUpPerk).every(isUnlocked);
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
    const pool = characterData.filter((c) => c.charaID !== BOSS_ID && !c.requiredUpPerk).map((c) => c.charaID);
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
