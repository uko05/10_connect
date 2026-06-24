import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { db, auth, authReady } from "./firebaseConfig.js"; //firebaseの設定ファイル
import {
    getFirestore,
    collection,
    writeBatch,
    addDoc,
    onSnapshot,
    query,
    where,
    deleteDoc,
    doc,
    getDocs,
    getDoc,
    runTransaction,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { characterData } from './characterData.js';
import { APP_VERSION } from './version.js';
import { setupScaledLayout } from './layoutScaler.js';
import { ensureUserDoc, getUserRating, applyRatingDisplay, savePlayerName } from './eloRating.js';
import { setupSettingsModal, bindSettingsUI, CPU_DIFFICULTY_LEVELS, getCpuDifficulty, setCpuDifficulty } from './settingsManager.js';

// 設定ダイアログ（石カラー・必殺技演出強度・音量）
setupSettingsModal('settingsButton', 'settingsModal');
bindSettingsUI(document.getElementById('settingsModal'));

// 遷移元モード（ハブ画面からの ?mode=cpu / ?mode=match）に応じて、関係ないブロックを隠す
// modeが無い場合（直接アクセス等）は両方表示してフォールバックする
const requestedMode = new URLSearchParams(window.location.search).get('mode');
const matchModeBlock = document.getElementById('matchModeBlock');
const soloModeBlock = document.getElementById('soloModeBlock');
if (requestedMode === 'cpu') {
    matchModeBlock.style.display = 'none';
} else if (requestedMode === 'match') {
    soloModeBlock.style.display = 'none';
}

// モード選択画面へ戻る
document.getElementById('backToHubButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

// CPU難易度選択（キャラ選択画面、ソロモードボタンの下）。前回対戦時の難易度がデフォルトで選択される
const cpuDifficultyRadios = document.querySelectorAll('input[name="cpuDifficulty"]');
const cpuDifficultyLabel = document.getElementById('cpuDifficultyLabel');

function updateCpuDifficultyLabel(difficultyId) {
    if (!cpuDifficultyLabel) return;
    const level = CPU_DIFFICULTY_LEVELS.find(d => d.id === difficultyId);
    cpuDifficultyLabel.textContent = level ? level.label : "";
}

const initialCpuDifficulty = getCpuDifficulty();
cpuDifficultyRadios.forEach(radio => {
    radio.checked = radio.value === initialCpuDifficulty;
    radio.addEventListener('change', () => {
        if (radio.checked) {
            setCpuDifficulty(radio.value);
            updateCpuDifficultyLabel(radio.value);
        }
    });
});
updateCpuDifficultyLabel(initialCpuDifficulty);

// ソロモード（CPU対戦）への遷移。マッチング不要・Firestoreを使わない別画面
document.getElementById('soloModeButton').addEventListener('click', () => {
    const charaID = document.getElementById('charaID').value;
    if (charaID.trim() === "") {
        document.getElementById('statusMessage').innerText = "キャラクターを選択してください。";
        return;
    }
    const playerName = document.getElementById('playerName').value.trim() || "プレイヤー";
    sessionStorage.setItem('soloPlayerCharaID', charaID);
    sessionStorage.setItem('soloPlayerName', playerName);
    window.location.href = 'solo.html';
});

// バージョン表示
document.getElementById('version').textContent = APP_VERSION;

// スマホ対応：ロビー画面のスケーリング
const setupLobbyLayout = setupScaledLayout('lobbyWrap', 1200, 730);

// ④ 縦持ち時の「横画面にしてください」ラベル設定（③ 英語文を縦積み追加）
const orientationLabel = document.getElementById('orientationLabel');
if (orientationLabel) {
    orientationLabel.innerHTML =
        '<div>横画面にしてください</div>' +
        '<div style="font-size:0.45em; margin-top:0.5em; line-height:1.4;">This game currently supports Japanese only.<br>Thanks for your support!</div>';
}

let playerDocRef = null;
let NowMatching = false;  //既にマッチング処理が進行中かどうかを示すフラグ
let roomDocRef = null; //ここで roomDocRef を宣言

//選択中のキャラクターを保持する変数
let selectedCharacter = null;

//バトル画面への遷移フラグ
let isNavigatingToBattle = false;

//音声ファイルを定義（キャラクター選択とマッチング用）
const selectSound = new Audio('public/scripts/sound/chara_select.wav');
let systemvolumeSlider = null;
let voicevolumeSlider = null;
let charaSoundUrl = null;
let charaSound = null;

// キャラ別個人勝利数（users/{uid}.charaWins）。ログイン後に取得して反映する
let myCharaWins = {};
// 解放済みアチーブメント（requiredAchievementId でキャラをロック制御するために使用）
let myAchievements = new Set();

// プレイヤー名保存用に、認証済みUIDを保持する
let currentUid = null;

//------------------------------------------------------------------------------------------------
//要素取得
const modal = document.getElementById("helpModal");
const helpButton = document.getElementById("helpButton");
const closeModalButton = modal.querySelector(".close");
const slides = document.querySelectorAll(".slide");
const prevButton = document.querySelector(".prev-btn");
const nextButton = document.querySelector(".next-btn");

let currentSlide = 0;

const WAITING_EXPIRE_MS = 15 * 60 * 1000; // 5分

// 部屋離脱検知用ハートビート：waiting中はP1が自分の生存時刻を定期的に書き込み、
// 他のクライアントはこれが古い（既定で30秒超）場合に「不在」と判定する
const HEARTBEAT_INTERVAL_MS = 10 * 1000;
const STALE_THRESHOLD_MS = 30 * 1000;
let heartbeatIntervalId = null;

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}

// waiting中のみ呼ぶ。タブが非表示の間は送信を止め、表示に戻った瞬間に即時送信する
function startWaitingHeartbeat(docRef) {
    stopHeartbeat();
    const beat = () => {
        if (document.visibilityState !== 'visible') return;
        updateDoc(docRef, { player1_LastActive: serverTimestamp() }).catch((e) => {
            console.error("[heartbeat] failed:", e);
        });
    };
    beat();
    heartbeatIntervalId = setInterval(beat, HEARTBEAT_INTERVAL_MS);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && heartbeatIntervalId && playerDocRef) {
        updateDoc(playerDocRef, { player1_LastActive: serverTimestamp() }).catch((e) => {
            console.error("[heartbeat] resume failed:", e);
        });
    }
});

