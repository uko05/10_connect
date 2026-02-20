import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { db } from "./firebaseConfig.js"; // firebaseの設定ファイル

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  runTransaction,
  writeBatch,
  updateDoc,
  increment,            // ★これを追加！
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { characterData } from "./characterData.js";
import { drawPiece as _drawPiece, drawPieceWithParticles as _drawPieceWithParticles, clearPiece as _clearPiece, disp_DeleteStone as _disp_DeleteStone } from "./renderer.js";
import { APP_VERSION } from "./version.js";
import {
    chargeSound, moveSound, highlightSound, AbilityStandby,
    initializeAudioPlayback as _initializeAudioPlayback,
    setupSystemVolumeSlider
} from "./audioManager.js";
import {
    getRandomTwoNumbers as _getRandomTwoNumbers,
    getRandomThreeNumbers as _getRandomThreeNumbers,
    getTopStoneInColumn as _getTopStoneInColumn,
    getTop2Stones as _getTop2Stones,
    getRandomElements as _getRandomElements,
    changeStonesColor as _changeStonesColor,
    getStonesToChange as _getStonesToChange
} from "./abilities.js";
import { setupScaledLayout, setupMobileBoardLayout } from "./layoutScaler.js";


// バージョン表示
document.getElementById('version').textContent = APP_VERSION;

//------------------------------------------------------------------------------------------------
const toggleButton = document.getElementById('toggle-button');
const sidebar = document.getElementById('sidebar');
const parentNode = document.querySelector('.parent-node');
const childNodes = document.querySelector('.child-nodes');
const topCanvas = document.getElementById("connect4Canvas_top");
const canvas = document.getElementById('connect4Canvas');

// 初期状態でサイドバーを隠す
sidebar.classList.add('hidden');
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
    }
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
    event.preventDefault(); // デフォルトのリンク動作を防止
    childNodes.classList.toggle('active'); // 子ノードの表示・非表示を切り替え
    const isActive = childNodes.classList.contains('active');
    parentNode.textContent = `${isActive ? '▼' : '▶'} 推しキャラランキング`; // テキストを更新
});

let isInitialLoad = true; // 初期ロードかどうかを管理するフラグ

// プレイヤー情報格納
let playerLeft_ID = null;
let playerLeft_CharaID = null;
let playerLeft_ChargeNow = 0;
let playerLeft_Name = null;
let playerLeft_Color = null;
let playerLeft_Image = null;
let playerLeft_CutIn = null;
let playerLeft_Ability = null;
let playerLeft_TimeLimit = 100;
let playerLeft_UltCount = 0;

let playerRight_ID = null;
let playerRight_CharaID = null;
let playerRight_ChargeNow = 0;
let playerRight_Name = null;
let playerRight_Color = null;
let playerRight_Image = null;
let playerRight_CutIn = null;
let playerRight_Ability = null;
let playerRight_TimeLimit = 100;
let playerRight_UltCount = 0;

let roomID = null;
let turn = 0;
let playerLeft_AbilityUseTurn = 1;
let playerRight_AbilityUseTurn = 1;
let playerLeft_chargeMax = 0;
let playerRight_chargeMax = 0;
let playerLeft_chargeNum = 0;
let playerRight_chargeNum = 0;
let player_info = null;
let turnCount = 1;

let charaInfo1 = null;
let charaInfo2 = null;
  
let startP = null;

let red_Win = 0;
let yellow_Win = 0;
let changeStone = 0;

let winningflg = 0;

const img1 = document.createElement('img');
    
const abilities = {
    ult_allTopDelete,
    ult_random3TopDelete,
    ult_randomCenter2Delete,
    ult_Top2Delete,
    ult_randomAbility,
    ult_randomVerticalAllDelete,
    ult_madness,
    ult_downThinkingTime,
    ult_randomVertical1Drop
};

// 石の色
let playerColor = null;

let initialTouchY = 0; // 変数を初期化

//フィールド用
const ctx = canvas.getContext('2d');
const rows = 6;
const cols = 7;
const cellSize = 110; // セルのサイズ
let boardScale = 1; // 盤面の表示スケール（setupStageLayout で更新）
let nowCol = 3;

// 列の強調表示を制御するための要素を管理
let highlightedColumn = null;

let stonesData = null;

let selectedCharacter = false;
let ultAfter = false;

// 音声（chargeSound, moveSound, highlightSound, AbilityStandby は audioManager.js から import）

let selectSoundUrl = null;
let selectSound = null;

let systemvolumeSlider = null;
let voicevolumeSlider = null;

let playerLeft_Attack = null;
let playerRight_Attack = null;
let pLeft_Attack = null;
let pRight_Attack = null;
let playerLeft_ult = null;
let playerRight_ult = null;
let pLeft_ult = null;
let pRight_ult = null;
let audioInitialized = false; // 音声初期化フラグ

// rooms
let querySnapshot = null; // グローバル変数として定義

let timeLimitTimer = null; // 現在のタイマーIDを追跡
let timeLimit = 100; // タイムリミット（秒）
let timeRemaining = timeLimit; // 残り時間
let timeLimitGauge = document.getElementById('timeLimitGauge');

let onlyCutIn = 0;
let lastSlideCol = -1; // ②スライド中の前回列（列変化検知用）
let pendingDropCol = -1; // ① スマホ2タップ制：1回目でセット、2回目同列でdrop
//------------------------------------------------------------------------------------------------
// 要素取得
const modal = document.getElementById("helpModal");
const helpButton = document.getElementById("helpButton");
const closeModalButton = modal.querySelector(".close");
const slides = document.querySelectorAll(".slide");
const prevButton = document.querySelector(".prev-btn");
const nextButton = document.querySelector(".next-btn");

let currentSlide = 0;
//------------------------------------------------------------------------------------------------

// モーダルを開く
helpButton.addEventListener("click", () => {
  modal.style.display = "block";
});
// モーダルを閉じる
closeModalButton.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

// スライダーの操作
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

// 初期スライド更新
updateSlides();
//------------------------------------------------------------------------------------------------

// サムネイルを表示するダミー関数
async function displayThumbnails() {

    systemvolumeSlider = document.getElementById('systemvolumeSlider');
    voicevolumeSlider = document.getElementById('voicevolumeSlider');
    
    console.log("システム音量スライダー:", systemvolumeSlider);
    console.log("ボイス音量スライダー:", voicevolumeSlider);
    
    // UUIDの取得
    const player_UUID = getUUIDFromCookie(); 
      
    // ルームを検索する。
    const roomsRef = collection(db, "rooms");
    const myroom1 = query(
        roomsRef,
        where("player1_ID", "==", player_UUID)
    );
    const querySnapshotP1 = await getDocs(myroom1);
    
    const myroom2 = query(
        roomsRef,
        where("player2_ID", "==", player_UUID)
    );
    const querySnapshotP2 = await getDocs(myroom2);
    
    // どちらがPlayer1かを確認
    if (!querySnapshotP1.empty) {
        
        querySnapshotP1.forEach((doc) => {
            const data = doc.data(); // ドキュメントのデータを取得
            
            playerLeft_ID = data.player1_ID;
            playerLeft_CharaID = data.player1_CharaID;
            playerLeft_ChargeNow = data.player1_ChargeNow;
            playerLeft_Name = data.player1_Name;
            playerLeft_Color = data.player1_Color;
            playerLeft_TimeLimit = data.player1_TimeLimit;
            playerLeft_UltCount = data.player1_UltCount;
            
            playerRight_ID = data.player2_ID;
            playerRight_CharaID = data.player2_CharaID;
            playerRight_ChargeNow = data.player2_ChargeNow;
            playerRight_Name = data.player2_Name;
            playerRight_Color = data.player2_Color;
            playerRight_TimeLimit = data.player2_TimeLimit;
            playerRight_UltCount = data.player2_UltCount;
            
            roomID = data.roomID;
            startP = data.startP;
            turn = data.turn;
            changeStone = data.changeStone;
            
            red_Win = data.red_Win;
            yellow_Win = data.yellow_Win;
            
            player_info = 'P1';
            if (playerLeft_Color === 'red') {
                updateWinLabels(red_Win, yellow_Win);
                
            } else {
                updateWinLabels(yellow_Win, red_Win);
            }
        });
        
    } else {

        querySnapshotP2.forEach((doc) => {
            const data = doc.data(); // ドキュメントのデータを取得
            
            playerLeft_ID = data.player2_ID;
            playerLeft_CharaID = data.player2_CharaID;
            playerLeft_ChargeNow = data.player2_ChargeNow;
            playerLeft_Name = data.player2_Name;
            playerLeft_Color = data.player2_Color;
            playerLeft_TimeLimit = data.player2_TimeLimit;
            playerLeft_UltCount = data.player2_UltCount;
            
            playerRight_ID = data.player1_ID;
            playerRight_CharaID = data.player1_CharaID;
            playerRight_ChargeNow = data.player1_ChargeNow;
            playerRight_Name = data.player1_Name;
            playerRight_Color = data.player1_Color;
            playerRight_TimeLimit = data.player1_TimeLimit;
            playerRight_UltCount = data.player1_UltCount;
            
            roomID = data.roomID;
            startP = data.startP;
            turn = data.turn;
            changeStone = data.changeStone;
            
            red_Win = data.red_Win;
            yellow_Win = data.yellow_Win;
            
            player_info = 'P2';
            
            if (playerLeft_Color === 'red') {
                updateWinLabels(red_Win, yellow_Win);
            } else {
                updateWinLabels(yellow_Win, red_Win);
            }
        });
    }
    
    charaInfo1 = getCharacterDataByID(playerLeft_CharaID);
    charaInfo2 = getCharacterDataByID(playerRight_CharaID);
    
    // 攻撃音声
    playerLeft_Attack = charaInfo1.voice_attack;
    pLeft_Attack = new Audio(playerLeft_Attack);
    pLeft_Attack.volume = 0.2;
    
    playerRight_Attack = charaInfo2.voice_attack;
    pRight_Attack = new Audio(playerRight_Attack);
    pRight_Attack.volume = 0.2;
    
    // 必殺技音声
    playerLeft_ult = charaInfo1.voice_ult;
    pLeft_ult = new Audio(playerLeft_ult);
    pLeft_ult.volume = 0.2;
    
    playerRight_ult = charaInfo2.voice_ult;
    pRight_ult = new Audio(playerRight_ult);
    pRight_ult.volume = 0.2;
    timeLimit = isTurnPlayer() ? playerLeft_TimeLimit : playerRight_TimeLimit; 
    timeRemaining = timeLimit; 
            
    await dispP1Info(charaInfo1, playerLeft_Name);
    await dispP2Info(charaInfo2, playerRight_Name);

    playerColor = playerLeft_Color;
         
    // Firestoreのリスナーを追加
    const roomRef = doc(db, "rooms", roomID); // roomIDが適切に設定されていることを確認
    onSnapshot(roomRef, (doc) => {
        const data = doc.data();
        if (data) {
            handleRoomUpdate(); // rooms更新時に石を反映
        }
    });

    // 最後にルーム情報を再取得するクエリを設定
    const myroom = query(
        roomsRef,
        where("roomID", "==", roomID)
    );
    querySnapshot = await getDocs(myroom);
}

