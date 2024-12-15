import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"; 

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

export { db }; // dbをエクスポート