//------------------------------------------------------------------------------------------------
//サムネイルを表示する関数
function displayThumbnails() {
    const container = document.getElementById('thumbnailContainer');
    systemvolumeSlider = document.getElementById('systemvolumeSlider');
    voicevolumeSlider = document.getElementById('voicevolumeSlider');

    selectSound.volume = 0.2;

    console.log("システム音量スライダー:", systemvolumeSlider);
    console.log("ボイス音量スライダー:", voicevolumeSlider);

    // requiredAchievementId を持つキャラは、該当アチーブメント未所持の場合はロック扱い
    const unlockedCharacters = characterData.filter(
        c => !c.requiredAchievementId || myAchievements.has(c.requiredAchievementId)
    );
    const lockedCharacters = characterData.filter(
        c => c.requiredAchievementId && !myAchievements.has(c.requiredAchievementId)
    );

    unlockedCharacters.forEach((character, index) => {
        //サムネイル画像と勝利数バッジをまとめるラッパー
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';

        const img = document.createElement('img');
        img.src = character.src; //画像のソース
        img.alt = character.name; //代替テキスト
        img.className = 'thumbnail'; //CSSクラスを追加

        //音声のURLをデータ属性として持たせる
        img.setAttribute('data-voice', character.voice_select); //画像に音声のURLをセット

        //クリックイベントを追加
        img.addEventListener('click', () => {
            //前のボイスが再生中なら停止してリセット
            if (charaSound && !charaSound.paused) {
                charaSound.pause();
                charaSound.currentTime = 0;
            }

            //既に選択中のキャラクターがあれば枠を外す
            if (selectedCharacter) {
                selectedCharacter.classList.remove('selected');
            }
            //現在のキャラクターを選択
            img.classList.add('selected');
            selectedCharacter = img; //選択中のキャラクターを更新

            //キャラクター情報を表示
            displayCharacterInfo(character); //キャラクター情報を表示

            //音声を再生
            charaSoundUrl = img.getAttribute('data-voice'); //音声URLを取得
            charaSound = new Audio(charaSoundUrl); //Audioオブジェクトを作成
            charaSound.volume = 0.2;
            charaSound.play().catch(err => console.error('音声の再生に失敗しました:', err));
        });

        wrapper.appendChild(img);

        //キャラ別勝利数バッジ（右下）。ソロモードでは表示しない（charaWinsはランクマッチのみ加算されるため、
        //ソロでの表示は「ソロで勝っても増えない」という誤解を招く）
        if (requestedMode !== 'cpu') {
            const winBadge = document.createElement('span');
            winBadge.className = 'chara-win-badge';
            winBadge.textContent = `勝利数：${myCharaWins[character.charaID] || 0}`;
            wrapper.appendChild(winBadge);
        }

        container.appendChild(wrapper); //コンテナにラッパーを追加
    });

    // アチーブメント未解放でロックされているキャラを「？」枠として表示（ヒント付き）
    lockedCharacters.forEach((character) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';

        const lockedSlot = document.createElement('div');
        lockedSlot.className = 'thumbnail thumbnail-locked';

        const mark = document.createElement('span');
        mark.className = 'thumbnail-locked-mark';
        mark.textContent = '？';
        lockedSlot.appendChild(mark);

        const hint = document.createElement('div');
        hint.className = 'thumbnail-locked-hint';
        hint.innerHTML = '解放条件<br>アチーブメント<br>' + (character.requiredAchievementLabel || character.requiredAchievementId) + '<br>を取得';
        lockedSlot.appendChild(hint);

        wrapper.appendChild(lockedSlot);
        container.appendChild(wrapper);
    });

    // 残りを未定の「？」枠で埋める（合計16枠）
    // 解放条件が決まっている枠だけヒントを表示する。未定の枠は null のまま。
    const LOCKED_SLOT_TOTAL = 16;
    const LOCKED_CHARACTER_HINTS = [
        ['解放条件', 'アチーブメント', 'マダム・ヘルタの導き', 'を取得'],
    ];
    const unknownOffset = unlockedCharacters.length + lockedCharacters.length;
    for (let i = unknownOffset; i < LOCKED_SLOT_TOTAL; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';

        const lockedSlot = document.createElement('div');
        lockedSlot.className = 'thumbnail thumbnail-locked';

        const mark = document.createElement('span');
        mark.className = 'thumbnail-locked-mark';
        mark.textContent = '？';
        lockedSlot.appendChild(mark);

        const hintLines = LOCKED_CHARACTER_HINTS[i - unknownOffset];
        if (hintLines) {
            const hint = document.createElement('div');
            hint.className = 'thumbnail-locked-hint';
            hint.innerHTML = hintLines.join('<br>');
            lockedSlot.appendChild(hint);
        }

        wrapper.appendChild(lockedSlot);
        container.appendChild(wrapper);
    }
}