// 自分のキャラ情報を表示する関数
async function dispP1Info(charaInfo, player_Name) {
    
    // 自分のキャラを左側に置く
    document.getElementById('playerName_1').innerText = player_Name; // プレイヤー名を表示
    document.getElementById('charaID_1').innerText = charaInfo.name; // キャラクター名を表示
    playerLeft_chargeNum = charaInfo.charge;
    document.getElementById('charge_1').innerText = playerLeft_chargeNum; // チャージ量を表示
    document.getElementById('Ability_1').innerText = charaInfo.Ability; // 必殺技名を表示
    document.getElementById('AbilityDetail_1').innerText = charaInfo.AbilityDetail; // 必殺技内容を表示
    
    document.getElementById('chargeGageNow_1').innerText = 0; // チャージ量を表示
    document.getElementById('chargeGageMax_1').innerText = charaInfo.chargeMax; // チャージ量を表示
    
    playerLeft_AbilityUseTurn = charaInfo.AbilityUseTurn;
    playerLeft_Ability = charaInfo.process;
            
    // キャラクター画像を表示
    const thumbnailContainer = document.getElementById('thumbnailContainerP1');
    thumbnailContainer.innerHTML = ''; // 既存の内容をクリア
    img1.src = charaInfo.src; // 画像のURLを設定
    playerLeft_Image = charaInfo.src;
    img1.alt = charaInfo.name; // alt属性を設定
    img1.classList.add('character-thumbnail'); // 必要に応じてクラスを追加
    playerLeft_CutIn = charaInfo.AbilityCutImage;
    
    // 音声のURLをデータ属性として持たせる
    img1.setAttribute('data-voice', charaInfo.voice_ult); // 画像に音声のURLをセット
    
    // クリックイベントを追加
    img1.addEventListener('click', () => {
        if (!isTurnPlayer() || playerLeft_ChargeNow < 150) return;  // プレイヤーのターンとチャージが150以上かチェック
        if (playerLeft_AbilityUseTurn > turnCount) return;
        
        // 現在のキャラクターを選択/解除
        selectedCharacter = selectedCharacter ? false : true;
        console.log("selectedCharacter:", selectedCharacter);

        // selectedCharacter の状態に応じてエフェクトを適用または解除
        if (selectedCharacter) {
            // もし音声が再生中なら、停止してリセット
            const currentlyPlayingSound = document.querySelector('audio');
            if (currentlyPlayingSound && !currentlyPlayingSound.paused) {
                currentlyPlayingSound.pause();  // 音声を停止
                currentlyPlayingSound.currentTime = 0;  // 再生位置をリセット
            }

            // エフェクトを適用
            img1.classList.add('glowing-effect');   // エフェクトを追加
            img1.classList.remove('ult-effect');   // 必殺技エフェクトを削除
            img1.classList.add('selected');        // 画像選択のためのクラスを追加

            // 音声を再生
            selectSoundUrl = img1.getAttribute('data-voice'); // 音声URLを取得
            selectSound = new Audio(selectSoundUrl); // Audioオブジェクトを作成
            AbilityStandby.volume = 0.2; // 音量を30%に設定
            AbilityStandby.play().catch(err => console.error('音声の再生に失敗しました:', err));
            
            nowCol = null;
            toggleSpecialMoveButton(selectedCharacter);
            
            // すでにハイライトが存在する場合は削除
            if (highlightedColumn) {
                highlightedColumn.remove();
            }
            
        } else {
            // エフェクトを解除
            img1.classList.remove('glowing-effect');  // エフェクトを削除
            img1.classList.add('ult-effect');          // 必殺技エフェクトを再適用
            img1.classList.remove('selected');        // 画像選択のクラスを削除

            nowCol = 3;
            toggleSpecialMoveButton(selectedCharacter);

            // すでにハイライトが存在する場合は削除
            if (highlightedColumn) {
                highlightedColumn.remove();
            }
            // 必要があれば、エフェクト解除時に音声を再生
            // ここではエフェクト解除時に音声を鳴らしたい場合、追加できます
        }
    });

    thumbnailContainer.appendChild(img1); // 画像を追加
}

document.getElementById('specialMoveButton').addEventListener('click', () => {
    
    if (playerLeft_CharaID === '008' && playerLeft_UltCount >= 7) {
        // アベンチュリンの場合の専用処理
        // 通常状態に戻す
        nowCol = 3;
        toggleSpecialMoveButton(false); // ボタンを非表示にする
        
        img1.classList.remove('glowing-effect');  // エフェクトを削除
        img1.classList.remove('selected');        // 画像選択のクラスを削除
        selectedCharacter = selectedCharacter ? false : true;
        return;
    }
    
    if (playerLeft_CharaID === '005' && changeStone > 0){
        // 花火専用処理
        // 相手も花火で先に必殺技を使われた場合かぶせて使えない
        // 通常状態に戻す
        nowCol = 3;
        toggleSpecialMoveButton(false); // ボタンを非表示にする
        
        img1.classList.remove('glowing-effect');  // エフェクトを削除
        img1.classList.remove('selected');        // 画像選択のクラスを削除
        selectedCharacter = selectedCharacter ? false : true;
        return;
        
    }
    
    // 必殺技の処理をここに記述
    invokeAbility(playerLeft_Ability);
    
    // 通常状態に戻す
    nowCol = 3;
    toggleSpecialMoveButton(false); // ボタンを非表示にする
    
    img1.classList.remove('glowing-effect');  // エフェクトを削除
    img1.classList.remove('selected');        // 画像選択のクラスを削除
    selectedCharacter = selectedCharacter ? false : true;
    ultAfter = true;
});

// 相手のキャラ情報を表示する関数
async function dispP2Info(charaInfo, player_Name) {
    
    // 相手のキャラを右側に置く
    document.getElementById('playerName_2').innerText = player_Name; // プレイヤー名を表示
    document.getElementById('charaID_2').innerText = charaInfo.name; // キャラクター名を表示
    playerRight_chargeNum = charaInfo.charge;
    document.getElementById('charge_2').innerText = playerRight_chargeNum; // チャージ量を表示
    document.getElementById('Ability_2').innerText = charaInfo.Ability; // 必殺技名を表示
    document.getElementById('AbilityDetail_2').innerText = charaInfo.AbilityDetail; // 必殺技内容を表示
        
    document.getElementById('chargeGageNow_2').innerText = 0; // チャージ量を表示
    document.getElementById('chargeGageMax_2').innerText = charaInfo.chargeMax; // チャージ量を表示
    
    playerRight_AbilityUseTurn = charaInfo.AbilityUseTurn;
    playerRight_Ability = charaInfo.process;
    
    // キャラクター画像を表示
    const thumbnailContainer = document.getElementById('thumbnailContainerP2');
    thumbnailContainer.innerHTML = ''; // 既存の内容をクリア
    const img2 = document.createElement('img');
    img2.src = charaInfo.src; // 画像のURLを設定
    playerRight_Image = charaInfo.src;
    img2.alt = charaInfo.name; // alt属性を設定
    img2.classList.add('character-thumbnail'); // 必要に応じてクラスを追加
    playerRight_CutIn = charaInfo.AbilityCutImage;
    
    // 音声のURLをデータ属性として持たせる
    img2.setAttribute('data-voice', charaInfo.voice_ult); // 画像に音声のURLをセット

    thumbnailContainer.appendChild(img2); // 画像を追加
}

window.addEventListener("beforeunload", (event) => {
    // ページを離れる直前の処理
    try {
        // 非同期処理は`beforeunload`内で確実に完了しない可能性があるため注意
        updateLeaveRooms();
        //resetTimeLimit();
        //clearTimeRemaining();
    } catch (error) {
        console.error("エラー発生:", error);
    }
});

async function updateLeaveRooms() {
    const roomsRef = collection(db, "rooms");
    const q = query(
        roomsRef,
        where("roomID", "==", roomID),
        where("status", "==", "in_progress")
    );

    const updates = {
        status: "leave",
    };

    try {
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.log(
                "該当の roomID のドキュメントが存在しない、または status が in_progress ではありません。"
            );
            return;
        }

        const updatePromises = querySnapshot.docs.map((docSnapshot) =>
            updateDoc(docSnapshot.ref, updates)
        );
        await Promise.all(updatePromises);

        console.log("すべてのドキュメントの更新が完了しました。");
    } catch (error) {
        console.error("Firestoreの更新に失敗しました:", error);
    }
}

async function deleteRoomByRoomID() {
    try {
        // rooms コレクションを参照
        const roomsRef = collection(db, "rooms");

        // 条件に一致するクエリを作成
        const q = query(roomsRef, where("roomID", "==", roomID));

        // クエリを実行してドキュメントを取得
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.log("No matching room found for roomID:", roomID);
            return; // 該当ドキュメントがない場合は終了
        }

        // クエリ結果のドキュメントを削除
        querySnapshot.forEach(async (doc) => {
            await deleteDoc(doc.ref);
            console.log(`Room with roomID: ${roomID} deleted successfully`);
        });
    } catch (error) {
        console.error("Error deleting room by roomID:", error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {

    await displayThumbnails(); // サムネイルの表示
    
    backcolor_player(turn);
    watchRoomUpdates(); // リアルタイムのルーム更新を監視
    
    // ================================================================
    // クリック・スライド・タッチ イベント管理
    // ④ PC: マウスドラッグ中にハイライト追従
    //    スマホ: タッチスライド中にハイライト追従
    // ================================================================
    let isMoving = false;
    let touchStartX = 0;  // ③ タップ判定用（スライドと区別）
    let touchStartY = 0;
    const TAP_THRESHOLD = 15; // px以内ならタップと判定

    // --- topCanvas: PC マウス操作 ---
    topCanvas.addEventListener("mousedown", (event) => {
        isMoving = true;
        lastSlideCol = -1; // ②スライド列リセット
        handleMoveColumn(event);
    });
    topCanvas.addEventListener("mousemove", (event) => {
        if (isMoving) handleMoveColumnSilent(event);
    });
    topCanvas.addEventListener("mouseup", () => { isMoving = false; });

    // --- topCanvas: タッチ操作（スマホ）① 2タップ制 + ④ スライドでハイライト追従 ---
    topCanvas.addEventListener("touchstart", (event) => {
        event.preventDefault();
        isMoving = true;
        lastSlideCol = -1;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        handleMoveColumn(event);
    }, { passive: false });
    topCanvas.addEventListener("touchmove", (event) => {
        event.preventDefault();
        if (isMoving) handleMoveColumnSilent(event);
    }, { passive: false });
    topCanvas.addEventListener("touchend", (event) => {
        if (isMoving) {
            const touch = event.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartX);
            const dy = Math.abs(touch.clientY - touchStartY);
            if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
                // ① タップ判定 → 2タップ制で石投下
                handleTouchTap(event);
            }
        }
        isMoving = false;
    });

    // --- topCanvas: クリック（single click → 列移動） ---
    topCanvas.addEventListener("click", (event) => {
        if (!selectedCharacter) {
            handleMoveColumn(event);
        }
    });

    // --- topCanvas: ダブルクリック（石を落とす） ---
    topCanvas.addEventListener("dblclick", (event) => {
        if (!selectedCharacter) {
            if (winningflg == 0){
                handleStoneDrop(event);
            }
        }
    });

    // --- canvas（盤面）: PC マウス操作 ---
    canvas.addEventListener("mousedown", (event) => {
        if (!selectedCharacter) {
            isMoving = true;
            lastSlideCol = -1; // ②スライド列リセット
            handleMoveColumn(event);
        }
    });
    canvas.addEventListener("mousemove", (event) => {
        if (!selectedCharacter && isMoving) handleMoveColumnSilent(event);
    });
    canvas.addEventListener("mouseup", () => { isMoving = false; });

    // --- canvas: タッチ操作（スマホ）① 2タップ制 + ④ スライドでハイライト追従 ---
    canvas.addEventListener("touchstart", (event) => {
        if (!selectedCharacter) {
            event.preventDefault();
            isMoving = true;
            lastSlideCol = -1;
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
            handleMoveColumn(event);
        }
    }, { passive: false });
    canvas.addEventListener("touchmove", (event) => {
        if (!selectedCharacter) {
            event.preventDefault();
            if (isMoving) handleMoveColumnSilent(event);
        }
    }, { passive: false });
    canvas.addEventListener("touchend", (event) => {
        if (!selectedCharacter && isMoving) {
            const touch = event.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartX);
            const dy = Math.abs(touch.clientY - touchStartY);
            if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
                // ① タップ判定 → 2タップ制で石投下
                handleTouchTap(event);
            }
        }
        isMoving = false;
    });

    // --- canvas: クリック（single click → 列移動） ---
    canvas.addEventListener("click", (event) => {
        if (!selectedCharacter) {
            handleMoveColumn(event);
        }
    });

    // --- canvas: ダブルクリック（石を落とす） ---
    canvas.addEventListener("dblclick", (event) => {
        if (!selectedCharacter) {
            if (winningflg == 0){
                handleStoneDrop(event);
            }
        }
    });
    
    loadTimeRemaining(); // 残り時間をローカルストレージから復元
    console.log("初期処理:", timeRemaining);
    timeLimitTimer = setInterval(updateTimeLimit, 1000); // タイマーを開始
    
    // 初回クリックで音声を初期化
    document.addEventListener('click', initializeAudioPlayback, { once: true });
    
    // スライダーのイベントリスナーを設定
    setupSystemVolumeSlider(systemvolumeSlider);

    if (voicevolumeSlider) {
        voicevolumeSlider.addEventListener('input', (event) => {
            const newVolume = parseFloat(event.target.value); // 数値として取得
            if (selectSound) selectSound.volume = newVolume; // 音量を更新
            if (pLeft_Attack) pLeft_Attack.volume = newVolume; // 音量を更新
            if (pRight_Attack) pRight_Attack.volume = newVolume; // 音量を更新
            if (pLeft_ult) pLeft_ult.volume = newVolume; // 音量を更新
            if (pRight_ult) pRight_ult.volume = newVolume; // 音量を更新
        });
    } else {
        console.error("voicevolumeSlider が見つかりません");
    }
});

function initializeAudioPlayback() {
    _initializeAudioPlayback([pLeft_Attack, pRight_Attack, pLeft_ult, pRight_ult]);
}

//------------------------------------------------------------------------------------------------

