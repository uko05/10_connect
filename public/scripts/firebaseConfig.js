import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// genshin-bakatare01: うこ氏サイト群共通のFirebaseプロジェクト（14_GenshinOmikuji等と同じ）
const firebaseConfig = {
    apiKey: "AIzaSyCP4QfMGDDBSI8VDERnESBOlHpUhy7wGPk",
    authDomain: "genshin-bakatare01.firebaseapp.com",
    projectId: "genshin-bakatare01",
    storageBucket: "genshin-bakatare01.firebasestorage.app",
    messagingSenderId: "658089418604",
    appId: "1:658089418604:web:288c06b331da8c4f789d49"
};

// 名前付きAppインスタンスにする（'connect10'）。
// omikuji/AccountCenter等は無名(デフォルト)Appを使っており、同一オリジン+同一Firebaseプロジェクトだと
// デフォルトAppのAuthセッション（ID+パスワードでのログイン状態）が全ページで共有されてしまう。
// コネバトの匿名認証セッションをそれと独立させ、AccountCenterへのログイン有無でレート等の
// 参照先(uid)が意図せず切り替わらないようにするため、専用の名前付きAppを使う。
const app = initializeApp(firebaseConfig, 'connect10');
const db = getFirestore(app); // Firestoreの初期化
const auth = getAuth(app); // Firebase Authの初期化

// Anonymous Auth でサインイン（未認証なら自動サインイン）
// 認証完了を待つPromise
const authReady = new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("[Auth] 認証済み uid:", user.uid);
            resolve(user);
        } else {
            try {
                const result = await signInAnonymously(auth);
                console.log("[Auth] 匿名サインイン完了 uid:", result.user.uid);
                resolve(result.user);
            } catch (error) {
                console.error("[Auth] 匿名サインイン失敗:", error);
                reject(error);
            }
        }
    });
});

// うこ氏サイト群共通ID（同一オリジンのlocalStorageを共有する前提）
// 14_GenshinOmikuji/userData.js の getUserId() と全く同じロジック・同じキー名にすること。
// これにより、omikuji→コネバトの順でも、コネバト→omikujiの順でも同じIDが使われる。
function getSharedUserId() {
    let id = localStorage.getItem('genshinOmikuji_userId');
    if (!id) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        id = 'u_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('genshinOmikuji_userId', id);
    }
    return id;
}

export { db, auth, authReady, getSharedUserId }; // db, auth, authReady, getSharedUserIdをエクスポート