//キャラクターの情報を表示する関数
function displayCharacterInfo(character) {
    document.getElementById('characterName').innerText = character.name; //キャラクター名を表示
    document.getElementById('characterCharge').innerText = character.charge; //チャージ量を表示
    document.getElementById('Ability').innerText = character.Ability; //必殺技名を表示
    document.getElementById('AbilityDetail').innerText = character.AbilityDetail; //必殺技内容を表示
    document.getElementById('charaID').value = character.charaID; //キャラIDをhiddenフィールドに設定
}

//ページが読み込まれたらサムネイルを表示し、スライダーイベントを設定
//DOMContentLoaded・・・HTMLが全部読み込まれたとき動く
//Load・・・CSSとかJS含む全て（ページ全体）が読み込まれたときに動く
document.addEventListener('DOMContentLoaded', async () => {
    // Anonymous Auth 完了を待機し、usersドキュメントを初期化
    try {
        const user = await authReady;
        currentUid = user.uid;
        await ensureUserDoc(user.uid);
        console.log("[characterSelect] Auth ready, uid:", user.uid);

        // ロビーにレート表示
        const myRating = await getUserRating(user.uid);
        const ratingEl = document.getElementById('lobbyRatingDisplay');
        const badgeEl = document.getElementById('lobbyRankBadge');
        const rankNameEl = document.getElementById('lobbyRankName');
        applyRatingDisplay(ratingEl, myRating, badgeEl, rankNameEl);

        // キャラ別個人勝利数（サムネイルのバッジ表示用）
        myCharaWins = myRating?.charaWins || {};
        // 解放済みアチーブメント（キャラロック判定用）
        myAchievements = new Set(myRating?.achievements || []);

        // 前回保存したプレイヤー名があれば自動入力
        const playerNameInput = document.getElementById('playerName');
        if (playerNameInput && !playerNameInput.value && myRating?.playerName) {
            playerNameInput.value = myRating.playerName;
        }
        // 入力欄からフォーカスが外れたタイミングで保存（次回以降の自動入力用）
        if (playerNameInput) {
            playerNameInput.addEventListener('blur', () => {
                if (currentUid) savePlayerName(currentUid, playerNameInput.value);
            });
        }
    } catch (error) {
        console.error("[characterSelect] Auth initialization failed:", error);
    }

    //スライダー要素を取得
    systemvolumeSlider = document.getElementById('systemvolumeSlider');
    voicevolumeSlider = document.getElementById('voicevolumeSlider');

    console.log("システム音量スライダー:", systemvolumeSlider);
    console.log("ボイス音量スライダー:", voicevolumeSlider);

    //サムネイルを表示
    displayThumbnails();

    //スライダーのイベントリスナーを設定
    if (systemvolumeSlider) {
        systemvolumeSlider.addEventListener('input', (event) => {
            const newVolume = parseFloat(event.target.value); //数値として取得
            console.log("○システム音量変更：", newVolume);
            selectSound.volume = newVolume; //音量を更新
        });
    } else {
        console.error("systemvolumeSlider が見つかりません");
    }

    if (voicevolumeSlider) {
        voicevolumeSlider.addEventListener('input', (event) => {
            const newVolume = parseFloat(event.target.value); //数値として取得
            console.log("○ボイス音量変更：", newVolume);
            if (charaSound) charaSound.volume = newVolume;
        });
    } else {
        console.error("voicevolumeSlider が見つかりません");
    }

    localStorage.setItem("timeRemaining", 1000); //残り時間を保存
    localStorage.setItem("lastTimestamp", Date.now()); //現在のタイムスタンプを保存
    loadTimeRemaining();

    // ★スケール再計算（サムネイル描画後に幅が確定するため）
    setupLobbyLayout();
});