// スマホ時はCSS実寸レイアウト（transform:scale不使用）で盤面を最大化
const isMobileLayout = window.matchMedia('(max-width: 1024px)').matches;
let refreshBoardLayout; // 手動再計算用
if (isMobileLayout) {
    // スマホ: CSS実寸でレイアウト（transform:scaleを使わない）
    // bufferWidth=770, bufferHeight=660, topCanvasBufferH=110, timerBaseH=30
    // 全体アスペクト比 770:(110+660+30)=770:800
    refreshBoardLayout = setupMobileBoardLayout('boardWrap', cellSize * cols, cellSize * rows, 110, 30, (scale) => {
        boardScale = scale;
    });
} else {
    // PC: transform:scale + 固定baseHeight
    const baseH = 110 + 660 + 30;
    refreshBoardLayout = setupScaledLayout('boardWrap', cellSize * cols, baseH, (scale) => {
        boardScale = scale;
    });
}

//------------------------------------------------------------------------------------------------

function highlightColumn(col) {
    // boardWrap の rect を基準に（canvas と同じ幅でスケール後の見た目座標）
    const boardWrap = document.getElementById('boardWrap');
    const wrapRect = boardWrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // すでにハイライトが存在する場合は削除
    if (highlightedColumn) {
        highlightedColumn.remove();
    }

    // 新しいハイライト要素を作成
    highlightedColumn = document.createElement('div');
    highlightedColumn.classList.add('column', 'selected');

    // ハイライトのスタイルを設定（boardWrap基準でscale後の見た目座標を使用）
    const colWidth = wrapRect.width / cols;
    highlightedColumn.style.position = 'fixed';
    highlightedColumn.style.width = `${colWidth}px`;
    highlightedColumn.style.height = `${canvasRect.height}px`;
    highlightedColumn.style.left = `${wrapRect.left + col * colWidth}px`;
    highlightedColumn.style.top = `${canvasRect.top}px`;
    highlightedColumn.style.pointerEvents = 'none';

    // 背景色とシャドウ色を動的に設定
    let shadowColor;
    let backgroundColor;

    if (selectedCharacter) {
        if (playerColor === 'red') {
            shadowColor = 'rgba(255, 0, 0, 0.6)';
            backgroundColor = 'rgba(255, 0, 0, 0.2)';
        } else {
            shadowColor = 'rgba(255, 255, 0, 0.6)';
            backgroundColor = 'rgba(255, 255, 0, 0.2)';
        }
    } else {
        shadowColor = 'rgba(0, 255, 0, 0.6)';
        backgroundColor = 'rgba(0, 255, 0, 0.2)';
    }

    highlightedColumn.style.backgroundColor = backgroundColor;
    highlightedColumn.style.setProperty('--shadow-color', shadowColor); // カスタムプロパティを設定

    // ボード全体の親要素に追加
    document.body.appendChild(highlightedColumn);
}

// handleMoveColumnを更新して列の強調表示を追加
// ③ boardWrap.getBoundingClientRect() 基準で列判定（transform:scale()補正対応）
function handleMoveColumn(event) {
    // ターンプレイヤーか確認
    if (isTurnPlayer()) {
        moveSound.play();
        const col = getColumnFromEvent(event);
        if (col < 0 || col >= cols) return; // 範囲外は無視

        // 列の強調表示
        highlightColumn(col);

        // 石を移動
        moveStoneToColumn(col);
    }
}

// ② スライド中にハイライト更新 + 列が変わった瞬間だけSEを鳴らす
function handleMoveColumnSilent(event) {
    if (isTurnPlayer()) {
        const col = getColumnFromEvent(event);
        if (col < 0 || col >= cols) return;
        // ② 列が変わった時だけSEを鳴らす（同じ列なら連打しない）
        if (col !== lastSlideCol) {
            lastSlideCol = col;
            moveSound.currentTime = 0;
            moveSound.play().catch(() => {});
        }
        highlightColumn(col);
        moveStoneToColumn(col);
    }
}

// ③ イベント座標から列番号を取得（boardWrap基準・scale補正あり）
function getColumnFromEvent(event) {
    // タッチイベントの場合は touches[0] / changedTouches[0] から座標を取得
    // touchend では touches が空なので changedTouches を使う
    const clientX = event.touches && event.touches.length > 0
        ? event.touches[0].clientX
        : event.changedTouches && event.changedTouches.length > 0
            ? event.changedTouches[0].clientX
            : event.clientX;
    const boardWrap = document.getElementById('boardWrap');
    const rect = boardWrap.getBoundingClientRect();
    // rect は scale 適用後の見た目座標なので、そのまま使える
    // scale 後の1列幅 = rect.width / cols
    const col = Math.floor((clientX - rect.left) / (rect.width / cols));

    // デバッグログ（スマホ時のみ）
    if (isMobileLayout) {
        console.log('[Column Debug]', {
            clientX,
            rectLeft: rect.left,
            rectWidth: rect.width,
            boardScale,
            col,
        });
    }
    return col;
}

// ① スマホ2タップ制：1回目=ハイライト更新、2回目同列=石投下
function handleTouchTap(event) {
    if (!isTurnPlayer()) return;
    if (winningflg != 0) return;

    const col = getColumnFromEvent(event);
    if (col < 0 || col >= cols) return;

    if (pendingDropCol === col) {
        // 2回目タップ：同じ列 → 石を落とす
        pendingDropCol = -1;
        dropStone(col);
    } else {
        // 1回目タップ（or 別列タップ）：ハイライト更新のみ
        pendingDropCol = col;
        highlightColumn(col);
        moveStoneToColumn(col);
    }
}

// 石を移動させる関数
function moveStoneToColumn(col) {
    // colの位置に石を表示
    nowCol = col;
    
    disp_TopStone(turn, nowCol); // 上部の石の状態を更新
}

//------------------------------------------------------------------------------------------------

async function watchRoomUpdates() {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID));

    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            return;
        }

        snapshot.forEach(async (doc) => {
            const data = doc.data();

            // 部屋のステータスが "leave" になった場合の処理
            if (data.status === "leave") {
                console.log("対戦相手が部屋を離れました。試合を中断します。");

                // 試合を終了してキャラクター画面に戻す処理
                displayLeaveMessage();

                // ■■■■■2026/01/10　追加
                if (player_info === "P1") await deleteRoomByRoomID();
                return;
            }

            // ■■■■■2026/01/10　追加
            const isCleaner = (player_info === "P1");

            const myTimeout =
              (player_info === "P1")
                ? (data.player1_TimeoutCount ?? 0)
                : (data.player2_TimeoutCount ?? 0);

            const enemyTimeout =
              (player_info === "P1")
                ? (data.player2_TimeoutCount ?? 0)
                : (data.player1_TimeoutCount ?? 0);

            if (enemyTimeout >= 2) {
              console.log("相手が2回時間切れ。勝利として終了します。");
              displayVictory(playerLeft_Color);
              if (isCleaner) await deleteRoomByRoomID();
              return;
            }

            if (myTimeout >= 2) {
              console.log("自分が2回時間切れ。敗北として終了します。");
              displayVictory(playerRight_Color);
              if (isCleaner) await deleteRoomByRoomID();
              return;
            }

            playerLeft_ChargeNow = player_info === 'P1' ? data.player1_ChargeNow : data.player2_ChargeNow;
            playerRight_ChargeNow = player_info === 'P1' ? data.player2_ChargeNow : data.player1_ChargeNow;

            // ② TimeLimit・turn を Firestore の最新値で更新（resetTimeLimit より先に実行）
            playerLeft_TimeLimit = player_info === 'P1' ? data.player1_TimeLimit : data.player2_TimeLimit;
            playerRight_TimeLimit = player_info === 'P1' ? data.player2_TimeLimit : data.player1_TimeLimit;
            turn = data.turn; // ② resetTimeLimit 内の isTurnPlayer() が正しいターンで判定できるよう先に更新

            // 初回ロード時はタイマーリセットしない
            if (isInitialLoad) {
                isInitialLoad = false;
            } else {
                // ② TimeLimit・turn 更新後にリセット（正しい値でタイマーが再開される）
                resetTimeLimit();
                // すでにハイライトが存在する場合は削除
                if (highlightedColumn) {
                    highlightedColumn.remove();
                }
            }
            
            // 相手がULTを使ったときにカットインだけでも出したいなぁ
            let check_UltCount = player_info === 'P1' ? data.player2_UltCount : data.player1_UltCount;
            
            console.log("▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼");
            console.log("現在のターン数：", data.turnCount);
            console.log("ターンプレイヤー：", data.turn);
            console.log("必殺技判定　前：", check_UltCount);
            console.log("必殺技判定　後：", playerRight_UltCount);
            
            if (playerRight_UltCount === check_UltCount) {
            
            } else {
                if (onlyCutIn == 0) {
                    console.log("★相手が必殺技を使いました。");
                    // カットイン終了後に必殺技の関数を実行
                    isTurnPlayerUltVoice();
                    disp_TopStone(turn, nowCol);

                    // カットインを表示し、終了を待機
                    playerRight_UltCount = check_UltCount; // ■■■■■2026/01/10　追加
                    await showCutIn();
                    onlyCutIn = 1;
                    return;

                } else {
                    onlyCutIn = 0;
                    console.log("●自分が必殺技を使いました。");
                }
            }
            playerRight_UltCount = player_info === 'P1' ? data.player2_UltCount : data.player1_UltCount;
            
            turnCount = data.turnCount;
            stonesData = data.stones || {};
            turn = data.turn;
            changeStone = data.changeStone;
            
            if (!ultAfter) init_drawBoard();
            updateGauge();
            
            // 全てのフィールドが埋まっているときはランダムな列を削除する
            handleFullBoard(stonesData);

            console.log("カットインフラグ：", onlyCutIn);
            console.log("ターンフラグ：", isTurnPlayer());
            
            let stoneUpdated = false;
            
            for (const key in stonesData) {
              if (stonesData[key].turnCount === turnCount - 1 && !ultAfter) {
                const [column, row] = key.split('_').map(Number);
                const color = stonesData[key].color;

                animateStoneDrop(column, row, color);
                stoneUpdated = true;

                // 相手の手ならボイス
                const myColor = playerLeft_Color;
                const isEnemyMove = (color !== myColor);

                if (isEnemyMove) {
                  // ① 相手の攻撃ボイス（デバッグログ付き）
                  if (pRight_Attack) {
                    pRight_Attack.currentTime = 0;
                    pRight_Attack.play().then(() => {
                      console.log('[Voice] 相手攻撃ボイス再生成功', { src: pRight_Attack.src, turn, color });
                    }).catch((err) => {
                      console.warn('[Voice] 相手攻撃ボイス再生失敗', { err: err.message, src: pRight_Attack.src, turn, color });
                    });
                  } else {
                    console.warn('[Voice] pRight_Attack が未設定');
                  }
                  // 石が落ちた音
                  moveSound.currentTime = 0;
                  moveSound.play().catch(()=>{});
                }
              }
            }

            // 勝利した色の石を格納する。
            const result = checkWin(stonesData);
            
            if ((result.red || result.yellow)) {
            
                console.log("↓↓↓↓↓↓↓↓↓↓↓");
                console.log("勝利判定①");
                
                // 勝敗ラベル表示中は石を落とせないようにフラグを立てる。
                winningflg = 1;
                
                if (result.red && result.yellow) {
                
                    console.log("◆判定:引き分け");
                    
                    // ◆引き分け                        
                    await Promise.all([
                        highlightWinningCells(result.red),
                        highlightWinningCells(result.yellow)
                    ]);
                    
                    // DRAWの場合はランダムで先行後攻を決める
                    startP = (crypto.getRandomValues(new Uint8Array(1))[0] % 2) === 0 ? 'P1' : 'P2';
                    
                } else if (result.red && !result.yellow) {
                
                    console.log("◆判定:赤勝利");
                    
                    // ◆赤が勝ち
                    await highlightWinningCells(result.red);
                    red_Win += 1;
                    if (playerLeft_Color === 'red') {
                        startP = player_info === 'P1' ? 'P2' : 'P1';
                        
                        // ラベル更新
                        updateWinLabels(red_Win, yellow_Win);
            
                    } else {
                        startP = player_info;
                        // ラベル更新
                        updateWinLabels(yellow_Win, red_Win);
            
                    }
                } else if (!result.red && result.yellow) {
                
                    console.log("◆判定:黄色勝利");
                    
                    // ◆黄が勝ち   
                    await highlightWinningCells(result.yellow);
                    
                    yellow_Win += 1;
                    if (playerLeft_Color === 'yellow') {
                        startP = player_info === 'P1' ? 'P2' : 'P1';
                        // ラベル更新
                        updateWinLabels(yellow_Win, red_Win);
            
                    } else {
                        startP = player_info;
                        // ラベル更新
                        updateWinLabels(red_Win, yellow_Win);
            
                    }
                }
                
                // 勝利したときのラベル表示（YOU WIN:YOU LOSE）
                await showWinner(result);
                
                console.log("↑↑↑↑↑↑↑↑↑↑↑");
            } 
            
            if (red_Win === 3 || yellow_Win === 3) {
                console.log("◆◆◆◆◆◆◆◆◆◆◆");
                console.log("勝利判定②");
                const winningColor = red_Win === 3 ? "red" : "yellow";
                displayVictory(winningColor); // 勝利画面を表示
                resetTimeLimit();
                console.log("◆◆◆◆◆◆◆◆◆◆◆");
                return; // この後の処理をスキップ
            }
            
            // ターンプレイヤーのみ処理を行う（二重更新対策）
            if (result.red || result.yellow) {
            
                console.log("●●●●●●●●●●●");
                
                if (!isTurnPlayer()) {
                    await deleteStonesAndUpdate();
                    console.log("Roomsコレクション石初期化");
                }
                disp_DeleteStone();
                
                showTurnLabel();
                disp_TopStone(turn, nowCol);
                init_drawBoard();
                
                // 画面リセットしたのでフラグを戻す。
                winningflg = 0;
                
                console.log("〇〇〇〇〇〇〇〇〇〇〇");
                
            } else {
                showTurnLabel();
                disp_TopStone(turn, nowCol);
            }
            
            // 初期化処理
            if (!ultAfter) loadTimeRemaining(); // ページ読み込み時に保存されている残り時間を取得
            createMemoryMarks();  // メモリ線を作成
            //updateTimeLimit();    // タイムリミットの更新開始

            console.log("▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲");
            
        });
    });
}

