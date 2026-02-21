// eloRating.js — Phase1 Elo レーティング & キャラ統計モジュール
import { db } from "./firebaseConfig.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    runTransaction,
    deleteDoc,
    serverTimestamp,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ────────────────────────────
// 定数
// ────────────────────────────
const INITIAL_RATING = 1500;
const RATING_FLOOR = 100;
const LEAVE_PENALTY_MULTIPLIER = 1.5;

// ────────────────────────────
// K値（プレイスメント対応）
// ────────────────────────────
function getK(matchCount) {
    if (matchCount < 10) return 48;
    if (matchCount < 50) return 32;
    return 16;
}

// ────────────────────────────
// ランク帯算出
// ────────────────────────────
function getRankTier(rating) {
    if (rating >= 2000) return "Bakata Legend";
    if (rating >= 1800) return "Legend";
    if (rating >= 1600) return "Gold";
    if (rating >= 1400) return "Silver";
    return "Bronze";
}

// ────────────────────────────
// users/{uid} 初回作成（Auth成功時に呼ぶ）
// ────────────────────────────
export async function ensureUserDoc(uid) {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        await setDoc(userRef, {
            rating: INITIAL_RATING,
            matchCount: 0,
            winCount: 0,
            rankTier: "Silver",
            lastMatchAt: serverTimestamp()
        });
        console.log("[Rating] users doc created for", uid);
    }
    return userRef;
}

// ────────────────────────────
// ユーザーのレート情報を取得
// ────────────────────────────
export async function getUserRating(uid) {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    return snap.data();
}

// ────────────────────────────
// BO3確定時にroomsに結果フィールドを書き込む
// ────────────────────────────
export async function writeBO3Result(roomDocRef, {
    winnerUid,
    resultType,
    matchType,
    p1CharaId,
    p2CharaId
}) {
    await updateDoc(roomDocRef, {
        winnerUid,
        resultType,
        matchType,
        p1CharaId,
        p2CharaId,
        bo3Final: true,
        rated: false,
        finishedAt: serverTimestamp()
    });
    console.log("[Rating] BO3 result written to room");
}