//ローカルストレージから残り時間を取得
function loadTimeRemaining() {
    const savedTime = localStorage.getItem("timeRemaining");
    const savedTimestamp = localStorage.getItem("lastTimestamp");

    console.log("ローカルストレージから残り時間を取得:", savedTime);
}

//------------------------------------------------------------------------------------------------

//モーダルを開く
helpButton.addEventListener("click", () => {
  modal.style.display = "block";
});
//モーダルを閉じる
closeModalButton.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

//スライダーの操作
function updateSlides() {
  slides.forEach((slide, index) => {
    slide.classList.toggle("active", index === currentSlide);
  });
}

prevButton.addEventListener("click", () => {
  currentSlide = (currentSlide - 1 + slides.length) % slides.length;
  updateSlides();
});

nextButton.addEventListener("click", () => {
  currentSlide = (currentSlide + 1) % slides.length;
  updateSlides();
});

//初期スライド更新
updateSlides();
//------------------------------------------------------------------------------------------------

//ページを離れるとき（タブを閉じる／ナビゲート）に自分の待機中ドキュメントを削除するベストエフォート処理。
//beforeunload内の非同期処理は完了が保証されない（特にモバイル）ため、本来の安全網はハートビート＋
//生存時刻の鮮度チェック側（startWaitingHeartbeat / 他クライアントの不在部屋削除）にある。
function cleanupOwnRoomOnExit(event) {
    if (!playerDocRef || isNavigatingToBattle) return;
    if (event && event.cancelable) event.preventDefault();

    stopHeartbeat();
    const ref = playerDocRef;
    playerDocRef = null;
    deleteDoc(ref).catch((error) => {
        console.error("Error deleting own room on exit:", error);
    });
}

window.addEventListener('beforeunload', cleanupOwnRoomOnExit);
// pagehideはモバイルでbeforeunloadが発火しないケースのフォールバック
window.addEventListener('pagehide', cleanupOwnRoomOnExit);

//------------------------------------------------------------------------------------------------

//入力を無効化する関数
function toggleInputs(isDisabled) {
    document.getElementById('playerName').disabled = isDisabled;
    document.getElementById('roomMatching').disabled = isDisabled;
    document.getElementById('matchButton').disabled = isDisabled;

    document.getElementById('statusMessage').innerText = isDisabled ? "マッチング待機中" : "";

    //サムネイルのクリックイベントを無効化
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach(thumbnail => {
        thumbnail.style.pointerEvents = isDisabled ? 'none' : 'auto'; //クリック無効化
    });
}