async function deleteStonesAndUpdate() {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID));
    const updates = {
        stones: {},                  // stonesのリセット
        turnCount: 1,                // ターンカウントのリセット
        startP: startP,
        turn: startP,
        red_Win: red_Win,        // 赤プレイヤー勝利数
        yellow_Win: yellow_Win,         // 黄プレイヤー勝利数
        changeStone: 0
    };

    try {
        // query で取得したドキュメントに対して更新を行う
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            // ドキュメントが存在する場合は updateDoc または setDoc を実行
            querySnapshot.forEach(async (docSnapshot) => {
                await updateDoc(docSnapshot.ref, updates);
            });
            console.log("ゲージがリセットされました。次の試合に移行します。");
        } else {
            console.log("該当の roomID のドキュメントが存在しません。");
        }
    } catch (error) {
        console.error("Firestoreの更新に失敗しました:", error);
    }
    console.log("・deleteStonesAndUpdate");
}

// 2秒待つ関数
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//// ターンを表示するための関数
//async function showTurnLabel() {
//    
//    const turnLabel = document.getElementById("turnLabel");
//    let turnlbl = null;
//
//    if (isTurnPlayer()) {
//        turnlbl = "自分のターン";
//
//        if (turn === startP) {
//            // 赤側グラデーション
//            turnLabel.style.background = "linear-gradient(90deg, rgba(255, 0, 0, 0.8), rgba(255, 100, 100, 0.8))";
//        } else {
//            // 黄色側グラデーション
//            turnLabel.style.background = "linear-gradient(90deg, rgba(255, 255, 0, 0.8), rgba(255, 200, 50, 0.8))";
//        }
//    } else {
//        turnlbl = "相手のターン";
//
//        if (turn === startP) {
//            // 赤側グラデーション
//            turnLabel.style.background = "linear-gradient(90deg, rgba(255, 0, 0, 0.8), rgba(255, 100, 100, 0.8))";
//        } else {
//            // 黄色側グラデーション
//            turnLabel.style.background = "linear-gradient(90deg, rgba(255, 255, 0, 0.8), rgba(255, 200, 50, 0.8))";
//        }
//    }
//
//    turnLabel.innerHTML = `${turnlbl} <br> ${turnCount}ターン目`;
//
//    // フェードイン
//    turnLabel.style.display = "block"; // 初めに表示状態に
//    setTimeout(() => {
//        turnLabel.style.opacity = 1; // 透明度を1にしてフェードイン
//    }, 10); // 少し遅れて実行（レイアウトを反映させるため）
//
//    // 3秒後にフェードアウト
//    setTimeout(() => {
//        turnLabel.style.opacity = 0; // 透明度を0にしてフェードアウト
//    }, 1000); // 1秒後にフェードアウト
//
//    // フェードアウト後に完全に非表示
//    setTimeout(() => {
//        turnLabel.style.display = "none"; // 透明度が0になったら非表示
//    }, 1500); // フェードアウト後に少し待ってから非表示
//}

// ターンを表示するための関数
async function showTurnLabel() {
  const turnLabel = document.getElementById("turnLabel");

  const isMyTurn = isTurnPlayer();
  const turnlbl = isMyTurn ? "自分のターン" : "相手のターン";

  // ★ここが本体：今ターンの色を決める
  const turnColor = (turn === player_info) ? playerLeft_Color : playerRight_Color;

  if (turnColor === "red") {
    // 赤側グラデーション
    turnLabel.style.background =
      "linear-gradient(90deg, rgba(255, 0, 0, 0.8), rgba(255, 100, 100, 0.8))";
  } else {
    // 黄色側グラデーション
    turnLabel.style.background =
      "linear-gradient(90deg, rgba(255, 255, 0, 0.8), rgba(255, 200, 50, 0.8))";
  }

  turnLabel.innerHTML = `${turnlbl} <br> ${turnCount}ターン目`;

  // フェードイン
  turnLabel.style.display = "block";
  setTimeout(() => (turnLabel.style.opacity = 1), 10);

  // 1秒後にフェードアウト
  setTimeout(() => (turnLabel.style.opacity = 0), 1000);

  // 非表示
  setTimeout(() => (turnLabel.style.display = "none"), 1500);
}

function handleStoneDrop(event) {
    // ターンプレイヤーか確認
    if (isTurnPlayer()) {
        dropStone(nowCol);
    }
}

// ターンプレイヤーか確認する関数
function isTurnPlayer() {
    return (player_info === turn); 
}

// ターンプレイヤーか確認する関数
function isTurnChargeNum(player) {
    let rtnNum = 0;
    if (player_info === player) {
        rtnNum = playerLeft_chargeNum;
    } else {
        rtnNum = playerRight_chargeNum;
    }
    return rtnNum;
}

function checkIfAllColumnsFull(stonesData) {
    const columns = [0, 1, 2, 3, 4, 5, 6]; // 確認する列番号

    // すべての列に対して確認
    for (let column of columns) {
        const availableRow = findAvailableRow(column, stonesData);
        
        // もし1つでも空いている行があれば、全て埋まっていないことになる
        if (availableRow !== -1) {
            return false; // 少なくとも1つの列が空いている
        }
    }

    // すべての列が埋まっている
    return true;
}

function handleFullBoard(stonesData) {
    if (checkIfAllColumnsFull(stonesData)) {
        console.log("すべての列が埋まりました。特定の処理を実行します。");
        ult_randomVerticalAllDelete();
        return;
        
    } else {
        console.log("まだ空いている列があります。");
    }
}

// 1. 指定カラムの一番下を調べる関数
function findAvailableRow(column, stonesData) {
    let row = 0;
    while (row < rows && stonesData[`${column}_${row}`] == null) {
        row++;
    }
    return row - 1; // 最後に石を置ける行を返す
}

// attackType: 1=通常, 2=必殺技等, 3=時間切れ
async function dropStone(column, attackType = 1) {

  let color = playerLeft_Color;
  if (changeStone > 0) {
    color = color === 'red' ? 'yellow' : 'red';
  }

  const row = await findAvailableRow(column, stonesData);
  if (row < 0) return;

  animateStoneDrop(column, row, color);

  const chargeNum = isTurnChargeNum(turn);

  // ★ attackType を渡す
  await updateRoomWithStone(column, row, color, turnCount, chargeNum, attackType);

  // ★ サウンドは「通常攻撃のみ」
  if (attackType === 1 && !ultAfter) {
    pLeft_Attack.currentTime = 0;
    pLeft_Attack.play();

    updateGauge();
    chargeSound.currentTime = 0;
    chargeSound.play();

  } else {
    if (ultAfter) {
      console.log("ultAfterを通常に戻しました。");
      ultAfter = false;
    }
  }

  await wait(1000);
}

function isTurnPlayerAttackVoice() {
    if (isTurnPlayer()) {
        pLeft_Attack.play().catch((error) => {
            console.error("Failed to play left attack voice:", error);
        });
    } else {
        pRight_Attack.play().catch((error) => {
            console.error("Failed to play right attack voice:", error);
        });
    }
}

function isTurnPlayerUltVoice() {
    if (isTurnPlayer()) {
        pLeft_ult.play().catch((error) => {
            console.error("Failed to play left ult voice:", error);
        });
    } else {
        pRight_ult.play().catch((error) => {
            console.error("Failed to play right ult voice:", error);
        });
    }
}

//async function updateRoomWithStone(column, row, playerColor, turnCount, chargeNum, normalAttack = true) {
//
//    // rooms コレクションから roomID フィールドで一致するドキュメントを取得
//    const roomsRef = collection(db, "rooms");
//    const q = query(roomsRef, where("roomID", "==", roomID));  // roomIDが一致するドキュメントを検索
//    const querySnapshot = await getDocs(q);
//    let p1_chargeNow, p2_chargeNow, p1_UltCount, p2_UltCount;
//    let isturn = turn === 'P1' ? 'P2' : 'P1';
//    
//    if (querySnapshot.empty) {
//        return; // データが見つからない場合は処理を中断
//    }
//
//    // ドキュメントが見つかった場合のみ更新処理を実行
//    querySnapshot.forEach(async (doc) => {
//        // ドキュメントデータを取得
//        const roomData = doc.data();
//        
//        if(!normalAttack) {
//            // ULT攻撃
//            console.log("●必殺技攻撃", player_info);
//            [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false); // roomData を渡す
//            [p1_UltCount, p2_UltCount] = await getUltCount(roomData, false);
//            changeStone = roomData.changeStone;
//            
//            // ホタル専用の処理
//            if (playerLeft_CharaID === '009') isturn = isturn === 'P1' ? 'P2' : 'P1';
//            
//        } else if(ultAfter) {
//            // 必殺技直後の通常攻撃
//            console.log("●必殺技直後の通常攻撃", player_info);
//            [p1_chargeNow, p2_chargeNow] = await getcharge(roomData); // roomData を渡す
//            [p1_UltCount, p2_UltCount] = await getUltCount(roomData);
//            changeStone = roomData.changeStone > 0 ? roomData.changeStone - 1 : 0;
//            
//        } else {
//            // 通常攻撃
//            console.log("●通常攻撃", player_info);
//            [p1_chargeNow, p2_chargeNow] = await getcharge(roomData); // roomData を渡す
//            [p1_UltCount, p2_UltCount] = await getUltCount(roomData);
//            changeStone = roomData.changeStone > 0 ? roomData.changeStone - 1 : 0;
//            
//        }
//        // Firestoreに更新処理を実行
//        await updateDoc(doc.ref, {
//            player1_ChargeNow: p1_chargeNow,
//            player1_UltCount: p1_UltCount,
//            player2_ChargeNow: p2_chargeNow,
//            player2_UltCount: p2_UltCount,
//            [`stones.${column}_${row}`]: {
//                color: playerColor,
//                turnCount: turnCount // ターン情報を追加
//            },
//            turn: isturn,
//            turnCount: turnCount + 1, // 現在のターン数を更新
//            changeStone: changeStone
//        });
//        
//    });
//}