// ────────────────────────────
// メインTransaction（P1のみ実行）
// レート更新 + キャラ統計 + rated=true
// ────────────────────────────
export async function executeRatingTransaction(roomDocRef, p1Uid, p2Uid) {
    try {
        const result = await runTransaction(db, async (transaction) => {
            // ── 1. rooms読み取り ──
            const roomSnap = await transaction.get(roomDocRef);
            if (!roomSnap.exists()) {
                console.log("[Rating] Room not found, skipping");
                return null;
            }
            const room = roomSnap.data();

            // ── 2. 条件チェック（冪等性 + private除外）──
            if (room.rated !== false) {
                console.log("[Rating] Already rated, skipping");
                return null;
            }
            if (room.bo3Final !== true) {
                console.log("[Rating] bo3Final not true, skipping");
                return null;
            }
            if (room.matchType !== "ranked") {
                console.log("[Rating] Not ranked, skipping");
                return null;
            }

            const winnerUid = room.winnerUid;
            const resultType = room.resultType;
            const p1CharaId = room.p1CharaId;
            const p2CharaId = room.p2CharaId;
            const loserUid = (winnerUid === p1Uid) ? p2Uid : p1Uid;

            // ── 3. users読み取り ──
            const winnerRef = doc(db, "users", winnerUid);
            const loserRef = doc(db, "users", loserUid);
            const winnerSnap = await transaction.get(winnerRef);
            const loserSnap = await transaction.get(loserRef);

            const winner = winnerSnap.exists()
                ? winnerSnap.data()
                : { rating: INITIAL_RATING, matchCount: 0, winCount: 0 };
            const loser = loserSnap.exists()
                ? loserSnap.data()
                : { rating: INITIAL_RATING, matchCount: 0, winCount: 0 };

            // ── 4. charaStats読み取り（getはwriteの前に全部行う）──
            const winnerCharaId = (winnerUid === p1Uid) ? p1CharaId : p2CharaId;

            let p1StatsRef, p2StatsRef, p1StatsSnap, p2StatsSnap;
            if (p1CharaId === p2CharaId) {
                // 同一キャラ：1doc
                p1StatsRef = doc(db, "charaStats", p1CharaId);
                p1StatsSnap = await transaction.get(p1StatsRef);
            } else {
                // 別キャラ：2doc
                p1StatsRef = doc(db, "charaStats", p1CharaId);
                p2StatsRef = doc(db, "charaStats", p2CharaId);
                p1StatsSnap = await transaction.get(p1StatsRef);
                p2StatsSnap = await transaction.get(p2StatsRef);
            }

            // ── 5. Elo計算 ──
            const kWinner = getK(winner.matchCount);
            const kLoser = getK(loser.matchCount);

            const eWinner = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
            const eLoser = 1 - eWinner;

            let winnerNewRating = Math.round(winner.rating + kWinner * (1 - eWinner));
            let loserNewRating = Math.round(loser.rating + kLoser * (0 - eLoser));

            // ── 6. leave倍率（正の減少量で計算）──
            if (resultType === "leave" || resultType === "timeout") {
                const lossAmount = loser.rating - loserNewRating; // 正の値
                loserNewRating = loser.rating - Math.round(lossAmount * LEAVE_PENALTY_MULTIPLIER);
            }

            // ── 7. 下限100 ──
            winnerNewRating = Math.max(RATING_FLOOR, winnerNewRating);
            loserNewRating = Math.max(RATING_FLOOR, loserNewRating);

            // ── 8. users書き込み ──
            transaction.set(winnerRef, {
                rating: winnerNewRating,
                matchCount: winner.matchCount + 1,
                winCount: winner.winCount + 1,
                rankTier: getRankTier(winnerNewRating),
                lastMatchAt: serverTimestamp()
            }, { merge: true });

            transaction.set(loserRef, {
                rating: loserNewRating,
                matchCount: loser.matchCount + 1,
                winCount: loser.winCount,
                rankTier: getRankTier(loserNewRating),
                lastMatchAt: serverTimestamp()
            }, { merge: true });

            // ── 9. charaStats書き込み ──
            if (p1CharaId === p2CharaId) {
                // 同一キャラ：1docにまとめる
                const stats = p1StatsSnap.exists()
                    ? p1StatsSnap.data()
                    : { pickCount: 0, winCount: 0 };
                transaction.set(p1StatsRef, {
                    pickCount: stats.pickCount + 2,
                    winCount: stats.winCount + 1
                });
            } else {
                // 別キャラ：個別に処理
                const p1Stats = p1StatsSnap.exists()
                    ? p1StatsSnap.data()
                    : { pickCount: 0, winCount: 0 };
                const p2Stats = p2StatsSnap.exists()
                    ? p2StatsSnap.data()
                    : { pickCount: 0, winCount: 0 };

                transaction.set(p1StatsRef, {
                    pickCount: p1Stats.pickCount + 1,
                    winCount: p1Stats.winCount + (winnerCharaId === p1CharaId ? 1 : 0)
                });
                transaction.set(p2StatsRef, {
                    pickCount: p2Stats.pickCount + 1,
                    winCount: p2Stats.winCount + (winnerCharaId === p2CharaId ? 1 : 0)
                });
            }

            // ── 10. rated確定 ──
            transaction.update(roomDocRef, { rated: true });

            console.log("[Rating] Transaction complete:", {
                winner: { uid: winnerUid, rating: winner.rating + " → " + winnerNewRating },
                loser: { uid: loserUid, rating: loser.rating + " → " + loserNewRating },
                resultType
            });

            return {
                winnerNewRating,
                loserNewRating,
                winnerRankTier: getRankTier(winnerNewRating),
                loserRankTier: getRankTier(loserNewRating)
            };
        });

        return result;

    } catch (error) {
        console.error("[Rating] Transaction failed:", error);
        return null;
    }
}

// ────────────────────────────
// rooms削除（Transaction成功後にP1が呼ぶ）
// ────────────────────────────
export async function deleteRoomAfterRating(roomDocRef) {
    try {
        await deleteDoc(roomDocRef);
        console.log("[Rating] Room deleted after rating");
    } catch (error) {
        console.error("[Rating] Room deletion failed:", error);
    }
}

// ────────────────────────────
// getRoomDocRef — roomID（カスタムUUID）からFirestore doc refを取得
// ────────────────────────────
export async function getRoomDocRef(roomID) {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].ref;
}