//サムネイルのクリックイベント
document.querySelectorAll('.thumbnail').forEach(thumbnail => {
    thumbnail.addEventListener('click', function() {
        //すべてのサムネイルの選択状態を解除
        document.querySelectorAll('.thumbnail').forEach(t => {
            t.classList.remove('selected');
            //選択状態ではないサムネイルのアニメーションを停止
            t.style.animationPlayState = 'paused';
        });

        //クリックされたサムネイルを選択状態に
        thumbnail.classList.add('selected');

        //選択されたサムネイルだけアニメーションを有効化
        thumbnail.style.animationPlayState = 'running';

    });
});

//------------------------------------------------------------------------------------------------

//自分のIDを持つデータを削除する関数
async function removePlayerFromRoom(generatedId) {

    const roomRef = query(collection(db, "rooms"), where("player1_ID", "==", generatedId));

    const roomSnapshot = await getDocs(roomRef);

    document.getElementById('statusMessage').innerText = "";

    //Firestoreのバッチを作成
    const batch = writeBatch(db);

    //roomsから削除
    roomSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
}
//------------------------------------------------------------------------------------------------

//クッキーからUUIDを取得
function getUUIDFromCookie() {
    const cookies = document.cookie.split("; "); //クッキーを配列に分割
    const uuidCookie = cookies.find(cookie => cookie.startsWith("playerUUID="));

    //UUIDが見つかった場合に値を返す
    return uuidCookie ? uuidCookie.split("=")[1] : null;
}

//------------------------------------------------------------------------------------------------
let waitingExpireTimerId = null;

function startWaitingExpireTimer(roomDocRef) {
  if (waitingExpireTimerId) {
    clearTimeout(waitingExpireTimerId);
    waitingExpireTimerId = null;
  }

  console.log("[expire] startWaitingExpireTimer called", roomDocRef.path);

  getDoc(roomDocRef).then((snap) => {
    if (!snap.exists()) {
      console.log("[expire] doc not exists");
      return;
    }

    const data = snap.data();
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);

    if (!(createdAt instanceof Date) || isNaN(createdAt.getTime())) {
      console.log("[expire] createdAt invalid:", data.createdAt);
      return;
    }

    const expireAt = createdAt.getTime() + WAITING_EXPIRE_MS;
    const delay = Math.max(0, expireAt - Date.now());

    console.log("[expire] createdAt:", createdAt, "delay(ms):", delay);

    waitingExpireTimerId = setTimeout(async () => {
      console.log("[expire] timeout fired!");

      try {
        const latest = await getDoc(roomDocRef);
        if (!latest.exists()) {
          console.log("[expire] latest doc not exists (already deleted?)");
          return;
        }

        const d = latest.data();
        console.log("[expire] latest status:", d.status, "player2_ID:", d.player2_ID);

        if (d.status === "waiting" && d.player2_ID == null) {
          await deleteDoc(roomDocRef);
          console.log("[expire] deleted room doc");

          stopHeartbeat();
          NowMatching = false;
          toggleInputs(false);

          const matchButton = document.getElementById('matchButton');
          matchButton.innerText = "マッチング";
          matchButton.style.backgroundColor = "";

          document.getElementById('statusMessage').innerText =
            `${WAITING_EXPIRE_MS / 60000}分経過したのでキャンセルしました。`;

          playerDocRef = null;
          waitingExpireTimerId = null;
        }
      } catch (e) {
        console.error("[expire] failed:", e);
      }
    }, delay);
  });
}


//------------------------------------------------------------------------------------------------