async function updateRoomWithStone(column, row, playerColor, turnCount, chargeNum, attackType) {

  if (attackType === 3) {
    await updateRoomWithStone_timeoutTx(column, playerColor);
    return;
  }
  
  const roomsRef = collection(db, "rooms");
  const q = query(roomsRef, where("roomID", "==", roomID));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) return;

  for (const docSnap of querySnapshot.docs) {

    const roomData = docSnap.data();

    let p1_chargeNow, p2_chargeNow, p1_UltCount, p2_UltCount;

    // 次のターン（基本は交代）
    let nextTurn = (roomData.turn === "P1") ? "P2" : "P1";


    // ★changeStoneはローカルで持つ（安全）
    let nextChangeStone = roomData.changeStone ?? 0;

    if (attackType === 2) {
      // ULT攻撃
      console.log("●必殺技攻撃", player_info);

      [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false);
      // UltCount の加算は ult_CntUP() で済み。ここでは現在値を取得するだけ
      [p1_UltCount, p2_UltCount] = await getUltCount(roomData, true);
      nextChangeStone = roomData.changeStone ?? 0;

      // ホタル専用（ターン継続？）
      if (playerLeft_CharaID === "009") {
        nextTurn = (nextTurn === "P1") ? "P2" : "P1";
      }

    } else if (ultAfter) {
      // 必殺技直後の通常攻撃
      console.log("●必殺技直後の通常攻撃", player_info);

      [p1_chargeNow, p2_chargeNow] = await getcharge(roomData);
      [p1_UltCount, p2_UltCount] = await getUltCount(roomData);
      nextChangeStone = (roomData.changeStone ?? 0) > 0 ? (roomData.changeStone - 1) : 0;

    } else {
      // 通常攻撃 or 時間切れ
      [p1_chargeNow, p2_chargeNow] = await getcharge(roomData);
      [p1_UltCount, p2_UltCount] = await getUltCount(roomData);
      nextChangeStone = (roomData.changeStone ?? 0) > 0 ? (roomData.changeStone - 1) : 0;
    }
    if (roomData.turn !== player_info) {
      console.warn("自分のターンじゃないので中断");
      continue;
    }
    const stones = roomData.stones || {};
    if (stones[`${column}_${row}`]) {
      console.warn("row競合検知: サーバー上では埋まってたので中断");
      continue;
    }

    const currentTurnCount = roomData.turnCount ?? 1;

    const updatePayload = {
      player1_ChargeNow: p1_chargeNow,
      player1_UltCount: p1_UltCount,
      player2_ChargeNow: p2_chargeNow,
      player2_UltCount: p2_UltCount,
      [`stones.${column}_${row}`]: {
        color: playerColor,
        turnCount: currentTurnCount
      },
      turn: nextTurn,
      turnCount: currentTurnCount + 1,
      changeStone: nextChangeStone
    };

    await updateDoc(docSnap.ref, updatePayload);
  }
}

//--------------------------------------------------------------------------------
// 時間切れ関係（Tx版・ログ/例外ハンドリング付き・increment import前提）
// 戻り値: true=書き込みした / false=書き込み無し（ターン不一致・満杯・room無し等）
async function updateRoomWithStone_timeoutTx(column, playerColor) {
  try {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID));
    const qs = await getDocs(q);

    if (qs.empty) {
      console.warn("[timeoutTx] roomが見つからない", { roomID });
      return false;
    }

    const roomRef = qs.docs[0].ref;

    let didUpdate = false;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);

      if (!snap.exists()) {
        console.warn("[timeoutTx] snapが存在しない", { roomID });
        return;
      }

      const data = snap.data();

      // ★サーバー上で「今ほんとに自分のターンか」を確認
      if (data.turn !== player_info) {
        console.warn("[timeoutTx] ターン不一致で中断", {
          serverTurn: data.turn,
          me: player_info,
          serverTurnCount: data.turnCount,
        });
        return;
      }

      const stones = data.stones || {};

      // ★サーバーのstonesで row を決める
      const row = findAvailableRowFromStones(column, stones);
      if (row < 0) {
        console.warn("[timeoutTx] 列が満杯で中断", { column });
        return;
      }

      const currentTurnCount = data.turnCount ?? 1;
      const nextTurn = (data.turn === "P1") ? "P2" : "P1";

      const nextChangeStone =
        (data.changeStone ?? 0) > 0 ? (data.changeStone - 1) : 0;

      const timeoutField =
        (player_info === "P1") ? "player1_TimeoutCount" : "player2_TimeoutCount";

      console.log("[timeoutTx] 更新実行", {
        column,
        row,
        color: playerColor,
        currentTurnCount,
        nextTurn,
        nextChangeStone,
        timeoutField,
      });

      tx.update(roomRef, {
        [`stones.${column}_${row}`]: {
          color: playerColor,
          turnCount: currentTurnCount,
        },
        turn: nextTurn,
        turnCount: currentTurnCount + 1,
        changeStone: nextChangeStone,
        [timeoutField]: increment(1),
      });

      didUpdate = true;
    });

    console.log("[timeoutTx] runTransaction 完了", { didUpdate });
    return didUpdate;

  } catch (e) {
    console.error("[timeoutTx] 例外で失敗", e);
    return false;
  }
}

function findAvailableRowFromStones(column, stones) {
  for (let r = rows - 1; r >= 0; r--) {
    if (!stones[`${column}_${r}`]) return r;
  }
  return -1;
}

//--------------------------------------------------------------------------------

// 3. roomsが更新されたときに動く処理
function handleRoomUpdate() {

    // 最新のstonesデータから石を落とすアニメーションを実行
    for (let key in stonesData) {
        const [column, row] = key.split('_').map(Number);
        const playerColor = stonesData[key];

        // アニメーションで石を落とす
        animateStoneDrop(column, row, playerColor);
    }
}

// 石が落ちるアニメーションを実行する関数
function animateStoneDrop(column, row, playerColor) {
    let currentY = 0;
    const targetY = row * cellSize;
    const dropSpeed = 10;
    const dropInterval = 10;

    const dropAnimation = setInterval(() => {
        if (currentY < targetY) {
            currentY += dropSpeed;

            // 背景と石を描画
            init_drawBoard();
            drawPiece(column, Math.min(currentY, targetY), playerColor);
        } else {
            clearInterval(dropAnimation);
            drawPiece(column, targetY, playerColor); // 最終位置に石を描画
        }
    }, dropInterval);
    
}

// 部屋のドキュメントを取得する関数
async function getRoomDocument() {
    querySnapshot = await getDocs(collection(db, "rooms")); // dbを利用
    
    playerLeft_ChargeNow = querySnapshot.docs[0].player1_ChargeNow;
    playerRight_ChargeNow = querySnapshot.docs[0].player2_ChargeNow;
    return querySnapshot.docs[0];
}

// 指定位置の石を消去する関数
function clearPiece(column, row) {
    _clearPiece(ctx, column, row, cellSize);
}

async function switchTurn() {
    turn = turn === 'P1' ? 'P2' : 'P1';
    pendingDropCol = -1; // ① ターン切替時に2タップ制リセット

    if (!querySnapshot || querySnapshot.empty) {
        return; // 処理を中断
    }

    // Firestoreのドキュメントにターンを更新
    await Promise.all(querySnapshot.docs.map(doc => updateDoc(doc.ref, { turn: turn })));
}

//------------------------------------------------------------------------------------------------

function updateGauge() {
    const gauge1 = document.getElementById('playerGauge1');
    document.getElementById('chargeGageNow_1').innerText = playerLeft_ChargeNow; // チャージ量を表示
    const heightPercent1 = Math.min((playerLeft_ChargeNow / 200) * 100, 100); // 最大で100%まで
    gauge1.style.height = heightPercent1 + "%";

    if (playerLeft_ChargeNow >= 150) {
        gauge1.style.backgroundColor = "#f00"; // 最大で赤
    } else if (playerLeft_ChargeNow >= 75) {
        gauge1.style.backgroundColor = "#ffbb00"; 
    } else if (playerLeft_ChargeNow < 75) {
        gauge1.style.backgroundColor = "#1eff00";
    }
    
    const gauge2 = document.getElementById('playerGauge2');
    document.getElementById('chargeGageNow_2').innerText = playerRight_ChargeNow; // チャージ量を表示
    const heightPercent2 = Math.min((playerRight_ChargeNow / 200) * 100, 100); // 最大で100%まで
    gauge2.style.height = heightPercent2 + "%";
    
    if (playerRight_ChargeNow >= 150) {
        gauge2.style.backgroundColor = "#f00"; // 最大で赤
    } else if (playerRight_ChargeNow >= 75) {
        gauge2.style.backgroundColor = "#ffbb00"; 
    } else if (playerRight_ChargeNow < 75) {
        gauge2.style.backgroundColor = "#1eff00";
    }
}

//------------------------------------------------------------------------------------------------

// 石を削除する
function disp_DeleteStone() {
    _disp_DeleteStone(ctx, canvas);
}

// TOPに石を表示する
function disp_TopStone(turn, col) {

    // 石を描画する処理（PC/スマホ共通 — バッファは常に770x110）
    const topCanvas = document.getElementById('connect4Canvas_top');
    const topCtx = topCanvas.getContext('2d');
    topCtx.clearRect(0, 0, topCanvas.width, topCanvas.height); // キャンバスをクリア

    // 先行の石を描画
    const centerY = topCanvas.height / 2; // 中央のY座標
    let color;

    if (player_info === turn) {
        color = playerLeft_Color === 'red' ? 'red' : 'yellow'; // プレイヤーの色 先行は赤
    } else {
        color = playerLeft_Color === 'yellow' ? 'red' : 'yellow'; // プレイヤーの色 先行は赤
    }
    if (changeStone > 0 && color === playerLeft_Color) {
        color = color === 'red' ? 'yellow' : 'red'; // 色交換
    }
    // メインの石を描画
    topCtx.fillStyle = color;
    topCtx.beginPath();
    topCtx.arc(col * cellSize + cellSize / 2, centerY, (cellSize / 2) - 5, 0, Math.PI * 2);
    topCtx.fill();
    topCtx.closePath();

    // ハイライトの円（光沢）を描画
    topCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
    topCtx.beginPath();
    topCtx.arc(
        col * cellSize + cellSize / 2 - 10, // X座標（少しずらす）
        centerY - 10, // Y座標（少しずらす）
        (cellSize / 2) - 20, // 半径（小さめ）
        0,
        Math.PI * 2
    );
    topCtx.fill();
    topCtx.closePath();
    console.log("・disp_TopStone");
}

// 背景を描画する関数（Firestoreのデータを使用して石も描画）
async function init_drawBoard(allstones = false) {

    ctx.clearRect(0, 0, canvas.width, canvas.height); // キャンバスをクリア

    // querySnapshotが未定義または空である場合、処理を中断
    if (!querySnapshot || querySnapshot.empty) {
        return;
    }
    // グリッドを描く
    for (let r = 0; r < rows; r++) { 
        for (let c = 0; c < cols; c++) { 
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // 背景色
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            ctx.strokeStyle = '#fff'; // セルの境界線
            ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);

            // 石がある場合はその色で描画
            const stoneKey = `${c}_${r}`;
            if (stonesData[stoneKey]) {
                if ((!(stonesData[stoneKey].turnCount == turnCount - 1)) || allstones) {
                    // 石の色を設定
                    const stoneColor = stonesData[stoneKey].color;
                    drawPiece(c, r * cellSize, stoneColor);
                }
            }
        }
    }
    console.log("・init_drawBoard");
}

function drawPiece(column, y, color) {
    _drawPiece(ctx, column, y, color, cellSize);
}

function drawPieceWithParticles(column, y, color) {
    _drawPieceWithParticles(ctx, canvas, column, y, color, cellSize);
}

//------------------------------------------------------------------------------------------------

function backcolor_player(turn) {
    const leftPane = document.getElementById('leftPane'); // leftPane要素を取得
    const rightPane = document.getElementById('rightPane'); // rightPane要素を取得

    // 背景色を変更
    if (playerColor === 'red') {
        console.log('先行なので赤色');
        leftPane.style.backgroundColor = '#ffe5e5'; // 赤色に変更
        rightPane.style.backgroundColor = '#ffffe5'; // 黄色に変更
    } else {
        console.log('後攻なので黄色');
        leftPane.style.backgroundColor = '#ffffe5'; // 黄色に変更
        rightPane.style.backgroundColor = '#ffe5e5'; // 赤色に変更
    }
}

// クッキーからUUIDを取得
function getUUIDFromCookie() {
    const cookies = document.cookie.split("; "); // クッキーを配列に分割
    const uuidCookie = cookies.find(cookie => cookie.startsWith("playerUUID="));
    
    // UUIDが見つかった場合に値を返す
    return uuidCookie ? uuidCookie.split("=")[1] : null;
}

// charaIDに一致するキャラ情報を取得する関数
function getCharacterDataByID(charaID) {
    return characterData.find(character => character.charaID === charaID);
}

//------------------------------------------------------------------------------------------------

