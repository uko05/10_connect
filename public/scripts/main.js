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
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { characterData } from './characterData.js';
import { APP_VERSION } from './version.js';
import { setupScaledLayout } from './layoutScaler.js';
import { ensureUserDoc, getUserRating, applyRatingDisplay } from './eloRating.js';

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

//------------------------------------------------------------------------------------------------
//サムネイルを表示する関数
function displayThumbnails() {
    const container = document.getElementById('thumbnailContainer');
    systemvolumeSlider = document.getElementById('systemvolumeSlider');
    voicevolumeSlider = document.getElementById('voicevolumeSlider');
    
    selectSound.volume = 0.2;
    
    console.log("システム音量スライダー:", systemvolumeSlider);
    console.log("ボイス音量スライダー:", voicevolumeSlider);
    
    //キャラデータ分だけループする
    //対象の画像にCSSとか属性とか音声とかを設定する。
    //addEventListenerでクリックイベントを設定する
    //イベント内で実際に画面に表示する関数を実行する
    characterData.forEach((character, index) => {
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
        container.appendChild(img); //コンテナに画像を追加
    });
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
        await ensureUserDoc(user.uid);
        console.log("[main] Auth ready, uid:", user.uid);

        // ロビーにレート表示
        const myRating = await getUserRating(user.uid);
        const ratingEl = document.getElementById('lobbyRatingDisplay');
        const badgeEl = document.getElementById('lobbyRankBadge');
        const rankNameEl = document.getElementById('lobbyRankName');
        applyRatingDisplay(ratingEl, myRating, badgeEl, rankNameEl);
    } catch (error) {
        console.error("[main] Auth initialization failed:", error);
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
const toggleButton = document.getElementById('toggle-button');
const sidebar = document.getElementById('sidebar');
const parentNode = document.querySelector('.parent-node');
const childNodes = document.querySelector('.child-nodes');

//初期状態でサイドバーを隠す
sidebar.classList.add('hidden');
const mainEl = document.querySelector("main");
if (mainEl) mainEl.classList.add("sidebar-collapsed");

toggleButton.setAttribute('aria-expanded', false);
toggleButton.setAttribute('aria-label', 'メニューを開く');

const sidebarOverlay = document.getElementById('sidebar-overlay');

toggleButton.addEventListener('click', () => {
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    if (isMobile) {
        // スマホ: mobile-openクラスで制御
        const isOpen = sidebar.classList.toggle('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('active', isOpen);
        toggleButton.setAttribute('aria-expanded', isOpen);
        toggleButton.setAttribute('aria-label', isOpen ? 'メニューを閉じる' : 'メニューを開く');
    } else {
        // PC: 従来のhiddenクラスで制御
        sidebar.classList.toggle('hidden');
        const isExpanded = !sidebar.classList.contains('hidden');
        toggleButton.setAttribute('aria-expanded', isExpanded);
        toggleButton.setAttribute('aria-label', isExpanded ? 'メニューを閉じる' : 'メニューを開く');

        const mainEl = document.querySelector("main");
        if (mainEl) {
          mainEl.classList.toggle("sidebar-collapsed", !isExpanded);
        }
    }

    // レイアウト再計算
    setupLobbyLayout();
});

// オーバーレイタップでサイドバーを閉じる
if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.remove('active');
        toggleButton.setAttribute('aria-expanded', false);
        toggleButton.setAttribute('aria-label', 'メニューを開く');
    });
}

parentNode.addEventListener('click', (event) => {
    event.preventDefault(); //デフォルトのリンク動作を防止
    childNodes.classList.toggle('active'); //子ノードの表示・非表示を切り替え
    const isActive = childNodes.classList.contains('active');
    parentNode.textContent = `${isActive ? '▼' : '▶'} 推しキャラランキング`; //テキストを更新
});

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

//ページを離れるときに自分のドキュメントと該当するroomsドキュメントを削除
window.addEventListener('beforeunload', async (event) => {
    if (playerDocRef && !isNavigatingToBattle) { //フラグを確認
        event.preventDefault(); //これを追加
        try {
            //自分の待機ドキュメントを削除
            await deleteDoc(playerDocRef);
            playerDocRef = null; //ドキュメント参照をリセット

            //条件に合致するroomsドキュメントを削除
            const roomQuery = query(
                roomsRef,
                where("player2_ID", "==", null),
                where("status", "==", "waiting")
            );
            const roomQuerySnapshot = await getDocs(roomQuery);

            roomQuerySnapshot.forEach(async (roomDoc) => {
                await deleteDoc(roomDoc.ref); //roomsドキュメントの削除
            });

        } catch (error) {
            console.error("Error deleting documents before unload:", error);
        }
    }
});

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

    document.getElementById('generatedId').innerText = "";
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

          NowMatching = false;
          toggleInputs(false);

          const matchButton = document.getElementById('matchButton');
          matchButton.innerText = "マッチング";
          matchButton.style.backgroundColor = "";

          document.getElementById('statusMessage').innerText =
            `${WAITING_EXPIRE_MS / 60000}分経過したのでキャンセルしました。`;
          document.getElementById('generatedId').innerText = "";

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
    const matchingRooms = querySnapshot.docs;
    
    if (matchingRooms.length > 0) {
        //ルームドキュメントの参照を初期化
        roomDocRef = matchingRooms[0].ref; //最初のマッチングルームの参照を取得
    
        if (NowMatching) {
            //マッチング解除
            removePlayerFromRoom(playerUUID);
            
            NowMatching = false; //解除時にfalseに設定
            
            toggleInputs(NowMatching); //入力を切り替え
            
        } else {
        
            //更新
            try {
                //roomDocRefを初期化
                roomDocRef = matchingRooms[0].ref; //最初のマッチングルームの参照を取得
                
                document.getElementById('generatedId').innerText = playerUUID;
                
                //更新に対する処理を記述
                listenForMatches();
                
                //既にマッチング待ちのデータがある場合、Player2として更新する。
                await updateDoc(roomDocRef, {
                    player2_ID: playerUUID, //修正: player2_IDにUUIDを設定
                    player2_CharaID: charaID,
                    player2_Name: playerName,
                    status: "in_progress"
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
                changeStone: 0
            });
            startWaitingExpireTimer(playerDocRef);
            
            document.getElementById('generatedId').innerText = playerUUID;
            
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