//マッチングボタンのクリックイベント
document.getElementById('matchButton').addEventListener('click', async () => {

    selectSound.play();

    localStorage.setItem("timeRemaining", 1000); //残り時間を保存

    //プレイヤー名チェック
    const playerName = document.getElementById('playerName').value;
    if (playerName.trim() === "") {
        document.getElementById('statusMessage').innerText = "名前を入力してください。";
        return;
    }

    //キャラクター選択チェック
    const charaID = document.getElementById('charaID').value;
    if (charaID.trim() === "") {
        document.getElementById('statusMessage').innerText = "キャラクターを選択してください。";
        return;
    }

    //合言葉マッチング用
    let roomMatching = document.getElementById('roomMatching').value;
    if (roomMatching.trim() === "") {
        roomMatching = null;
    }

    //UUIDの取得（Anonymous Auth uid を使用）
    let playerUUID = null;
    if (NowMatching == false) {
        //マッチング開始：Auth uidを使用
        playerUUID = auth.currentUser?.uid || crypto.randomUUID();
    } else {
        //マッチング解除
        playerUUID = getUUIDFromCookie();
    }
    document.cookie = `playerUUID=${playerUUID}; path=/; max-age=259200`; //クッキーに保存（1日間有効）

    //NowMatching = FALSE(マッチングしてない：デフォルト)
    toggleInputs(!NowMatching); //入力を切り替え
    const matchButton = document.getElementById('matchButton');

    if (NowMatching == false) {
        matchButton.innerText = "マッチング中・・・";
        matchButton.style.backgroundColor = "#ff9900";
    } else {
        matchButton.innerText = "マッチング";
        matchButton.style.backgroundColor = "";
    }

    //ルームを検索する。条件はステータスがwaitingかつ部屋指定用の合言葉が同じ（未入力の場合はNull）
    const roomsRef = collection(db, "rooms");
    const myroom = query(
        roomsRef,
        where("status", "==", "waiting"),
        where("roomMatching", "==", roomMatching)
    );
    const querySnapshot = await getDocs(myroom);
    let matchingRooms = querySnapshot.docs;

    // ハートビートが途絶えている（作成者が不在の可能性が高い）部屋は除外し、可能であれば削除して自浄する
    const liveRooms = [];
    for (const docSnap of matchingRooms) {
        const data = docSnap.data();
        const lastActiveMs = data.player1_LastActive?.toMillis
            ? data.player1_LastActive.toMillis()
            : (data.createdAt?.toDate ? data.createdAt.toDate().getTime() : new Date(data.createdAt).getTime());

        if (!Number.isFinite(lastActiveMs) || (Date.now() - lastActiveMs) > STALE_THRESHOLD_MS) {
            console.log("[stale] abandoned room detected, deleting:", docSnap.id);
            try {
                await deleteDoc(docSnap.ref);
            } catch (e) {
                console.error("[stale] delete failed:", e);
            }
            continue;
        }
        liveRooms.push(docSnap);
    }
    matchingRooms = liveRooms;

    if (matchingRooms.length > 0) {
        //ルームドキュメントの参照を初期化
        roomDocRef = matchingRooms[0].ref; //最初のマッチングルームの参照を取得

        if (NowMatching) {
            //マッチング解除
            removePlayerFromRoom(playerUUID);
            stopHeartbeat();

            NowMatching = false; //解除時にfalseに設定

            toggleInputs(NowMatching); //入力を切り替え

        } else {

            //更新
            try {
                //roomDocRefを初期化
                roomDocRef = matchingRooms[0].ref; //最初のマッチングルームの参照を取得

                //更新に対する処理を記述
                listenForMatches();

                //既にマッチング待ちのデータがある場合、Player2として更新する。
                await updateDoc(roomDocRef, {
                    player2_ID: playerUUID, //修正: player2_IDにUUIDを設定
                    player2_CharaID: charaID,
                    player2_Name: playerName,
                    status: "in_progress",
                    player2_LastActive: serverTimestamp()
                });

                NowMatching = true;

            } catch (error) {
                console.error("Error adding document: ", error);
            } finally {
                document.getElementById('matchButton').disabled = false;
            }

        }

    } else {

        //まだマッチング待ちがないので、Player1として新規作成する。
        try {
            const startP = (crypto.getRandomValues(new Uint8Array(1))[0] % 2) === 0 ? 'P1' : 'P2';
            const p1color = startP === 'P1' ? 'red' : 'yellow';
            const p2color = startP === 'P2' ? 'red' : 'yellow';

            playerDocRef = await addDoc(roomsRef, {
                player1_ID: playerUUID,
                player1_CharaID: charaID,
                player1_ChargeNow: 0,
                player1_Name: playerName,
                player1_Color: p1color,
                player1_TimeLimit: 100,
                player1_UltCount: 0,
                player1_TimeoutCount: 0,
                player2_ID: null,
                player2_CharaID: null,
                player2_ChargeNow: 0,
                player2_Name: null,
                player2_Color: p2color,
                player2_TimeLimit: 100,
                player2_UltCount: 0,
                player2_TimeoutCount: 0,
                red_Win: 0,
                yellow_Win: 0,
                roomMatching: roomMatching,
                matchType: roomMatching ? "private" : "ranked",
                roomID: crypto.randomUUID(),
                status: "waiting",
                createdAt: new Date(),
                startP: startP,
                turn: startP,
                turnCount: 1,
                changeStone: 0,
                player1_LastActive: serverTimestamp()
            });
            startWaitingExpireTimer(playerDocRef);
            startWaitingHeartbeat(playerDocRef);

            listenForMatches();
            NowMatching = true;

        } catch (error) {
            console.error("Error adding document: ", error);
        } finally {
            document.getElementById('matchButton').disabled = false;
        }

    }
});

