import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBGKyncMBe19nq1ciQjxJrZPNpTI-RFuKs",
    authDomain: "connect-10-ca73c.firebaseapp.com",
    projectId: "connect-10-ca73c",
    storageBucket: "connect-10-ca73c.appspot.com",
    messagingSenderId: "840434396495",
    appId: "1:840434396495:web:8f21ad87387161ab83a93a",
    measurementId: "G-1XJBQRVTB0"
};

const app = initializeApp(firebaseConfig);
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

export { db, auth, authReady }; // db, auth, authReadyをエクスポート