function checkWin(stonesData) {
    const board = Array.from({ length: rows }, () => Array(cols).fill(null));

    // stonesData を 2 次元配列にセット
    for (const key in stonesData) {
        const [col, row] = key.split('_').map(Number);
        board[row][col] = stonesData[key].color;
    }

    // 勝利の色とその座標リスト
    let redWinPositions = new Set();  // 重複を避けるためセットを使用
    let yellowWinPositions = new Set();

    // 勝利判定: 横、縦、斜めの4つをチェック
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const color = board[r][c];

            if (color) {
                let winPositions = [];

                // 横方向チェック
                winPositions = checkDirection(r, c, 0, 1, color, rows, cols, board); // 右方向
                if (winPositions.length >= 4) {
                    winPositions.forEach(pos => {
                        if (color === 'red') redWinPositions.add(pos.join(','));
                        else if (color === 'yellow') yellowWinPositions.add(pos.join(','));
                    });
                }

                // 縦方向チェック
                winPositions = checkDirection(r, c, 1, 0, color, rows, cols, board); // 下方向
                if (winPositions.length >= 4) {
                    winPositions.forEach(pos => {
                        if (color === 'red') redWinPositions.add(pos.join(','));
                        else if (color === 'yellow') yellowWinPositions.add(pos.join(','));
                    });
                }

                // 右下がりの斜めチェック
                winPositions = checkDirection(r, c, 1, 1, color, rows, cols, board); // 右下方向
                if (winPositions.length >= 4) {
                    winPositions.forEach(pos => {
                        if (color === 'red') redWinPositions.add(pos.join(','));
                        else if (color === 'yellow') yellowWinPositions.add(pos.join(','));
                    });
                }

                // 左下がりの斜めチェック
                winPositions = checkDirection(r, c, 1, -1, color, rows, cols, board); // 左下方向
                if (winPositions.length >= 4) {
                    winPositions.forEach(pos => {
                        if (color === 'red') redWinPositions.add(pos.join(','));
                        else if (color === 'yellow') yellowWinPositions.add(pos.join(','));
                    });
                }
            }
        }
    }

    // Setから配列に変換し、結果を返却
    return {
        red: redWinPositions.size >= 4 ? Array.from(redWinPositions).map(pos => pos.split(',').map(Number)) : null,
        yellow: yellowWinPositions.size >= 4 ? Array.from(yellowWinPositions).map(pos => pos.split(',').map(Number)) : null
    };
}

// 方向ごとに連続する石の数を調べる関数
function checkDirection(r, c, rowDir, colDir, color, rows, cols, board) {
    let winPositions = [[r, c]];
    
    // 前方向（行列方向）に連続する石を数える
    let i = 1;
    while (r + i * rowDir >= 0 && r + i * rowDir < rows && c + i * colDir >= 0 && c + i * colDir < cols && board[r + i * rowDir][c + i * colDir] === color) {
        winPositions.push([r + i * rowDir, c + i * colDir]);
        i++;
    }

    // 後方向（逆行列方向）に連続する石を数える
    i = 1;
    while (r - i * rowDir >= 0 && r - i * rowDir < rows && c - i * colDir >= 0 && c - i * colDir < cols && board[r - i * rowDir][c - i * colDir] === color) {
        winPositions.unshift([r - i * rowDir, c - i * colDir]);
        i++;
    }

    return winPositions;
}

async function highlightWinningCells(winPositions) {
    const canvasRect = canvas.getBoundingClientRect(); // Canvasの位置とサイズを取得

    for (let i = 0; i < winPositions.length; i++) {
        const [row, col] = winPositions[i];

        // 新しいハイライト要素を作成
        const highlightedCell = document.createElement('div');
        highlightedCell.classList.add('cell', 'selected'); // CSSのクラスを適用

        // ハイライトのスタイルを設定（getBoundingClientRect基準でscale非依存）
        const cellW = canvasRect.width / cols;
        const cellH = canvasRect.height / rows;
        highlightedCell.style.position = 'fixed';
        highlightedCell.style.width = `${cellW}px`;
        highlightedCell.style.height = `${cellH}px`;
        highlightedCell.style.left = `${canvasRect.left + col * cellW}px`;
        highlightedCell.style.top = `${canvasRect.top + row * cellH}px`;
        highlightedCell.style.pointerEvents = 'none';

        // ボード全体の親要素に追加
        document.body.appendChild(highlightedCell);

        // 音声再生
        try {

        } catch (error) {
            console.error("音声の再生エラー:", error);
        }

        // 少し待機して次のセルをハイライト
        await wait(500); // 0.5秒待機

        // ハイライトを削除 (必要に応じてコメントアウト)
        highlightedCell.remove();
    }
}

// 勝利者を表示するための関数
async function showWinner(result) {
    const turnLabel = document.getElementById("winLabel");
    let turnlbl = "";

    if (result.red && !result.yellow) {
        if (playerLeft_Color === 'red') {
            turnlbl = "YOU WIN!";
            turnLabel.innerHTML = `${turnlbl}<br>${red_Win} - ${yellow_Win}`;
        } else {
            turnlbl = "YOU LOSE!";
            turnLabel.innerHTML = `${turnlbl}<br>${yellow_Win} - ${red_Win}`;
        }
    } else if (!result.red && result.yellow) {
        if (playerLeft_Color === 'yellow') {
            turnlbl = "YOU WIN!";
            turnLabel.innerHTML = `${turnlbl}<br>${yellow_Win} - ${red_Win}`;
        } else {
            turnlbl = "YOU LOSE!";
            turnLabel.innerHTML = `${turnlbl}<br>${red_Win} - ${yellow_Win}`;
        }
    } else if (result.red && result.yellow) {
        turnlbl = "DRAW";
        turnLabel.innerHTML = `${turnlbl}<br>${red_Win} - ${yellow_Win}`;
    }

    // フェードイン
    turnLabel.style.display = "block"; // 初めに表示状態に
    setTimeout(() => {
        turnLabel.style.opacity = 1; // 透明度を1にしてフェードイン
    }, 10); // 少し遅れて実行（レイアウトを反映させるため）

    // 3秒後にフェードアウト
    await new Promise(resolve => {
        setTimeout(() => {
            turnLabel.style.opacity = 0; // 透明度を0にしてフェードアウト
        }, 3000); // 3秒後にフェードアウト

        // フェードアウト後に完全に非表示にする
        setTimeout(() => {
            turnLabel.style.display = "none"; // 透明度が0になったら非表示
            resolve(); // 処理が完了したことを通知
        }, 5000); // フェードアウト後に少し待ってから非表示
    });
}

//------------------------------------------------------------------------------------------------

// ローカルストレージから残り時間を取得
function loadTimeRemaining() {
    const savedTime = localStorage.getItem("timeRemaining");
    const savedTimestamp = localStorage.getItem("lastTimestamp");
    console.log("▲ローカルストレージから残り時間を取得:", savedTime);
    console.log("△ローカルストレージから残り時間を取得:", savedTimestamp);
    
    if (savedTime !== null && savedTimestamp !== null) {
        const elapsed = Math.floor((Date.now() - parseInt(savedTimestamp, 10)) / 1000);
        timeRemaining = Math.max(0, parseInt(savedTime, 10) - elapsed);
        console.log("変数チェック①:", elapsed);
        console.log("変数チェック①:", timeRemaining);
    } else {
        timeRemaining = timeLimit;
        console.log("変数チェック②:", timeRemaining);
    }
    if (timeRemaining >= 100) timeRemaining = 100;

    // ■■■■■2026/01/10　追加 
    // 0やマイナスで復元されたら無効化して満タンにする
    if (isInitialLoad && timeRemaining <= 0) {
      timeRemaining = timeLimit;
      saveTimeRemaining();
    }
    console.log("◇ローカルストレージから残り時間を取得:", timeRemaining);
    
}

// 残り時間をローカルストレージに保存
function saveTimeRemaining() {
    localStorage.setItem("timeRemaining", timeRemaining); // 残り時間を保存
    localStorage.setItem("lastTimestamp", Date.now()); // 現在のタイムスタンプを保存
}

// ローカルストレージの残り時間関連データを削除
function clearTimeRemaining() {
    console.log("ローカルストレージの残り時間関連データを削除:", timeRemaining);
    
    localStorage.removeItem("timeRemaining"); // 残り時間データを削除
    localStorage.removeItem("lastTimestamp"); // タイムスタンプデータを削除
}

// 1秒ごとにゲージが減少
async function updateTimeLimit() {
    // ■■■■■2026/01/10　修正前 if (timeRemaining >= 0) {
    if (timeRemaining > 0) {
        // 残り時間に応じてゲージの幅を計算
        let width = (timeRemaining / timeLimit) * 100; // ゲージ幅を100%基準に計算
        timeLimitGauge.style.width = width + "%"; // ゲージ幅を更新

        // 残り時間を1秒減らす
        timeRemaining--;
        saveTimeRemaining(); // ローカルストレージに保存
    } else {
        // タイムリミットが終了した場合の処理
        clearInterval(timeLimitTimer); // タイマーを停止
        timeLimitTimer = null;
        
         // ★ターン側じゃないなら、ここで終わる（勝手にリセットしない）
         if (!isTurnPlayer()) {
           return;
         }

        // タイムリミット終了時の処理
        nowCol = await getRandomEmptyColumn();
        if (isTurnPlayer()) {
        
            if (selectedCharacter){
                // エフェクトを解除
                selectedCharacter = false;
                img1.classList.remove('glowing-effect');  // エフェクトを削除
                img1.classList.add('ult-effect');          // 必殺技エフェクトを再適用
                img1.classList.remove('selected');        // 画像選択のクラスを削除

                toggleSpecialMoveButton(selectedCharacter);

                // すでにハイライトが存在する場合は削除
                if (highlightedColumn) {
                    highlightedColumn.remove();
                }  
            }
            
            await dropStone(nowCol, 3);
        }
        resetTimeLimit();
    }
}

// タイムリミットのリセット処理
function resetTimeLimit() {

    // 既存のタイマーがあれば停止
    if (timeLimitTimer !== null) {
        clearInterval(timeLimitTimer);
        timeLimitTimer = null;
    }
    
    // ■■■■■2026/01/10　修正前 timeLimit = isTurnPlayer() ? playerRight_TimeLimit : playerLeft_TimeLimit;
    timeLimit = isTurnPlayer() ? playerLeft_TimeLimit : playerRight_TimeLimit;

    console.log("[resetTimeLimit]", {
        isTurnPlayer: isTurnPlayer(),
        playerLeft_TimeLimit,
        playerRight_TimeLimit,
        timeLimit,
        turn,
        player_info,
    });
    
    // 残り時間を初期値に戻す
    timeRemaining = timeLimit;
    let width = (timeRemaining / timeLimit) * 100; // ゲージ幅を100%に戻す
    timeLimitGauge.style.width = width + "%"; // ゲージを満タンに更新

    saveTimeRemaining(); // ローカルストレージに保存

    // 新たにタイマーを開始
    timeLimitTimer = setInterval(updateTimeLimit, 1000);
}

// ゲージのメモリを動的に作成する
function createMemoryMarks() {
    let marksContainer = document.querySelector('.gauge-tlmarks');
    marksContainer.innerHTML = ""; // ★追加：増殖防止
    let markCount = 10; // メモリ線の数
    for (let i = 1; i <= markCount; i++) {
        let mark = document.createElement('div');
        mark.classList.add('tlmark');
        mark.style.left = `${(i / markCount) * 100}%`; // メモリの位置を計算
        marksContainer.appendChild(mark);
    }
}

// ■■■■■2026/01/10　追加
async function recordTimeoutOncePerTurn() {
  if (!roomID) return;

  const roomRef = doc(db, "rooms", roomID);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef);
    if (!snap.exists()) return;

    const data = snap.data();

    // 自分がどっちか
    const isP1 = (player_info === "P1");
    const timeoutField = isP1 ? "player1_TimeoutCount" : "player2_TimeoutCount";
    const lastField = isP1 ? "player1_lastTimeoutTurnCount" : "player2_lastTimeoutTurnCount";

    const currentTurnCount = data.turnCount ?? 1;
    const lastTimeoutTurnCount = data[lastField] ?? 0;

    // 同じターンで既に記録済みなら何もしない（重複防止）
    if (lastTimeoutTurnCount === currentTurnCount) return;

    const nextTimeout = (data[timeoutField] ?? 0) + 1;

    tx.update(roomRef, {
      [timeoutField]: nextTimeout,
      [lastField]: currentTurnCount,
    });
  });
}

async function getRandomEmptyColumn() {
    // rooms コレクションから roomID フィールドで一致するドキュメントを取得
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID)); // roomIDが一致するドキュメントを検索
    
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        return null; // データが見つからない場合は処理を中断
    }

    let emptyColumns = [];

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const stonesData = data.stones || {}; // stonesデータを取得
        
        // 0～6列を全て空として初期化
        let columnsFilledAtRow0 = new Set();

        // stonesデータを解析して、row=0の埋まっている列を記録
        for (const key in stonesData) {
            const [column, row] = key.split('_').map(Number);
            if (row === 0) {
                columnsFilledAtRow0.add(column);
            }
        }

        // row=0が埋まっていない列のみをemptyColumnsに追加
        for (let col = 0; col < 7; col++) {
            if (!columnsFilledAtRow0.has(col)) {
                emptyColumns.push(col);
            }
        }
    });

    if (emptyColumns.length === 0) {
        console.log("すべての列が埋まっています");
        return null; // 空いている列がない場合
    }

    // ランダムに空いている列を選ぶ
    const randomColumn = emptyColumns[Math.floor(Math.random() * emptyColumns.length)];
    return randomColumn;
}