//------------------------------------------------------------------------------------------------

//プレイヤーが待機リストに入ったときのリスナー処理
function listenForMatches() {

    const roomsRef = collection(db, "rooms");
    const playerName = document.getElementById('playerName').value;
    const charaID = document.getElementById('charaID').value;

    let roomMatching = document.getElementById('roomMatching').value;
    if (roomMatching.trim() === "") {
        roomMatching = null;
    }
    let playerUUID = getUUIDFromCookie(); //クッキーからUUIDを読み込む

    onSnapshot(roomsRef, async (snapshot) => {

        const addedDocs = snapshot.docChanges().filter(change => change.type === "added");
        const modifiedDocs = snapshot.docChanges().filter(change => change.type === "modified");

        //追加されたドキュメントの処理
        addedDocs.forEach(change => {

            const roomData = change.doc.data();

            //statusが"waiting"かつroomMatchingが一致する部屋のみを処理
            if (roomData.status === "waiting" && roomData.roomMatching === roomMatching && roomData.player1_ID != playerUUID) {

                if (NowMatching === false) {

                    return; //NowMatchingがfalseなら処理を実行しない
                }

                document.getElementById('statusMessage').innerText = "マッチングしました！！";
                isNavigatingToBattle = true; //バトル画面への遷移フラグを設定

                showMatchLabel();

                setTimeout(() => {
                    window.location.href = "battle.html";
                }, 5000);
            }

            //statusが"waiting"かつroomMatchingが一致する部屋のみを処理
            if (roomData.status === "in_progress" && roomData.roomMatching === roomMatching && roomData.player2_ID === playerUUID) {

                document.getElementById('statusMessage').innerText = "マッチングしました！！";
                isNavigatingToBattle = true; //バトル画面への遷移フラグを設定

                showMatchLabel();

                setTimeout(() => {
                    window.location.href = "battle.html";
                }, 5000);
            }
        });

        //更新されたドキュメントの処理
        modifiedDocs.forEach(change => {

            const roomData = change.doc.data();

            //statusが"in_progress"かつroomMatchingが一致する部屋のみを処理
            if (roomData.status === "in_progress" && roomData.roomMatching === roomMatching && roomData.player1_ID === playerUUID) {

                stopHeartbeat(); // 相手が参加し対局開始。waiting用ハートビートは不要
                document.getElementById('statusMessage').innerText = "マッチングしました！！";
                isNavigatingToBattle = true; //バトル画面への遷移フラグを設定

                showMatchLabel();

                setTimeout(() => {
                    window.location.href = "battle.html";
                }, 5000);
            }
        });
    });
}

//matchingを表示するための関数
async function showMatchLabel() {

    const matchLabel = document.getElementById("matchLabel");

    matchLabel.innerHTML = 'マッチングしました！<br>バトル画面に移動します。';

    //フェードイン
    matchLabel.style.display = "block"; //初めに表示状態に
    setTimeout(() => {
        matchLabel.style.opacity = 1; //透明度を1にしてフェードイン
    }, 10); //少し遅れて実行（レイアウトを反映させるため）

    //3秒後にフェードアウト
    setTimeout(() => {
        matchLabel.style.opacity = 0; //透明度を0にしてフェードアウト
    }, 4000); //3秒後にフェードアウト

    //フェードアウト後に完全に非表示
    setTimeout(() => {
        matchLabel.style.display = "none"; //透明度が0になったら非表示
    }, 5000); //フェードアウト後に少し待ってから非表示
}
//------------------------------------------------------------------------------------------------
