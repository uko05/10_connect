// achievementManager.js - users/{uid} の実績データ（achievements/achievementCount/achStats）の読み書きと判定
// rating/charaWins には一切触れない（ソロモードの判定もここに限定し、レート・キャラ別勝利数とは完全に分離する）
import { db } from './firebaseConfig.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ALL_ACHIEVEMENTS } from './achievements.js';

const ACH_STATS_DEFAULTS = {
    soloWins: { easy: false, normal: false, hard: false, bakatare: false },
    soloBakatareWins: {}, // charaID -> true
    maxRatingReached: 1500,
    ultUsedTotal: 0,
    hadSealWin: false,
    hadDoubleUltWin: false,
    hadStraightWin: false,
    hadCleanWin: false,
    hadComebackWin: false,
};

function loadAchStats(achStats) {
    return {
        ...ACH_STATS_DEFAULTS,
        ...(achStats || {}),
        soloWins: { ...ACH_STATS_DEFAULTS.soloWins, ...(achStats?.soloWins || {}) },
        soloBakatareWins: { ...(achStats?.soloBakatareWins || {}) },
    };
}

// achievements.js の check()/progress() に渡す判定用コンテキストを組み立てる
function buildContext(userData) {
    return {
        winCount: userData.winCount || 0,
        ...loadAchStats(userData.achStats),
    };
}

function findNewlyUnlocked(ctx, unlockedIds) {
    const unlockedSet = new Set(unlockedIds || []);
    return ALL_ACHIEVEMENTS.filter((ach) => !unlockedSet.has(ach.id) && ach.check(ctx)).map((ach) => ach.id);
}

// users/{uid} を読み、patchFn(currentStats) が返すパッチをachStatsにマージし、
// 新たに解放されたアチーブメントを反映してまとめて書き込む。戻り値は新規解放分のID配列。
async function applyAchStatsPatch(uid, patchFn) {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const userData = snap.exists() ? snap.data() : {};
    const currentStats = loadAchStats(userData.achStats);

    const statsPatch = patchFn(currentStats) || {};
    const mergedStats = {
        ...currentStats,
        ...statsPatch,
        soloWins: { ...currentStats.soloWins, ...(statsPatch.soloWins || {}) },
        soloBakatareWins: { ...currentStats.soloBakatareWins, ...(statsPatch.soloBakatareWins || {}) },
    };

    const ctx = { winCount: userData.winCount || 0, ...mergedStats };
    const newlyUnlocked = findNewlyUnlocked(ctx, userData.achievements);
    const updatedAchievements = [...(userData.achievements || []), ...newlyUnlocked];

    await updateDoc(userRef, {
        achStats: mergedStats,
        achievements: updatedAchievements,
        achievementCount: updatedAchievements.length,
    });

    return newlyUnlocked;
}

// ソロモード：難易度勝利を記録する。rating/charaWinsには一切触れない
export async function recordSoloWin(uid, difficultyId, charaId) {
    return applyAchStatsPatch(uid, () => {
        const patch = { soloWins: { [difficultyId]: true } };
        if (difficultyId === 'bakatare' && charaId) {
            patch.soloBakatareWins = { [charaId]: true };
        }
        return patch;
    });
}

// PvP（ランクマッチのみ）：1試合の結果からアチーブメント関連スタッツを更新する
export async function recordPvpMatchAchievements(uid, {
    newRating,
    ultCountThisMatch = 0,
    isWinner = false,
    isStraightWin = false,
    isCleanWin = false,
    isComebackWin = false,
} = {}) {
    return applyAchStatsPatch(uid, (currentStats) => {
        const patch = {
            maxRatingReached: Math.max(currentStats.maxRatingReached, newRating ?? 0),
            ultUsedTotal: currentStats.ultUsedTotal + ultCountThisMatch,
        };
        if (isWinner) {
            if (ultCountThisMatch === 0) patch.hadSealWin = true;
            if (ultCountThisMatch >= 2) patch.hadDoubleUltWin = true;
            if (isStraightWin) patch.hadStraightWin = true;
            if (isCleanWin) patch.hadCleanWin = true;
            if (isComebackWin) patch.hadComebackWin = true;
        }
        return patch;
    });
}

// プレイヤー情報画面用：全アチーブメントに unlocked/progress を付与した一覧を返す
export function getAchievementViewModel(userData) {
    const ctx = buildContext(userData || {});
    const unlockedSet = new Set((userData && userData.achievements) || []);
    return ALL_ACHIEVEMENTS.map((ach) => ({
        ...ach,
        unlocked: unlockedSet.has(ach.id),
        progress: ach.progress ? ach.progress(ctx) : null,
    }));
}

// 称号（称号スロットは2つ、0始まりのslotIndexで指定）。achIdにnullを渡すとそのスロットを解除する。
// 両スロットに同じアチーブメントを設定することも可能。
// 戻り値は更新後のequippedTitles配列。
export async function setEquippedTitle(uid, slotIndex, achId) {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const userData = snap.exists() ? snap.data() : {};
    const current = Array.isArray(userData.equippedTitles) && userData.equippedTitles.length === 2
        ? [...userData.equippedTitles]
        : [null, null];

    current[slotIndex] = achId || null;

    await updateDoc(userRef, { equippedTitles: current });
    return current;
}

// バトル画面用：プレイヤーの設定済み称号をDOM要素に反映する（rarity色のチップ表示）
export function applyTitleDisplay(element, userData) {
    if (!element) return;
    const ids = (userData && userData.equippedTitles) ? userData.equippedTitles.filter(Boolean) : [];
    element.innerHTML = '';
    ids.forEach((achId) => {
        const ach = ALL_ACHIEVEMENTS.find((a) => a.id === achId);
        if (!ach) return;
        const chip = document.createElement('span');
        chip.className = `title-chip rarity-badge rarity-${ach.rarity}`;
        chip.textContent = ach.name;
        element.appendChild(chip);
    });
}
