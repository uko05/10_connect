// eloRating.js — レート表示・ユーザードキュメント関連。
// ※レート・戦績・キャラ統計の計算と書き込みはサーバー(24_AccountCenter/functions/connect.js)に移した。
import { db } from "./firebaseConfig.js";
import {
  doc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getDoc, getDocs, getCountFromServer } from './fsTracked.js'; // 読み取り件数の集計(調査用、fsTracked.js参照)
import { getRankTier, getRankCssClass, getRankBadgePath } from "./rankConfig.js";

// ────────────────────────────
// 定数
// ────────────────────────────
const INITIAL_RATING = 1500; // 新規ユーザーの初期レート(ルールでもこの値でしか作成できない)

// ────────────────────────────
// users/{uid} 初回作成（Auth成功時に呼ぶ）
// ────────────────────────────
export async function ensureUserDoc(uid) {
    const userRef = doc(db, "connectUsers", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        await setDoc(userRef, {
            rating: INITIAL_RATING,
            matchCount: 0,
            winCount: 0,
            lastMatchAt: serverTimestamp(),
            achievements: [],
            achievementCount: 0,
            achStats: {},
            equippedTitles: [null, null],
            unlockedHiddenCharas: {},
            unlockedHiddenCharaCount: 0,
        });
        console.log("[Rating] users doc created for", uid);
    }
    return userRef;
}

// ────────────────────────────
// sharedUserId(うこ氏サイト群共通ID)を自分のusersドキュメントに反映
// ※ 対戦相手など「自分以外」のuidに対しては絶対に呼ばないこと
//   （自分のlocalStorageの値を他人のドキュメントに書き込んでしまうため）
// ────────────────────────────
export async function syncSharedUserId(uid, sharedUserId) {
    if (!sharedUserId) return;
    try {
        const userRef = doc(db, "connectUsers", uid);
        await updateDoc(userRef, { sharedUserId });
    } catch (e) {
        console.warn("[Rating] sharedUserId の同期に失敗:", e);
    }
}

// ────────────────────────────
// ユーザーのレート情報を取得
// ────────────────────────────
export async function getUserRating(uid) {
    const userRef = doc(db, "connectUsers", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    return snap.data();
}

// ────────────────────────────
// プレイヤー名を保存（次回以降の自動入力用）
// ────────────────────────────
export async function savePlayerName(uid, playerName) {
    const trimmed = (playerName || "").trim().slice(0, 20); // 念のため長さを制限
    if (!trimmed) return;
    try {
        const userRef = doc(db, "connectUsers", uid);
        await updateDoc(userRef, { playerName: trimmed });
    } catch (e) {
        console.warn("[Rating] プレイヤー名の保存に失敗:", e);
    }
}

// ────────────────────────────
// ランキング取得（自分より上の人数 + 1 = 順位）
// ────────────────────────────
export async function getUserRank(rating) {
    try {
        const usersRef = collection(db, "connectUsers");

        // 自分より上の人数
        const aboveQuery = query(usersRef, where("rating", ">", rating));
        const aboveSnap = await getCountFromServer(aboveQuery);
        const rank = aboveSnap.data().count + 1;

        // 全ユーザー数
        const totalSnap = await getCountFromServer(query(usersRef));
        const total = totalSnap.data().count;

        return { rank, total };
    } catch (e) {
        console.warn("[Rating] ランキング取得失敗:", e);
        return null;
    }
}

// ────────────────────────────
// レート表示をDOM要素に反映（順位付き）
// ────────────────────────────
export async function applyRatingDisplay(element, userData, badgeElement, rankNameElement) {
    if (!element) return;
    if (!userData) {
        element.textContent = "---";
        element.className = "player-rating";
        if (badgeElement) badgeElement.style.display = "none";
        if (rankNameElement) rankNameElement.textContent = "";
        return;
    }
    const displayRating = userData.rating ?? 1500;
    const tier = getRankTier(displayRating);
    const cssClass = getRankCssClass(displayRating);

    // ランク名を別要素に表示（バトル画面用）
    if (rankNameElement) {
        rankNameElement.textContent = tier;
        rankNameElement.className = `player-rating ${cssClass}`;
        // element にはレート数のみ
        element.innerHTML = `Rate: ${displayRating}`;
        element.className = `player-rating-detail`;
    } else {
        // ロビー画面用（従来通り1要素にまとめる）
        element.innerHTML = `${tier}<br>Rate: ${displayRating}`;
        element.className = `player-rating ${cssClass}`;
    }

    // バッジ画像を設定
    if (badgeElement) {
        badgeElement.src = getRankBadgePath(displayRating);
        badgeElement.alt = tier;
        badgeElement.style.display = "block";
    }

    // 順位を取得して追加表示（全体人数は表示しない）
    const rankInfo = await getUserRank(displayRating);
    if (rankInfo) {
        if (rankNameElement) {
            element.innerHTML = `Rate: ${displayRating}<br>Ranking: #${rankInfo.rank}`;
        } else {
            element.innerHTML = `${tier}<br>Rate: ${displayRating}<br>Ranking: #${rankInfo.rank}`;
        }
    }
}

// ────────────────────────────
// BO3確定時にroomsに結果フィールドを書き込む
// ────────────────────────────
export async function writeBO3Result(roomDocRef, {
    winnerUid,
    resultType,
    p1CharaId,
    p2CharaId,
    redWin,
    yellowWin
}) {
    await updateDoc(roomDocRef, {
        winnerUid,
        resultType,
        p1CharaId,
        p2CharaId,
        red_Win: redWin,
        yellow_Win: yellowWin,
        bo3Final: true,
        rated: false,
        finishedAt: serverTimestamp()
    });
    console.log("[Rating] BO3 result written to room");
}

// ────────────────────────────
// rooms削除（レート確定後に、決着を書いたクライアントが呼ぶ）
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
    const roomsRef = collection(db, "connectRooms");
    const q = query(roomsRef, where("roomID", "==", roomID));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].ref;
}