//------------------------------------------------------------------------------------------------

function displayVictory(winningColor) {
    const victoryModal = document.getElementById("victoryModal");
    const victoryImage = document.getElementById("victoryImage");
    const victoryMessage = document.getElementById("victoryMessage");

    // 勝利キャラ画像とメッセージを設定
    if (winningColor === "red") {
        victoryImage.src = playerLeft_Color === 'red' ? playerLeft_Image : playerRight_Image; // 赤プレイヤーのキャラ画像
        victoryMessage.textContent = `${playerLeft_Color === 'red' ? playerLeft_Name : playerRight_Name} WIN!!`;
    } else if (winningColor === "yellow") {
        victoryImage.src = playerLeft_Color === 'yellow' ? playerLeft_Image : playerRight_Image; // 黄プレイヤーのキャラ画像
        victoryMessage.textContent = `${playerLeft_Color === 'yellow' ? playerLeft_Name : playerRight_Name} WIN!!`;
    }

    // モーダルを表示
    victoryModal.style.display = "block";

    // 5秒後にキャラ選択画面に戻る
    setTimeout(() => {
        window.location.href = "index.html"; // キャラ選択画面へのURL
    }, 5000);
}

function displayLeaveMessage() {
    const victoryModal = document.getElementById("victoryModal");
    const victoryImage = document.getElementById("victoryImage");
    const victoryMessage = document.getElementById("victoryMessage");

    victoryImage.src = playerLeft_Image; // 赤プレイヤーのキャラ画像
    victoryMessage.innerHTML = "相手が部屋を抜けたので、あなたの勝利です！<br>キャラクター選択画面に戻ります。"; // <br>で改行

    // モーダルを表示
    victoryModal.style.display = "block";

    // 5秒後にキャラ選択画面に戻る
    setTimeout(() => {
        window.location.href = "index.html"; // キャラ選択画面へのURL
    }, 6000);
}

function updateWinLabels(player1Wins, player2Wins) {
    // プレイヤー1の勝利数に応じて◇を◆に変更
    let player1Label = '◇◇◇'; // 初期値
    for (let i = 0; i < player1Wins; i++) {
        player1Label = player1Label.replace('◇', '◆'); // ◇を◆に変える
    }

    // プレイヤー2の勝利数に応じて◇を◆に変更
    let player2Label = '◇◇◇'; // 初期値
    for (let i = 0; i < player2Wins; i++) {
        player2Label = player2Label.replace('◇', '◆'); // ◇を◆に変える
    }

    // ラベルを更新
    document.getElementById('player1_win').textContent = player1Label;
    document.getElementById('player2_win').textContent = player2Label;
}

async function getcharge(data, normalAttack = true) {

    let p1_chargeNow = 0;
    let p2_chargeNow = 0;
    let chargeNum = isTurnChargeNum(turn);
    
    if(!normalAttack) {
        // ULT攻撃
        console.log("●必殺技攻撃", player_info);
        if (player_info === 'P1') {
            playerLeft_ChargeNow = playerLeft_ChargeNow - 150;
            playerRight_ChargeNow = data.player2_ChargeNow;
        
            p1_chargeNow = playerLeft_ChargeNow;
            p2_chargeNow = playerRight_ChargeNow;
            
        } else {    
            playerLeft_ChargeNow = playerLeft_ChargeNow - 150;
            playerRight_ChargeNow = data.player1_ChargeNow;
        
            p1_chargeNow = playerRight_ChargeNow;
            p2_chargeNow = playerLeft_ChargeNow;
            
        }
        
    } else if(ultAfter) {
        // 必殺技直後の通常攻撃
        console.log("●必殺技直後の通常攻撃", player_info);
        if (player_info === 'P1') {
            p1_chargeNow = playerLeft_ChargeNow;
            p2_chargeNow = playerRight_ChargeNow;
            
        } else {
            p1_chargeNow = playerRight_ChargeNow;
            p2_chargeNow = playerLeft_ChargeNow;
            
        }
        
        
    } else {
        // 通常攻撃
        console.log("●通常攻撃", player_info);
        if (player_info === 'P1') {
            playerLeft_ChargeNow = Math.min(playerLeft_ChargeNow + chargeNum, 200);
            playerRight_ChargeNow = data.player2_ChargeNow;
        
            p1_chargeNow = playerLeft_ChargeNow;
            p2_chargeNow = playerRight_ChargeNow;
            
        } else {    
            playerLeft_ChargeNow = Math.min(playerLeft_ChargeNow + chargeNum, 200);
            playerRight_ChargeNow = data.player1_ChargeNow;
        
            p1_chargeNow = playerRight_ChargeNow;
            p2_chargeNow = playerLeft_ChargeNow;
            
        }
        
    }
    if (p1_chargeNow < 0) {
        p1_chargeNow = 0;
    }
    if (p2_chargeNow < 0) {
        p2_chargeNow = 0;
    }
    console.log("◇ゲージ取得1：", p1_chargeNow);
    console.log("◇ゲージ取得2：", p2_chargeNow);
    return [p1_chargeNow, p2_chargeNow];  
}

async function getUltCount(data, normalAttack = true) {

    let p1_UltCount = 0;
    let p2_UltCount = 0;
    const ultCnt = normalAttack ? 0 : 1;

    if (ultCnt > 0) {
        console.log("[getUltCount] UltCount +1 加算実行", {
            caller: new Error().stack?.split('\n')[2]?.trim(),
            player_info,
            before: playerLeft_UltCount,
        });
    }

    if (player_info === 'P1') {
        playerLeft_UltCount = playerLeft_UltCount + ultCnt;
        playerRight_UltCount = data.player2_UltCount;

        p1_UltCount = playerLeft_UltCount;
        p2_UltCount = playerRight_UltCount;

    } else {
        playerLeft_UltCount = playerLeft_UltCount + ultCnt;
        playerRight_UltCount = data.player1_UltCount;

        p1_UltCount = playerRight_UltCount;
        p2_UltCount = playerLeft_UltCount;
    }
    return [p1_UltCount, p2_UltCount];
}

function toggleSpecialMoveButton(show) {
    const buttonContainer = document.getElementById('specialMoveButtonContainer');
    buttonContainer.style.display = show ? 'block' : 'none'; // 表示・非表示を切り替え
    topCanvas.style.display = show ? 'none' : 'block'; // 表示・非表示を切り替え

    // ④ 必殺技ボタンの幅を boardWrap（盤面見た目幅）に合わせる
    if (show) {
        const boardWrap = document.getElementById('boardWrap');
        if (boardWrap) {
            const btn = document.getElementById('specialMoveButton');
            if (btn) {
                btn.style.width = boardWrap.getBoundingClientRect().width + 'px';
            }
        }
    }
}

//------------------------------------------------------------------------------------------------

async function invokeAbility(functionName) {
    console.log("invokeAbility:", functionName);
    if (typeof abilities[functionName] === "function") {
        console.log("必殺技実行");
        
        ult_CntUP();
        
        // カットイン終了後に必殺技の関数を実行
        isTurnPlayerUltVoice();
        
        // カットインを表示し、終了を待機
        await showCutIn();

        abilities[functionName](); // 関数を動的に呼び出す
        console.log("必殺技でドキュメントを更新しました。");
    } else {
        console.error(`Function ${functionName} is not defined in abilities module`);
    }
}

//------------------------------------------------------------------------------------------------

function showCutIn() {
    return new Promise((resolve) => {
        const cutinImage = document.getElementById('cutin-image');
        const cutinContainer = document.getElementById('cutin-container');
        const centerPanel = document.getElementById('centerPanel'); // 親要素を取得

        // 現在のターンのプレイヤーに基づいて画像を設定
        if (isTurnPlayer()) {
            cutinImage.src = playerLeft_CutIn; // P1のカットイン画像
        } else {
            cutinImage.src = playerRight_CutIn; // P2のカットイン画像
        }

        // 画像が読み込まれるのを待つ
        cutinImage.onload = () => {
            // カットインコンテナを表示
            cutinContainer.style.display = 'block'; // 画面中央に表示

            // 初期位置は画面外（centerPanel の横幅に基づく）
            const parentWidth = centerPanel.offsetWidth; // centerPanel の横幅を取得
            cutinImage.style.right = `-${parentWidth}px`; // 横幅に基づいて初期位置設定
            cutinImage.style.opacity = '0'; // 初期状態で非表示

            // スライドインとフェードインのアニメーションを追加
            setTimeout(() => {
                cutinImage.style.transition = 'right 1s ease-in-out, opacity 1s ease-in-out'; // 1秒でスライドインとフェードイン
                cutinImage.style.right = '0'; // 画面内にスライドイン
                cutinImage.style.opacity = '1'; // フェードイン
            }, 50); // 少し遅れてアニメーション開始

            // 3秒後にスライドアウトとフェードアウト
            setTimeout(() => {
                cutinImage.style.transition = 'right 1s ease-in-out, opacity 1s ease-in-out'; // 1秒でスライドアウトとフェードアウト
                cutinImage.style.right = `-${parentWidth}px`; // 横幅に基づいて画面外にスライドアウト
                cutinImage.style.opacity = '0'; // フェードアウト

                // フェードアウト後に非表示
                setTimeout(() => {
                    cutinContainer.style.display = 'none'; // 完全に非表示
                    resolve(); // カットイン終了を通知
                }, 1000); // フェードアウトのアニメーション終了後
            }, 2500); // 3秒後にスライドアウトとフェードアウト
        };
    });
}

//------------------------------------------------------------------------------------------------
// ホタル
async function ult_randomVertical1Drop(){
    nowCol = await getRandomEmptyColumn();
    console.log("ホタルの必殺技発動！:", nowCol);
    dropStone(nowCol, 2);
}

//------------------------------------------------------------------------------------------------

// セノ
async function ult_randomCenter2Delete(){
    const randomStones = getRandomTwoNumbers();
    console.log("セノの必殺技発動！:", randomStones);
    
    const stonesToDelete = await getStonesToDelete(randomStones, 6);

    // 石をハイライト
    highlightStones(stonesToDelete, 300);

    // 石を削除
    deleteStones(stonesToDelete);
}

function getRandomTwoNumbers() {
    return _getRandomTwoNumbers();
}

function getRandomThreeNumbers() {
    return _getRandomThreeNumbers();
}

//------------------------------------------------------------------------------------------------

async function ult_allTopDelete(){
    const randomStones = await getRandomTopStones(4);
    console.log("アルベドの必殺技発動！:", randomStones);
    
    const stonesToDelete = await getStonesToDelete(randomStones, 2);

    // 石をハイライト
    highlightStones(stonesToDelete, 400);

    // 石を削除
    deleteStones(stonesToDelete);
}

async function ult_random3TopDelete(){
    const randomStones = await getRandomTopStones(3);
    console.log("八重神子の必殺技発動！:", randomStones);
    
    const stonesToDelete = await getStonesToDelete(randomStones);

    // 石をハイライト
    highlightStones(stonesToDelete);

    // 石を削除
    deleteStones(stonesToDelete);
}

async function ult_randomVerticalAllDelete(){
    const randomStones = await getRandomTopStones(1);
    console.log("ヘルタの必殺技発動！:", randomStones);
    
    const stonesToDelete = await getStonesToDelete(randomStones, 6);

    // 石をハイライト
    highlightStones(stonesToDelete, 400);

    // 石を削除
    deleteStones(stonesToDelete);
}

async function getStonesToDelete(topStones, numberOfRowsToDelete = 1) {
    try {
        // Firestoreからデータ取得
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error("Room not found.");
            return [];
        }

        const roomDoc = querySnapshot.docs[0];
        const roomData = roomDoc.data();
        const stonesData = roomData.stones || {};
        console.log("現在のstonesDataのキー:", Object.keys(stonesData)); // デバッグ用

        const stonesToDelete = [];

        for (const { column, row } of topStones) {
            if (typeof row !== "number") {
                console.error("Row is not a number:", row);
                continue;
            }

            if (numberOfRowsToDelete === 6) {
                // 6を指定した場合は列全体を取得（石の有無を問わず）
                for (let currentRow = 0; currentRow <= 5; currentRow++) {
                    const key = `${column}_${currentRow}`;
                    stonesToDelete.push(key);
                    console.log(`6指定: 列 ${column} の削除対象座標 ${key}`);
                }
            } else {
                // 指定された座標から下方向に指定数分の座標を取得
                for (let offset = 0; offset < numberOfRowsToDelete; offset++) {
                    const currentRow = row + offset;
                    if (currentRow > 5) break; // 行番号が5を超えたら終了

                    const key = `${column}_${currentRow}`;
                    if (stonesData[key] || numberOfRowsToDelete === 6) {
                        stonesToDelete.push(key);
                        console.log(`通常指定: 削除対象座標 ${key}`);
                    } else {
                        console.log(`通常指定: 石が存在しない座標 ${key}`);
                    }
                }
            }
        }

        console.log("削除対象のキー一覧:", stonesToDelete);

        // 列番号で昇順にソート
        stonesToDelete.sort((a, b) => {
            const colA = parseInt(a.split('_')[0]);
            const colB = parseInt(b.split('_')[0]);
            return colA - colB;
        });

        console.log("ソート後の削除対象のキー一覧:", stonesToDelete);

        return stonesToDelete;
    } catch (error) {
        console.error("削除対象の取得中にエラーが発生しました:", error);
        return [];
    }
}

async function deleteStones(stonesToDelete) {

    try {
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach(async (roomDoc) => {
            const roomData = roomDoc.data();
            const stonesData = roomData.stones || {};
            const [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false);
            // UltCount の加算は ult_CntUP() で済み。ここでは現在値を取得するだけ
            const [p1_UltCount, p2_UltCount] = await getUltCount(roomData, true);

            // 石を削除
            stonesToDelete.forEach(key => {
                if (stonesData[key]) {
                    delete stonesData[key];
                }
            });   
                    
            // Firestoreのデータを更新
            const roomDocRef = doc(db, "rooms", roomDoc.id);
            await updateDoc(roomDocRef, { 
                player1_ChargeNow: p1_chargeNow,
                player2_ChargeNow: p2_chargeNow,
                stones: stonesData 
            });
        });
        
        await wait(stonesToDelete.length * 500);
        init_drawBoard(true);
    } catch (error) {
        console.error("石の削除中にエラーが発生しました:", error);
    }
}

async function highlightStones(stonesToDelete, wt = 500) {
    if (!Array.isArray(stonesToDelete)) {
        console.error("stonesToDelete is not an array:", stonesToDelete);
        return;
    }

    const canvasRect = canvas.getBoundingClientRect(); // Canvasの位置とサイズを取得

    for (const stoneKey of stonesToDelete) {
        const [col, row] = stoneKey.split('_').map(Number);

        if (isNaN(col) || isNaN(row)) {
            console.error("Invalid stoneKey format:", stoneKey);
            continue;
        }

        // 新しいハイライト要素を作成
        const highlightedCell = document.createElement('div');
        highlightedCell.classList.add('cell', 'selected'); // CSSのクラスを適用

        // ハイライトのスタイルを設定（getBoundingClientRect基準でscale非依存）
        const cellW = canvasRect.width / cols;
        const cellH = canvasRect.height / rows;
        highlightedCell.style.position = 'fixed';
        highlightedCell.style.width = `${cellW}px`;
        highlightedCell.style.height = `${cellH}px`;
        highlightedCell.style.left = `${canvasRect.left + col * cellW}px`;
        highlightedCell.style.top = `${canvasRect.top + row * cellH}px`;
        highlightedCell.style.pointerEvents = 'none';

        // ボード全体の親要素に追加
        document.body.appendChild(highlightedCell);

        // 少し待機して次のセルをハイライト
        await wait(wt); // 0.5秒待機（必要に応じて調整）

        // ハイライトを削除
        highlightedCell.remove();
    }
}

async function getRandomTopStones(count) {
    try {
        if (count < 1 || count > 7) {
            console.error("Count must be between 1 and 7.");
            return null;
        }

        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error("Room not found");
            return null;
        }

        const roomDoc = querySnapshot.docs[0];
        const roomData = roomDoc.data();
        const stonesData = roomData.stones || {};

        // すべての列を取得し、石がある列だけを抽出
        const allColumnsWithStones = [...new Set(Object.keys(stonesData).map(key => key.split('_')[0]))];

        // 石がある列が count より少ない場合、count をその列数に合わせる
        const columnsToSelect = Math.min(count, allColumnsWithStones.length);

        // ランダムに列を選択（重複なし）
        const selectedColumns = [];
        while (selectedColumns.length < columnsToSelect) {
            const randomIndex = Math.floor(Math.random() * allColumnsWithStones.length);
            const randomColumn = allColumnsWithStones[randomIndex];
            if (!selectedColumns.includes(randomColumn)) {
                selectedColumns.push(randomColumn);
            }
        }
        console.log("・selectedColumns:", selectedColumns);

        // 選択した列の一番上の石を取得
        const result = [];
        selectedColumns.forEach(col => {
            const topRow = getTopStoneInColumn(stonesData, col);
            if (topRow !== null) {
                result.push({ column: parseInt(col), row: topRow });
            }
        });
        console.log("・result:", result);

        return result;
    } catch (error) {
        console.error("Error getting random top stones:", error);
        return null;
    }
}

// 指定された列で一番上の石を取得するヘルパー関数
function getTopStoneInColumn(stonesData, column) {
    return _getTopStoneInColumn(stonesData, column);
}

//------------------------------------------------------------------------------------------------

async function ult_downThinkingTime() {
  console.log("[ULT] アベンチュリンの必殺技発動！ player_info=", player_info);

  try {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return;

    for (const roomDoc of querySnapshot.docs) {
      const roomData = roomDoc.data();

      console.log("[ULT] Firestore読取値:", {
        p1_TimeLimit: roomData.player1_TimeLimit,
        p2_TimeLimit: roomData.player2_TimeLimit,
        player_info,
      });

      const [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false);
      // UltCount の加算は ult_CntUP() で済み。ここでは現在値を取得するだけ（normalAttack=true で加算しない）
      const [p1_UltCount, p2_UltCount] = await getUltCount(roomData, true);

      // ② 相手側の TimeLimit だけを減らす（自分側は絶対に触らない）
      const roomDocRef = doc(db, "rooms", roomDoc.id);
      if (player_info === "P1") {
        // 自分がP1 → 相手はP2 → player2_TimeLimit を減らす
        const p2_Time = Math.max(0, (roomData.player2_TimeLimit ?? 100) - 16);
        playerRight_TimeLimit = p2_Time;
        await updateDoc(roomDocRef, {
          player1_ChargeNow: p1_chargeNow,
          player2_ChargeNow: p2_chargeNow,
          player2_TimeLimit: p2_Time,
        });
        console.log("[ULT] 相手(P2)の思考時間を減少:", { before: roomData.player2_TimeLimit, after: p2_Time });
      } else {
        // 自分がP2 → 相手はP1 → player1_TimeLimit を減らす
        const p1_Time = Math.max(0, (roomData.player1_TimeLimit ?? 100) - 16);
        playerRight_TimeLimit = p1_Time;
        await updateDoc(roomDocRef, {
          player1_ChargeNow: p1_chargeNow,
          player2_ChargeNow: p2_chargeNow,
          player1_TimeLimit: p1_Time,
        });
        console.log("[ULT] 相手(P1)の思考時間を減少:", { before: roomData.player1_TimeLimit, after: p1_Time });
      }
      console.log("[ULT] ローカル変数:", { playerLeft_TimeLimit, playerRight_TimeLimit });
    }
  } catch (error) {
    console.error("[ULT] 思考時間更新でエラー:", error);
  }
}

//------------------------------------------------------------------------------------------------

async function ult_Top2Delete() {    
    const stonesToDelete = await getTop2Stones();
    console.log("雷電将軍の必殺技発動！：", stonesToDelete);

    // 石をハイライト
    highlightStones(stonesToDelete, 100);

    // 石を削除
    deleteStones(stonesToDelete);
}

async function getTop2Stones() {
    return _getTop2Stones();
}

//------------------------------------------------------------------------------------------------

async function ult_randomAbility(){
    console.log("花火の必殺技発動！");
    
    try {
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        
        // getDocs に await を追加
        const querySnapshot = await getDocs(q);

        // Firestore のデータを更新
        for (const roomDoc of querySnapshot.docs) {
            const roomData = roomDoc.data(); // roomData を定義
            const [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false); // roomData を渡す
            // UltCount の加算は ult_CntUP() で済み。ここでは現在値を取得するだけ
            const [p1_UltCount, p2_UltCount] = await getUltCount(roomData, true);
            const roomDocRef = doc(db, "rooms", roomDoc.id);

            // 更新
            changeStone = roomData.changeStone === 0 ? 2 : 3;
            
            await updateDoc(roomDocRef, { 
                player1_ChargeNow: p1_chargeNow,
                player2_ChargeNow: p2_chargeNow,
                changeStone: changeStone
            });
        }
    } catch (error) {
        console.error("エラーが発生しました:", error);
    }
}

//------------------------------------------------------------------------------------------------

async function ult_madness() {

    const randomStones = getRandomThreeNumbers();
    console.log("キャストリスの必殺技発動！:", randomStones);
    
    const stonesToDelete = await getStonesToDelete(randomStones, 6);

    // 石をハイライト
    highlightStones(stonesToDelete, 250);

    // 石を削除
    deleteStones(stonesToDelete);
    
//    console.log("ルアンママの必殺技発動！");
//    try {
//        // Firestoreから石の情報を取得
//        const roomsRef = collection(db, "rooms");
//        const q = query(roomsRef, where("roomID", "==", roomID));
//        const querySnapshot = await getDocs(q);
//
//        if (querySnapshot.empty) {
//            console.error("Room not found.");
//            return;
//        }
//
//        const roomDoc = querySnapshot.docs[0];
//        const roomData = roomDoc.data();
//        const stonesData = roomData.stones || {};
//        console.log("現在のstonesData:", stonesData);
//
//        const [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false); // 必殺技ゲージ
//        const [p1_UltCount, p2_UltCount] = await getUltCount(roomData, false); // 必殺技回数
//
//        // 赤と黄色の変更する石を取得
//        const [redChangeStones, yellowChangeStones] = await getStonesToChange(stonesData, playerLeft_UltCount);
//
//        console.log("逆転する赤の石:", redChangeStones);
//        console.log("逆転する黄の石:", yellowChangeStones);
//
//        // 石の色を逆転
//        await changeStonesColor(stonesData, redChangeStones, yellowChangeStones);
//
//        // ハイライト処理
//        await highlightStones(redChangeStones, 250);
//        await highlightStones(yellowChangeStones, 250);
//
//        // Firestoreに更新
//        await updateRoomWithNewStones(roomDoc.id, stonesData, p1_chargeNow, p2_chargeNow, p1_UltCount, p2_UltCount);
//
//        init_drawBoard(true);
//            
//    } catch (error) {
//        console.error("必殺技の処理中にエラーが発生しました:", error);
//    }
}

// 石の色を逆転する関数
async function changeStonesColor(stonesData, redChangeStones, yellowChangeStones) {
    return _changeStonesColor(stonesData, redChangeStones, yellowChangeStones);
}

// Firestoreに新しいstonesDataを更新する関数
async function updateRoomWithNewStones(roomDocId, stonesData, p1_chargeNow, p2_chargeNow, p1_UltCount, p2_UltCount) {
    const roomDocRef = doc(db, "rooms", roomDocId);

    // バッチ処理で更新
    const batch = writeBatch(db);

    // stonesのデータを更新
    batch.update(roomDocRef, {
        stones: stonesData,
    });

    // Roomドキュメントの追加の更新
    batch.update(roomDocRef, {
        player1_ChargeNow: p1_chargeNow,
        player1_UltCount: p1_UltCount,
        player2_ChargeNow: p2_chargeNow,
        player2_UltCount: p2_UltCount
    });

    // バッチをコミットして更新
    await batch.commit();
    console.log("stonesDataとRoom情報をFirestoreに更新しました！");
}


// 赤と黄色の変更する石の座標を取得する関数
async function getStonesToChange(stonesData, count) {
    return _getStonesToChange(stonesData, count);
}

// ランダムに指定数の要素を取得する関数
function getRandomElements(array, count) {
    return _getRandomElements(array, count);
}

//------------------------------------------------------------------------------------------------


async function ult_CntUP() {
    console.log("[ult_CntUP] 必殺技使用回数をカウントアップ", { player_info, turn });

    try {
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        const querySnapshot = await getDocs(q);

        for (const roomDoc of querySnapshot.docs) {
            const roomData = roomDoc.data();

            const beforeLeft = playerLeft_UltCount;
            const [p1_UltCount, p2_UltCount] = await getUltCount(roomData, false);
            console.log("[ult_CntUP] UltCount加算", {
                player_info,
                beforeLeft,
                afterLeft: playerLeft_UltCount,
                p1_UltCount,
                p2_UltCount,
                firestoreP1: roomData.player1_UltCount,
                firestoreP2: roomData.player2_UltCount,
            });

            const roomDocRef = doc(db, "rooms", roomDoc.id);
            await updateDoc(roomDocRef, {
                player1_UltCount: p1_UltCount,
                player2_UltCount: p2_UltCount
            });
        }
    } catch (error) {
        console.error("処理中にエラーが発生しました。:", error);
    }
}




