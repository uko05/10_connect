import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { db, auth, authReady } from "./firebaseConfig.js"; // firebaseの設定ファイル

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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { characterData } from "./characterData.js";
import { drawPiece as _drawPiece, clearPiece as _clearPiece, disp_DeleteStone as _disp_DeleteStone, flashScreen as _flashScreen, shakeElement as _shakeElement, spawnParticleBurst as _spawnParticleBurst, spawnStoneShatter as _spawnStoneShatter } from "./renderer.js";
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
import { ensureUserDoc, writeBO3Result, executeRatingTransaction, deleteRoomAfterRating, getRoomDocRef, getUserRating, applyRatingDisplay } from "./eloRating.js";
import { setupSettingsModal, bindSettingsUI, getDisplayColor, getUltIntensity, getClickMode } from "./settingsManager.js";
import { initLang, t, getCharaText } from "./i18n.js";
import { recordPvpMatchAchievements, applyTitleDisplay } from "./achievementManager.js";
import { showAchievementToast, showCharacterUnlockModal } from "./achievementToast.js";


// バージョン表示
document.getElementById('version').textContent = APP_VERSION;

//------------------------------------------------------------------------------------------------
const topCanvas = document.getElementById("connect4Canvas_top");
const canvas = document.getElementById('connect4Canvas');

let isInitialLoad = true; // 初期ロードかどうかを管理するフラグ

// プレイヤー情報格納
// テストプレイヤー識別子をバトル画面上で非表示にするためのサニタイズ関数
function sanitizeDisplayName(name) {
    if (!name) return name;
    return name.replace(/^ばかたれ@/, '').replace(/@debug$/, '');
}

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
let cachedLeftRating = null;
let cachedRightRating = null;

let startP = null;

let red_Win = 0;
let yellow_Win = 0;
let redComebackFromDown02 = false; // redが0-2の劣勢から逆転したか（アチーブメント「大逆転」判定用）
let yellowComebackFromDown02 = false;
let changeStone = 0;
let matchType = "ranked"; // "ranked" | "private"

// PvP クロスターンエフェクト状態
let pvpZhongliBlocked = null;   // 鍾離：封鎖列 [col, col] | null
let pvpZhongliTurnsLeft = 0;    // 残りターン数（2=phase1, 1=phase2）
let pvpZhongliCasterColor = null;
let pvpZhongliOverlays = [];
let pvpDurinPending = false;    // ドゥリン：次の自分ターン自動破壊
let pvpDurinCasterColor = null;
let pvpCerluaActive = false;    // ケリュドラ：次の相手ターン追加投下
let pvpCerluaCasterColor = null;
let pvpPrevTurn = null;         // ターン変化検知用
let firestoreRoomDocRef = null; // Firestoreドキュメント参照（Transaction用）
let isMatchFinalized = false; // BO3確定済みフラグ（二重発火防止）
let myPreRating = null; // レート変動表示用：試合前の自分のレート
let myPreAchievements = new Set(); // 試合前の自分の解放済みアチーブメントID（P2側のトースト表示用の差分検知に使う）
let achievementToastShownForMatch = false; // P2側のトースト多重表示防止
let disconnectTimer = null; // 相手切断検知用の猶予タイマー

// 部屋離脱検知用ハートビート：対局中は自分の生存時刻を定期的に書き込み、
// 相手の生存時刻が一定時間更新されなければ「離脱」とみなして既存のleave処理を起動する
const HEARTBEAT_INTERVAL_MS = 10 * 1000;
const STALE_THRESHOLD_MS = 30 * 1000;
let heartbeatIntervalId = null;
let enemyStaleCheckIntervalId = null;
let enemyLastActiveMs = null; // 直近で観測した相手のlastActive（サーバー時刻のミリ秒）

let winningflg = 0;
let dropInProgress = false; // 連打（ダブルクリック/タップの多重発火）で複数手が同時に処理されるのを防ぐロック

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
    ult_randomVertical1Drop,
    ult_ruanMei,
    ult_lowen,
    ult_zhongli,
    ult_saphel,
    ult_durin,
    ult_cerylua,
    ult_silverwolf
};

// 設定の必殺技演出強度に応じて、画面フラッシュ・シェイク・パーティクルの強さを調整するラッパー
// （renderer.jsの関数自体は強度を意識しない「素の」演出プリミティブとして保つ）
function fxFlash(color, duration) {
    const level = getUltIntensity();
    if (level === 'off') return;
    _flashScreen(color, level === 'weak' ? duration * 0.5 : duration);
}

function fxShake(el, intensity, duration) {
    const level = getUltIntensity();
    if (level === 'off') return;
    _shakeElement(el, level === 'weak' ? intensity * 0.5 : intensity, level === 'weak' ? duration * 0.5 : duration);
}

function fxParticles(x, y, colors = ['#ff7a00', '#ffd400', '#fff6cc'], count = 16) {
    const level = getUltIntensity();
    if (level === 'off') return;
    const n = level === 'weak' ? Math.max(1, Math.round(count * 0.5)) : count;
    _spawnParticleBurst(x, y, colors, n);
}

function fxShatter(stones) {
    const level = getUltIntensity();
    if (level === 'off') return;
    _spawnStoneShatter(stones);
}

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

        querySnapshotP1.forEach((docSnap) => {
            const data = docSnap.data(); // ドキュメントのデータを取得

            playerLeft_ID = data.player1_ID;
            playerLeft_CharaID = data.player1_CharaID;
            playerLeft_ChargeNow = data.player1_ChargeNow;
            playerLeft_Name = sanitizeDisplayName(data.player1_Name);
            playerLeft_Color = data.player1_Color;
            playerLeft_TimeLimit = data.player1_TimeLimit;
            playerLeft_UltCount = data.player1_UltCount;

            playerRight_ID = data.player2_ID;
            playerRight_CharaID = data.player2_CharaID;
            playerRight_ChargeNow = data.player2_ChargeNow;
            playerRight_Name = sanitizeDisplayName(data.player2_Name);
            playerRight_Color = data.player2_Color;
            playerRight_TimeLimit = data.player2_TimeLimit;
            playerRight_UltCount = data.player2_UltCount;

            roomID = data.roomID;
            startP = data.startP;
            turn = data.turn;
            changeStone = data.changeStone;
            matchType = data.matchType || "ranked";
            firestoreRoomDocRef = docSnap.ref; // Firestoreドキュメント参照を保持

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

        querySnapshotP2.forEach((docSnap) => {
            const data = docSnap.data(); // ドキュメントのデータを取得

            playerLeft_ID = data.player2_ID;
            playerLeft_CharaID = data.player2_CharaID;
            playerLeft_ChargeNow = data.player2_ChargeNow;
            playerLeft_Name = sanitizeDisplayName(data.player2_Name);
            playerLeft_Color = data.player2_Color;
            playerLeft_TimeLimit = data.player2_TimeLimit;
            playerLeft_UltCount = data.player2_UltCount;

            playerRight_ID = data.player1_ID;
            playerRight_CharaID = data.player1_CharaID;
            playerRight_ChargeNow = data.player1_ChargeNow;
            playerRight_Name = sanitizeDisplayName(data.player1_Name);
            playerRight_Color = data.player1_Color;
            playerRight_TimeLimit = data.player1_TimeLimit;
            playerRight_UltCount = data.player1_UltCount;

            roomID = data.roomID;
            startP = data.startP;
            turn = data.turn;
            changeStone = data.changeStone;
            matchType = data.matchType || "ranked";
            firestoreRoomDocRef = docSnap.ref; // Firestoreドキュメント参照を保持

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

    // 両プレイヤーの users ドキュメントを保証（Transaction前に必須）
    try {
        await Promise.all([
            ensureUserDoc(playerLeft_ID),
            ensureUserDoc(playerRight_ID)
        ]);
        console.log("[gameLogic] 両プレイヤーの users doc 保証完了");
    } catch (e) {
        console.error("[gameLogic] ensureUserDoc 失敗:", e);
    }

    // レート表示（バトル画面：両プレイヤー）
    let leftRating = null, rightRating = null;
    try {
        [leftRating, rightRating] = await Promise.all([
            getUserRating(playerLeft_ID),
            getUserRating(playerRight_ID)
        ]);
        // 自分の事前レートを保存（レート変動表示用）
        myPreRating = leftRating?.rating ?? null;
        // 自分の事前解放済みアチーブメントを保存（P2側のトースト差分検知用）
        myPreAchievements = new Set(leftRating?.achievements || []);
        await Promise.all([
            applyRatingDisplay(document.getElementById('playerRating_1'), leftRating, document.getElementById('rankBadge_1'), document.getElementById('playerRankName_1')),
            applyRatingDisplay(document.getElementById('playerRating_2'), rightRating, document.getElementById('rankBadge_2'), document.getElementById('playerRankName_2'))
        ]);
    } catch (e) {
        console.warn("[Rating] レート表示取得失敗:", e);
    }
    // 称号は rating 取得失敗時も null で「未設定」表示になるよう try 外で呼ぶ
    cachedLeftRating = leftRating;
    cachedRightRating = rightRating;
    applyTitleDisplay(document.getElementById('playerTitles_1'), leftRating);
    applyTitleDisplay(document.getElementById('playerTitles_2'), rightRating);

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
    document.getElementById('charaID_1').innerText = getCharaText(charaInfo.charaID, 'name') ?? charaInfo.name;
    playerLeft_chargeNum = charaInfo.charge;
    document.getElementById('charge_1').innerText = playerLeft_chargeNum;
    document.getElementById('Ability_1').innerText = getCharaText(charaInfo.charaID, 'Ability') ?? charaInfo.Ability;
    document.getElementById('AbilityDetail_1').innerText = getCharaText(charaInfo.charaID, 'AbilityDetail') ?? charaInfo.AbilityDetail;
    
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

// 退出ボタン：確認のうえ離脱扱い（resultType: "leave"）でキャラ選択へ戻る。レートには通常より大きいペナルティが入る
document.getElementById('leaveButton').addEventListener('click', async () => {
    const confirmed = window.confirm(t('leaveConfirm'));
    if (!confirmed) return;

    stopHeartbeats();
    await updateLeaveRooms();
    window.location.href = 'select.html?mode=match';
});

document.getElementById('specialMoveButton').addEventListener('click', () => {
    
    if (playerLeft_CharaID === '008' && playerLeft_UltCount >= 6) {
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
    document.getElementById('charaID_2').innerText = getCharaText(charaInfo.charaID, 'name') ?? charaInfo.name;
    playerRight_chargeNum = charaInfo.charge;
    document.getElementById('charge_2').innerText = playerRight_chargeNum;
    document.getElementById('Ability_2').innerText = getCharaText(charaInfo.charaID, 'Ability') ?? charaInfo.Ability;
    document.getElementById('AbilityDetail_2').innerText = getCharaText(charaInfo.charaID, 'AbilityDetail') ?? charaInfo.AbilityDetail;
        
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

// ページを離れる直前のベストエフォート処理。非同期処理の完了は保証されない（特にモバイル）ため、
// 本来の安全網はハートビート＋相手の生存時刻監視（startHeartbeat）側にある。
function notifyLeaveOnExit() {
    try {
        updateLeaveRooms();
        //resetTimeLimit();
        //clearTimeRemaining();
    } catch (error) {
        console.error("エラー発生:", error);
    }
}

window.addEventListener("beforeunload", notifyLeaveOnExit);
// pagehideはモバイルでbeforeunloadが発火しないケースのフォールバック
window.addEventListener("pagehide", notifyLeaveOnExit);

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

let leaveAlreadyTriggered = false; // 生存時刻の鮮度切れによるupdateLeaveRooms()の多重発火防止

// 対局中、自分の生存時刻を定期送信しつつ、相手の生存時刻の鮮度を監視する。
// watchRoomUpdates()開始後（roomID/player_info/firestoreRoomDocRef確定後）に1回呼ぶ。
function startHeartbeat() {
    stopHeartbeats();
    leaveAlreadyTriggered = false;

    const sendBeat = () => {
        if (document.visibilityState !== 'visible') return;
        if (isMatchFinalized || !firestoreRoomDocRef) return;
        const field = player_info === 'P1' ? 'player1_LastActive' : 'player2_LastActive';
        updateDoc(firestoreRoomDocRef, { [field]: serverTimestamp() }).catch((e) => {
            console.error("[heartbeat] failed:", e);
        });
    };
    sendBeat();
    heartbeatIntervalId = setInterval(sendBeat, HEARTBEAT_INTERVAL_MS);

    enemyStaleCheckIntervalId = setInterval(() => {
        if (isMatchFinalized || leaveAlreadyTriggered || enemyLastActiveMs == null) return;
        if (Date.now() - enemyLastActiveMs > STALE_THRESHOLD_MS) {
            console.log("[heartbeat] 相手の生存時刻が古いため離脱とみなします");
            leaveAlreadyTriggered = true;
            updateLeaveRooms();
        }
    }, 5000);
}

function stopHeartbeats() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
    if (enemyStaleCheckIntervalId) {
        clearInterval(enemyStaleCheckIntervalId);
        enemyStaleCheckIntervalId = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && heartbeatIntervalId && firestoreRoomDocRef && !isMatchFinalized) {
        const field = player_info === 'P1' ? 'player1_LastActive' : 'player2_LastActive';
        updateDoc(firestoreRoomDocRef, { [field]: serverTimestamp() }).catch((e) => {
            console.error("[heartbeat] resume failed:", e);
        });
    }
});

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

    // 設定ダイアログ（石カラー・必殺技演出強度・音量）
    // ★ 認証やマッチデータ取得とは無関係に動くため、それらより前に必ず初期化する
    //   （displayThumbnails等が失敗してもユーザーが設定画面に到達できるようにする）
    setupSettingsModal('settingsButton', 'settingsModal');
    bindSettingsUI(document.getElementById('settingsModal'), () => {
        // 石カラー変更時に即座に盤面を再描画
        init_drawBoard(true);
        disp_TopStone(turn, nowCol);
    });
    initLang();

    // 言語切替時: キャラ名・必殺技・称号を即時更新
    document.querySelectorAll('input[name="langSelect"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (charaInfo1) {
                const n = document.getElementById('charaID_1');
                if (n) n.innerText = getCharaText(charaInfo1.charaID, 'name') ?? charaInfo1.name;
                const a = document.getElementById('Ability_1');
                if (a) a.innerText = getCharaText(charaInfo1.charaID, 'Ability') ?? charaInfo1.Ability;
                const d = document.getElementById('AbilityDetail_1');
                if (d) d.innerText = getCharaText(charaInfo1.charaID, 'AbilityDetail') ?? charaInfo1.AbilityDetail;
            }
            if (charaInfo2) {
                const n = document.getElementById('charaID_2');
                if (n) n.innerText = getCharaText(charaInfo2.charaID, 'name') ?? charaInfo2.name;
                const a = document.getElementById('Ability_2');
                if (a) a.innerText = getCharaText(charaInfo2.charaID, 'Ability') ?? charaInfo2.Ability;
                const d = document.getElementById('AbilityDetail_2');
                if (d) d.innerText = getCharaText(charaInfo2.charaID, 'AbilityDetail') ?? charaInfo2.AbilityDetail;
            }
            applyTitleDisplay(document.getElementById('playerTitles_1'), cachedLeftRating);
            applyTitleDisplay(document.getElementById('playerTitles_2'), cachedRightRating);
        });
    });

    // Auth完了を待機（Security Rulesで auth != null が必要）
    try {
        await authReady;
        console.log("[gameLogic] Auth ready");
    } catch (error) {
        console.error("[gameLogic] Auth failed:", error);
    }

    await displayThumbnails(); // サムネイルの表示

    backcolor_player(turn);
    watchRoomUpdates(); // リアルタイムのルーム更新を監視
    startHeartbeat(); // 自分の生存時刻送信＋相手の生存時刻監視（離脱検知）を開始

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
                if (getClickMode() === 'single') {
                    if (winningflg == 0) handleStoneDrop(event);
                } else {
                    handleTouchTap(event);
                }
            }
        }
        isMoving = false;
    });

    // --- topCanvas: クリック（モードに応じて即投下 or 列選択） ---
    topCanvas.addEventListener("click", (event) => {
        if (!selectedCharacter) {
            if (getClickMode() === 'single') {
                if (winningflg == 0) handleStoneDrop(event);
            } else {
                handleTouchTap(event);
            }
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
                if (getClickMode() === 'single') {
                    if (winningflg == 0) handleStoneDrop(event);
                } else {
                    handleTouchTap(event);
                }
            }
        }
        isMoving = false;
    });

    // --- canvas: クリック（モードに応じて即投下 or 列選択） ---
    canvas.addEventListener("click", (event) => {
        if (!selectedCharacter) {
            if (getClickMode() === 'single') {
                if (winningflg == 0) handleStoneDrop(event);
            } else {
                handleTouchTap(event);
            }
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
        // 2回目タップ：同じ列 → 石を落とす（連打ロック）
        if (dropInProgress) return;
        pendingDropCol = -1;
        dropInProgress = true;
        canvas.style.pointerEvents = 'none';
        topCanvas.style.pointerEvents = 'none';
        dropStone(col).finally(() => {
            dropInProgress = false;
            canvas.style.pointerEvents = 'auto';
            topCanvas.style.pointerEvents = 'auto';
        });
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

// P2側：自分のuser docの解放済みアチーブメントを試合前のスナップショットと比較し、
// 新規解放分があればトーストを出す（P1はhandleBO3Final内で直接トーストするためここでは扱わない）
function checkAndToastNewAchievements(myRating) {
    if (!myRating || achievementToastShownForMatch) return;
    const currentAchievements = myRating.achievements || [];
    const newlyUnlocked = currentAchievements.filter((id) => !myPreAchievements.has(id));
    if (newlyUnlocked.length > 0) {
        achievementToastShownForMatch = true;
        newlyUnlocked.forEach((id) => {
            showAchievementToast(id);
            const unlocked = characterData.find(c => c.requiredAchievementId === id);
            if (unlocked) showCharacterUnlockModal(unlocked);
        });
    }
}

async function watchRoomUpdates() {
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID));

    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            // P2: ドキュメント削除を検知（P1がTransaction後に削除）
            console.log("[watchRoom] Room document deleted");
            return;
        }

        // BO3確定後は全処理をスキップ（rated検知のみ許可）
        if (isMatchFinalized) {
            snapshot.forEach(async (doc) => {
                const data = doc.data();
                if (data.rated === true && player_info === "P2") {
                    console.log("[Rating] P2: rated===true 検知（finalized後）");
                    const myRating = await getUserRating(playerLeft_ID);
                    if (myRating) console.log("[Rating] P2 updated rating:", myRating);
                    checkAndToastNewAchievements(myRating);
                }
            });
            return;
        }

        snapshot.forEach(async (doc) => {
            const data = doc.data();

            // 相手のハートビート（生存時刻）を記録。一定時間更新が無ければ離脱とみなす
            const enemyField = player_info === 'P1' ? data.player2_LastActive : data.player1_LastActive;
            if (enemyField?.toMillis) {
                enemyLastActiveMs = enemyField.toMillis();
            }

            // P2: rated===true を検知したらレート情報を再取得
            if (data.rated === true && player_info === "P2") {
                console.log("[Rating] P2: rated===true 検知、レート情報を再取得");
                const myRating = await getUserRating(playerLeft_ID);
                if (myRating) {
                    console.log("[Rating] P2 updated rating:", myRating);
                }
                checkAndToastNewAchievements(myRating);
            }

            // 部屋のステータスが "leave" になった場合の処理
            if (data.status === "leave") {
                if (isMatchFinalized) return;
                isMatchFinalized = true;
                console.log("対戦相手が部屋を離れました。試合を中断します。");

                // レーティング更新（leave扱い：自分が勝者）
                await handleBO3Final(playerLeft_Color, "leave");

                // 試合を終了してキャラクター画面に戻す処理
                displayLeaveMessage();
                return;
            }

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
              if (isMatchFinalized) return;
              isMatchFinalized = true;
              console.log("相手が2回時間切れ。勝利として終了します。");
              // レーティング更新（timeout扱い：自分が勝者）
              await handleBO3Final(playerLeft_Color, "timeout");
              displayVictory(playerLeft_Color);
              return;
            }

            if (myTimeout >= 2) {
              if (isMatchFinalized) return;
              isMatchFinalized = true;
              console.log("自分が2回時間切れ。敗北として終了します。");
              // レーティング更新（timeout扱い：相手が勝者）
              await handleBO3Final(playerRight_Color, "timeout");
              displayVictory(playerRight_Color);
              return;
            }

            // 銀狼LV.999 必殺技による試合終了（非発動者クライアントが検知）
            if (data.silverwolfMatchWinner && !isMatchFinalized) {
              isMatchFinalized = true;
              const winnerColor = data.silverwolfMatchWinner;
              const isStraightWin = winnerColor === 'red' ? yellow_Win === 0 : red_Win === 0;
              await handleBO3Final(winnerColor, "normal", { isStraightWin, isComebackWin: false });
              displayVictory(winnerColor);
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
            
            // ターン変化検知（クロスターンエフェクト用）
            const turnJustChangedToMe = (pvpPrevTurn !== data.turn && data.turn === player_info);
            pvpPrevTurn = data.turn;

            // クロスターンエフェクト状態をFirestoreから同期
            pvpZhongliBlocked = data.zhongliBlocked || null;
            pvpZhongliTurnsLeft = data.zhongliTurnsLeft || 0;
            pvpZhongliCasterColor = data.zhongliCasterColor || null;
            pvpDurinPending = data.durinPending || false;
            pvpDurinCasterColor = data.durinCasterColor || null;
            pvpCerluaActive = data.cerluaActive || false;
            pvpCerluaCasterColor = data.cerluaCasterColor || null;

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

                    red_Win += 1;
                    yellow_Win += 1;
                    if (playerLeft_Color === 'red') {
                        updateWinLabels(red_Win, yellow_Win);
                    } else {
                        updateWinLabels(yellow_Win, red_Win);
                    }

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

                // 0-2の劣勢を記録（アチーブメント「大逆転」判定用。このラウンド更新後の値で判定する）
                if (red_Win === 0 && yellow_Win === 2) redComebackFromDown02 = true;
                if (yellow_Win === 0 && red_Win === 2) yellowComebackFromDown02 = true;

                // 勝利したときのラベル表示（YOU WIN:YOU LOSE）
                await showWinner(result);
                
                console.log("↑↑↑↑↑↑↑↑↑↑↑");
            } 
            
            if (red_Win === 3 || yellow_Win === 3) {
                // 二重発火防止
                if (isMatchFinalized) {
                    console.log("[BO3] Already finalized, skipping");
                    return;
                }
                isMatchFinalized = true;

                console.log("◆◆◆◆◆◆◆◆◆◆◆");
                console.log("勝利判定②（BO3確定）");

                // 引き分けで両者同時に3点到達（マッチドロー）
                if (red_Win === 3 && yellow_Win === 3) {
                    console.log("◆判定:マッチドロー（3-3）");
                    resetTimeLimit();
                    await handleBO3MatchDraw();
                    displayMatchDraw();
                    console.log("◆◆◆◆◆◆◆◆◆◆◆");
                    return;
                }

                const winningColor = red_Win === 3 ? "red" : "yellow";
                const isStraightWin = winningColor === "red" ? yellow_Win === 0 : red_Win === 0;
                const isComebackWin = winningColor === "red" ? redComebackFromDown02 : yellowComebackFromDown02;

                // レーティング更新処理（ranked のみ）
                await handleBO3Final(winningColor, "normal", { isStraightWin, isComebackWin });

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
                // クロスターンエフェクトを処理（勝利なしのターン切替時）
                await processPvpCrossTurnEffects(turnJustChangedToMe);

                // 鍾離封鎖列のオーバーレイ表示を更新
                updateZhongliBlockOverlays();

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
    // ラウンドリセット時にクロスターンエフェクトもクリアする
    pvpZhongliBlocked = null;
    pvpZhongliTurnsLeft = 0;
    pvpZhongliCasterColor = null;
    pvpZhongliOverlays.forEach(el => el.remove());
    pvpZhongliOverlays = [];
    pvpDurinPending = false;
    pvpDurinCasterColor = null;
    pvpCerluaActive = false;
    pvpCerluaCasterColor = null;

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomID", "==", roomID));
    const updates = {
        stones: {},                  // stonesのリセット
        turnCount: 1,                // ターンカウントのリセット
        startP: startP,
        turn: startP,
        red_Win: red_Win,        // 赤プレイヤー勝利数
        yellow_Win: yellow_Win,         // 黄プレイヤー勝利数
        changeStone: 0,
        zhongliBlocked: null,
        zhongliTurnsLeft: 0,
        zhongliCasterColor: null,
        durinPending: false,
        durinCasterColor: null,
        cerluaActive: false,
        cerluaCasterColor: null
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
// hex色("#rrggbb")をrgba()文字列に変換する（設定で選んだ石カラーをグラデーションに反映するため）
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function showTurnLabel() {
  const turnLabel = document.getElementById("turnLabel");

  const isMyTurn = isTurnPlayer();
  const turnlbl = isMyTurn ? t('turnYours') : t('turnOpponent');

  // ★ここが本体：今ターンの色を決める
  const turnColor = (turn === player_info) ? playerLeft_Color : playerRight_Color;
  const turnHex = getDisplayColor(turnColor);

  turnLabel.style.background =
    `linear-gradient(90deg, ${hexToRgba(turnHex, 0.8)}, ${hexToRgba(turnHex, 0.5)})`;

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
    // ターンプレイヤーか確認 + 連打ロック（チェックとロックは同期的に行うことで多重実行を防ぐ）
    if (!isTurnPlayer() || dropInProgress) return;
    dropInProgress = true;
    // ロックと同時にクリックイベント自体を止める（キューイングされた連打が後で消化されるのを防ぐ）
    canvas.style.pointerEvents = 'none';
    topCanvas.style.pointerEvents = 'none';
    dropStone(nowCol).finally(() => {
        dropInProgress = false;
        canvas.style.pointerEvents = 'auto';
        topCanvas.style.pointerEvents = 'auto';
    });
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

  // 鍾離封鎖中の列には投下不可
  if (pvpZhongliBlocked && pvpZhongliBlocked.includes(column)) return;

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
    // メインの石を描画（'red'/'yellow'は役割名。実際の表示色は設定に応じてマッピングする）
    topCtx.fillStyle = getDisplayColor(color);
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
    // 'red'/'yellow'は役割名。実際の表示色は設定に応じてマッピングする
    _drawPiece(ctx, column, y, getDisplayColor(color), cellSize);
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
    let isMyWin = false;
    let isDraw = false;

    if (result.red && !result.yellow) {
        isMyWin = playerLeft_Color === 'red';
        if (isMyWin) {
            turnlbl = t('winLabelWin');
            turnLabel.innerHTML = `${turnlbl}<br>${red_Win} - ${yellow_Win}`;
        } else {
            turnlbl = t('winLabelLose');
            turnLabel.innerHTML = `${turnlbl}<br>${yellow_Win} - ${red_Win}`;
        }
    } else if (!result.red && result.yellow) {
        isMyWin = playerLeft_Color === 'yellow';
        if (isMyWin) {
            turnlbl = t('winLabelWin');
            turnLabel.innerHTML = `${turnlbl}<br>${yellow_Win} - ${red_Win}`;
        } else {
            turnlbl = t('winLabelLose');
            turnLabel.innerHTML = `${turnlbl}<br>${red_Win} - ${yellow_Win}`;
        }
    } else if (result.red && result.yellow) {
        isDraw = true;
        turnlbl = t('winLabelDraw');
        turnLabel.innerHTML = `${turnlbl}<br>${red_Win} - ${yellow_Win}`;
    }

    // 演出: 勝ち=祝福のフラッシュ+紙吹雪、負け=衝撃の赤フラッシュ+シェイク、引き分け=控えめなフラッシュ
    // (画面幅基準なのでスマホ/PCどちらでも中央に発生する)
    const burstX = window.innerWidth / 2;
    const burstY = window.innerHeight / 2;
    if (isDraw) {
        fxFlash('rgba(200, 200, 200, 0.3)', 200);
    } else if (isMyWin) {
        fxFlash('rgba(255, 215, 0, 0.4)', 250);
        fxParticles(burstX, burstY, ['#ffd700', '#ff7a00', '#fff6cc', '#5cff5c', '#5cc8ff'], 26);
    } else {
        fxFlash('rgba(180, 0, 0, 0.45)', 220);
        fxShake(document.getElementById('centerPanel'), 14, 400);
    }

    // フェードイン + ポップイン演出
    turnLabel.classList.remove('label-pop');
    turnLabel.style.display = "block"; // 初めに表示状態に
    setTimeout(() => {
        turnLabel.style.opacity = 1; // 透明度を1にしてフェードイン
        turnLabel.classList.add('label-pop');
    }, 10); // 少し遅れて実行（レイアウトを反映させるため）

    // 3秒後にフェードアウト
    await new Promise(resolve => {
        setTimeout(() => {
            turnLabel.style.opacity = 0; // 透明度を0にしてフェードアウト
        }, 3000); // 3秒後にフェードアウト

        // フェードアウト後に完全に非表示にする
        setTimeout(() => {
            turnLabel.style.display = "none"; // 透明度が0になったら非表示
            turnLabel.classList.remove('label-pop');
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
        
         // ★ターン側じゃない場合：相手のターンでタイムアウト
         // → 5秒の猶予後にFirestore更新がなければ相手切断とみなす
         if (!isTurnPlayer()) {
           timeLimitGauge.style.width = "0%";
           console.log("[Timeout] 相手ターンでタイムアウト。5秒の猶予タイマー開始");
           disconnectTimer = setTimeout(async () => {
               if (isMatchFinalized) return;
               isMatchFinalized = true;
               console.log("[Timeout] 猶予タイマー満了。相手切断として処理");
               await handleBO3Final(playerLeft_Color, "timeout");
               displayVictory(playerLeft_Color);
           }, 5000);
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

    // 相手切断検知用の猶予タイマーがあればキャンセル
    if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
        console.log("[resetTimeLimit] 猶予タイマーをキャンセル");
    }

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

// マッチドロー（3-3同時到達）：レート変動なし、rooms削除のみ（P1のみ実行）
async function handleBO3MatchDraw() {
    if (player_info !== "P1") {
        console.log("[Rating] P2: マッチドロー後処理はP1に委任");
        return;
    }
    if (!firestoreRoomDocRef) {
        console.warn("[Rating] firestoreRoomDocRef is null, skipping match draw cleanup");
        return;
    }
    try {
        await deleteRoomAfterRating(firestoreRoomDocRef);
        console.log("[Rating] マッチドロー：rooms削除完了");
    } catch (error) {
        console.error("[Rating] マッチドロー rooms削除失敗:", error);
    }
}

function displayMatchDraw() {
    stopHeartbeats();

    const victoryModal = document.getElementById("victoryModal");
    const victoryImage = document.getElementById("victoryImage");
    const victoryMessage = document.getElementById("victoryMessage");
    const ratingChangeEl = document.getElementById("ratingChange");

    document.getElementById('leaveButtonContainer').style.display = 'none';

    victoryImage.src = playerLeft_Image;
    victoryMessage.textContent = t('victoryMsgDraw');

    fxFlash('rgba(200, 200, 200, 0.3)', 200);

    victoryModal.style.display = "block";
    ratingChangeEl.style.display = "none";

    setTimeout(() => {
        window.location.href = "select.html?mode=match";
    }, 8000);
}

// BO3確定時のレーティング更新処理
// winningColor: 勝者の色 ("red" | "yellow")
// resultType: "normal" | "leave" | "timeout"
// matchFlags: { isStraightWin, isComebackWin } - "normal"決着時のみ意味を持つ
async function handleBO3Final(winningColor, resultType, matchFlags = {}) {
    // P2はレート処理に関与しない（P1のみが全責務を持つ）
    if (player_info !== "P1") {
        console.log("[Rating] P2: レート処理はP1に委任");
        return;
    }

    if (!firestoreRoomDocRef) {
        console.warn("[Rating] firestoreRoomDocRef is null, skipping rating");
        return;
    }

    const { isStraightWin = false, isComebackWin = false } = matchFlags;

    // 勝者UIDの特定（P1視点: playerLeft = P1, playerRight = P2）
    const isMeWinner = (playerLeft_Color === winningColor);
    const winnerUid = isMeWinner ? playerLeft_ID : playerRight_ID;

    const p1Uid = playerLeft_ID;
    const p2Uid = playerRight_ID;
    const p1CharaId = playerLeft_CharaID;
    const p2CharaId = playerRight_CharaID;

    console.log("[Rating] handleBO3Final:", { winningColor, resultType, matchType, winnerUid, p1Uid, p2Uid });

    try {
        // 1. roomsに結果フィールドを書き込み（P1のみ）
        await writeBO3Result(firestoreRoomDocRef, {
            winnerUid,
            resultType,
            matchType,
            p1CharaId,
            p2CharaId
        });
        console.log("[Rating] writeBO3Result 完了");

        // 2. ranked の場合のみ Transaction 実行
        if (matchType === "ranked") {
            const result = await executeRatingTransaction(firestoreRoomDocRef, p1Uid, p2Uid);
            if (result) {
                console.log("[Rating] レート更新完了:", result);

                // アチーブメント関連スタッツの更新（rating/winCount/charaWinsとは別フィールド。
                // 失敗してもレート処理自体には影響させないようtry/catchで隔離する）
                try {
                    const ratingFor = (uid) => (uid === winnerUid ? result.winnerNewRating : result.loserNewRating);
                    const isCleanWin = resultType === "normal";
                    const [p1Newly] = await Promise.all([
                        recordPvpMatchAchievements(p1Uid, {
                            newRating: ratingFor(p1Uid),
                            ultCountThisMatch: playerLeft_UltCount,
                            isWinner: winnerUid === p1Uid,
                            isStraightWin, isCleanWin, isComebackWin,
                            myCharaId: playerLeft_CharaID,
                        }),
                        recordPvpMatchAchievements(p2Uid, {
                            newRating: ratingFor(p2Uid),
                            ultCountThisMatch: playerRight_UltCount,
                            isWinner: winnerUid === p2Uid,
                            isStraightWin, isCleanWin, isComebackWin,
                            myCharaId: playerRight_CharaID,
                        }),
                    ]);
                    // playerLeft = P1 = 自分。自分の新規解放分のみトースト表示する（P2は別途rated検知で表示）
                    achievementToastShownForMatch = true;
                    p1Newly.forEach((id) => {
                        showAchievementToast(id);
                        const unlocked = characterData.find(c => c.requiredAchievementId === id);
                        if (unlocked) showCharacterUnlockModal(unlocked);
                    });
                } catch (achError) {
                    console.error("[Achievement] PvP実績更新失敗:", achError);
                }
            } else {
                console.warn("[Rating] Transaction returned null（条件不一致 or エラー）");
            }
        } else {
            console.log("[Rating] private マッチ: レート更新スキップ");
        }

        // 3. Transaction成功後にrooms削除（P1のみ）
        await deleteRoomAfterRating(firestoreRoomDocRef);
        console.log("[Rating] rooms削除完了");

    } catch (error) {
        console.error("[Rating] handleBO3Final error:", error);
        // エラー時もrooms削除を試みる
        try {
            await deleteRoomAfterRating(firestoreRoomDocRef);
        } catch (delErr) {
            console.error("[Rating] rooms削除も失敗:", delErr);
        }
    }
}

//------------------------------------------------------------------------------------------------

function displayVictory(winningColor) {
    stopHeartbeats(); // 試合確定。ハートビート送信・相手生存監視を停止

    const victoryModal = document.getElementById("victoryModal");
    const victoryImage = document.getElementById("victoryImage");
    const victoryMessage = document.getElementById("victoryMessage");
    const ratingChangeEl = document.getElementById("ratingChange");

    document.getElementById('leaveButtonContainer').style.display = 'none'; // 試合終了後は退出ボタンを隠す

    const isMyWin = winningColor === playerLeft_Color;

    // 勝利キャラ画像とメッセージを設定
    if (winningColor === "red") {
        victoryImage.src = playerLeft_Color === 'red' ? playerLeft_Image : playerRight_Image;
        victoryMessage.textContent = `${playerLeft_Color === 'red' ? playerLeft_Name : playerRight_Name} WIN!!`;
    } else if (winningColor === "yellow") {
        victoryImage.src = playerLeft_Color === 'yellow' ? playerLeft_Image : playerRight_Image;
        victoryMessage.textContent = `${playerLeft_Color === 'yellow' ? playerLeft_Name : playerRight_Name} WIN!!`;
    }

    // 演出: 自分が勝った場合は祝福のフラッシュ+紙吹雪+金色の光彩、負けた場合は控えめな赤フラッシュ+シェイク
    // (画面幅基準なのでスマホ/PCどちらでも中央に発生する)
    const burstX = window.innerWidth / 2;
    const burstY = window.innerHeight / 2;
    victoryModal.classList.remove('victory-pop', 'victory-glow');
    if (isMyWin) {
        fxFlash('rgba(255, 215, 0, 0.5)', 300);
        fxParticles(burstX, burstY, ['#ffd700', '#ff7a00', '#fff6cc', '#5cff5c', '#5cc8ff', '#ff5c8a'], 36);
        requestAnimationFrame(() => victoryModal.classList.add('victory-glow'));
    } else {
        fxFlash('rgba(150, 0, 0, 0.4)', 220);
        fxShake(document.getElementById('centerPanel'), 10, 350);
        requestAnimationFrame(() => victoryModal.classList.add('victory-pop'));
    }

    // モーダルを表示
    victoryModal.style.display = "block";

    // rankedマッチの場合のみレート変動を表示
    if (matchType === "ranked" && myPreRating !== null) {
        ratingChangeEl.textContent = t('ratingCalculating');
        fetchAndAnimateRating(ratingChangeEl);
    } else {
        ratingChangeEl.style.display = "none";
    }

    // 8秒後にキャラ選択画面に戻る（レートアニメーション分を考慮）
    setTimeout(() => {
        window.location.href = "select.html?mode=match";
    }, 8000);
}

// レート変動を取得してアニメーション表示
async function fetchAndAnimateRating(element, retryCount = 0) {
    const MAX_RETRY = 5;
    const RETRY_DELAY = 1500;

    try {
        const updatedData = await getUserRating(playerLeft_ID);
        const newRating = updatedData?.rating ?? myPreRating;

        // トランザクション未完了の場合リトライ
        if (newRating === myPreRating && retryCount < MAX_RETRY) {
            console.log(`[Rating] レート未更新、リトライ ${retryCount + 1}/${MAX_RETRY}`);
            setTimeout(() => fetchAndAnimateRating(element, retryCount + 1), RETRY_DELAY);
            return;
        }

        animateRatingChange(element, myPreRating, newRating, 2000);
    } catch (e) {
        console.warn("[Rating] レート変動取得失敗:", e);
        element.textContent = "";
    }
}

// カウントアップ/ダウンアニメーション
function animateRatingChange(element, fromRating, toRating, duration) {
    const diff = toRating - fromRating;
    const isUp = diff >= 0;

    element.className = isUp ? "rating-up" : "rating-down";

    const startTime = performance.now();

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOut で最後に減速
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(fromRating + diff * eased);

        if (progress < 1) {
            element.textContent = `R: ${current}`;
            requestAnimationFrame(tick);
        } else {
            // 完了時: 差分も表示
            const sign = diff >= 0 ? "+" : "";
            element.textContent = `R: ${toRating} (${sign}${diff})`;
        }
    }

    requestAnimationFrame(tick);
}

function displayLeaveMessage() {
    stopHeartbeats(); // 試合確定。ハートビート送信・相手生存監視を停止

    const victoryModal = document.getElementById("victoryModal");
    const victoryImage = document.getElementById("victoryImage");
    const victoryMessage = document.getElementById("victoryMessage");
    const ratingChangeEl = document.getElementById("ratingChange");

    document.getElementById('leaveButtonContainer').style.display = 'none'; // 試合終了後は退出ボタンを隠す

    victoryImage.src = playerLeft_Image;
    victoryMessage.innerHTML = t('msgOpponentLeft');

    // モーダルを表示
    victoryModal.style.display = "block";

    // rankedマッチの場合のみレート変動を表示
    if (matchType === "ranked" && myPreRating !== null) {
        ratingChangeEl.textContent = t('ratingCalculating');
        fetchAndAnimateRating(ratingChangeEl);
    } else {
        ratingChangeEl.style.display = "none";
    }

    // 8秒後にキャラ選択画面に戻る
    setTimeout(() => {
        window.location.href = "select.html?mode=match";
    }, 8000);
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

            // 初期位置は画面外（centerPanel の横幅に基づく）+ 突入前の縮小・回転
            const parentWidth = centerPanel.offsetWidth; // centerPanel の横幅を取得
            cutinImage.classList.remove('ult-cutin-glow');
            cutinImage.style.transition = 'none';
            cutinImage.style.right = `-${parentWidth}px`; // 横幅に基づいて初期位置設定
            cutinImage.style.opacity = '0'; // 初期状態で非表示
            cutinImage.style.transform = 'scale(1.3) rotate(-3deg)';

            // 衝撃の予兆フラッシュ + 盤面シェイク（スライドインと同時に発火）
            setTimeout(() => {
                fxFlash('rgba(255, 60, 20, 0.55)', 250);
                fxShake(centerPanel, 16, 500);

                // スライドイン + フェードイン + 着地時にオーバーシュートする弾けるような演出
                cutinImage.style.transition =
                    'right 0.6s cubic-bezier(0.17, 0.84, 0.44, 1), opacity 0.4s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                cutinImage.style.right = '0'; // 画面内にスライドイン
                cutinImage.style.opacity = '1'; // フェードイン
                cutinImage.style.transform = 'scale(1) rotate(0deg)';
                cutinImage.classList.add('ult-cutin-glow'); // 表示中は脈動する光彩
            }, 50); // 少し遅れてアニメーション開始

            // 2.5秒後にスライドアウトとフェードアウト
            setTimeout(() => {
                cutinImage.classList.remove('ult-cutin-glow');
                cutinImage.style.transition = 'right 1s ease-in-out, opacity 1s ease-in-out, transform 1s ease-in-out';
                cutinImage.style.right = `-${parentWidth}px`; // 横幅に基づいて画面外にスライドアウト
                cutinImage.style.opacity = '0'; // フェードアウト
                cutinImage.style.transform = 'scale(1.1)';

                // フェードアウト後に非表示
                setTimeout(() => {
                    cutinContainer.style.display = 'none'; // 完全に非表示
                    cutinImage.style.transform = '';
                    resolve(); // カットイン終了を通知
                }, 1000); // フェードアウトのアニメーション終了後
            }, 2500); // 2.5秒後にスライドアウトとフェードアウト
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
        
        // ★演出を一発の「衝撃」に揃えるため、件数に依存しない固定待機に変更
        //   （以前は stonesToDelete.length * 500ms で多列破壊時に最大9秒近く待たされていた）
        await wait(700);
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
    if (stonesToDelete.length === 0) return;

    const canvasRect = canvas.getBoundingClientRect(); // Canvasの位置とサイズを取得
    const cellW = canvasRect.width / cols;
    const cellH = canvasRect.height / rows;

    // 全セットを同時に光らせる（以前は1個ずつ順番に光って消える直列処理で地味だった）
    const highlightedCells = [];
    const shatterTargets = [];
    for (const stoneKey of stonesToDelete) {
        const [col, row] = stoneKey.split('_').map(Number);

        if (isNaN(col) || isNaN(row)) {
            console.error("Invalid stoneKey format:", stoneKey);
            continue;
        }

        const centerX = canvasRect.left + (col + 0.5) * cellW;
        const centerY = canvasRect.top + (row + 0.5) * cellH;

        // 新しいハイライト要素を作成
        const highlightedCell = document.createElement('div');
        highlightedCell.classList.add('cell', 'selected'); // CSSのクラスを適用

        // ハイライトのスタイルを設定（getBoundingClientRect基準でscale非依存）
        highlightedCell.style.position = 'fixed';
        highlightedCell.style.width = `${cellW}px`;
        highlightedCell.style.height = `${cellH}px`;
        highlightedCell.style.left = `${canvasRect.left + col * cellW}px`;
        highlightedCell.style.top = `${canvasRect.top + row * cellH}px`;
        highlightedCell.style.pointerEvents = 'none';

        document.body.appendChild(highlightedCell);
        highlightedCells.push(highlightedCell);

        // 破壊される石の位置から弾けるパーティクル
        fxParticles(centerX, centerY);
        shatterTargets.push({ cx: centerX, cy: centerY, color: stonesData[stoneKey]?.color || 'red' });
    }

    // 石砕けシャード演出（renderer.jsのspawnStoneShatter。削除する場合はこの1行とfxShatterのimport/定義を消す）
    fxShatter(shatterTargets);

    // 衝撃フラッシュ + 盤面シェイク（破壊数が多いほど少し強めに）
    fxFlash('rgba(255, 140, 0, 0.35)', 180);
    fxShake(document.getElementById('centerPanel'), Math.min(6 + highlightedCells.length, 18), 350);

    // 全セルを同時に少し保持してから一括で消す
    const holdTime = Math.min(wt, 450);
    await wait(holdTime);

    highlightedCells.forEach(cell => cell.remove());
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
        const p2_Time = Math.max(0, (roomData.player2_TimeLimit ?? 100) - 19);
        playerRight_TimeLimit = p2_Time;
        await updateDoc(roomDocRef, {
          player1_ChargeNow: p1_chargeNow,
          player2_ChargeNow: p2_chargeNow,
          player2_TimeLimit: p2_Time,
        });
        console.log("[ULT] 相手(P2)の思考時間を減少:", { before: roomData.player2_TimeLimit, after: p2_Time });
      } else {
        // 自分がP2 → 相手はP1 → player1_TimeLimit を減らす
        const p1_Time = Math.max(0, (roomData.player1_TimeLimit ?? 100) - 19);
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

//------------------------------------------------------------------------------------------------

async function ult_ruanMei() {
    console.log("ルアン・メェイの必殺技発動！");
    try {
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error("Room not found.");
            return;
        }

        const roomDoc = querySnapshot.docs[0];
        const roomData = roomDoc.data();
        const localStones = Object.assign({}, roomData.stones || {});
        for (const key in localStones) {
            localStones[key] = Object.assign({}, localStones[key]);
        }

        const myColor = playerLeft_Color;
        const opponentColor = myColor === 'red' ? 'yellow' : 'red';

        // Phase 1: 相手の石をランダムに3個選び自分の色に変換
        const opponentKeys = Object.keys(localStones).filter(k => localStones[k]?.color === opponentColor);
        const keysToConvert = getRandomElements(opponentKeys, Math.min(3, opponentKeys.length));

        if (keysToConvert.length > 0) {
            await highlightStones(keysToConvert, 400);
            for (const key of keysToConvert) {
                localStones[key] = Object.assign({}, localStones[key], { color: myColor });
            }
        }

        // 変換後の勝利判定（Phase 2 実行前に確認）
        const winAfterConvert = checkWin(localStones);

        // Phase 1 をFirestoreへ書き込み（チャージ消費もここで処理）
        const [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false);
        const roomDocRef = doc(db, "rooms", roomDoc.id);
        await updateDoc(roomDocRef, {
            player1_ChargeNow: p1_chargeNow,
            player2_ChargeNow: p2_chargeNow,
            stones: localStones
        });
        // モジュールレベルのstonesDataを直接更新してから再描画（handleRoomUpdateを待たない）
        stonesData = localStones;
        init_drawBoard(true);

        if (winAfterConvert.red || winAfterConvert.yellow) {
            // 変換で勝利確定 → handleRoomUpdateが両側で勝利処理を行う
            return;
        }

        await wait(700); // 変換後の盤面を見せる間

        // Phase 2: 自分の石をランダムに6個選び破壊（重力落下あり）
        const myKeys = Object.keys(localStones).filter(k => localStones[k]?.color === myColor);
        const keysToDelete = getRandomElements(myKeys, Math.min(6, myKeys.length));

        if (keysToDelete.length === 0) return;

        await highlightStones(keysToDelete, 400);

        for (const key of keysToDelete) {
            delete localStones[key];
        }

        // 破壊後の空白を一瞬見せてから落下
        stonesData = localStones;
        init_drawBoard(true);
        await wait(400);

        // 削除後、影響を受けた列の石を重力でアニメーション落下
        await animateGravitySmooth(localStones, keysToDelete);

        await updateDoc(roomDocRef, { stones: localStones });
        stonesData = localStones;
        init_drawBoard(true);

    } catch (error) {
        console.error("ルアン・メェイの必殺技処理中にエラーが発生しました:", error);
    }
}

// 指定キーの列について、石を重力で下に詰め直す
function applyGravity(stonesRef, deletedKeys) {
    const affectedCols = new Set(deletedKeys.map(k => k.split('_')[0]));
    for (const col of affectedCols) {
        const colStones = [];
        for (let r = rows - 1; r >= 0; r--) {
            const key = `${col}_${r}`;
            if (stonesRef[key]) {
                colStones.push(stonesRef[key]);
                delete stonesRef[key];
            }
        }
        for (let i = 0; i < colStones.length; i++) {
            stonesRef[`${col}_${rows - 1 - i}`] = colStones[i];
        }
    }
}

function animateGravitySmooth(stonesRef, deletedKeys) {
    return new Promise(resolve => {
        const affectedCols = new Set(deletedKeys.map(k => k.split('_')[0]));
        const movingStones = [];

        for (const col of affectedCols) {
            const colEntries = [];
            for (let r = rows - 1; r >= 0; r--) {
                const key = `${col}_${r}`;
                if (stonesRef[key]) {
                    colEntries.push({ r, data: stonesRef[key] });
                    delete stonesRef[key];
                }
            }
            for (let i = 0; i < colEntries.length; i++) {
                const targetRow = rows - 1 - i;
                const fromRow = colEntries[i].r;
                if (fromRow !== targetRow) {
                    movingStones.push({
                        col: parseInt(col),
                        data: colEntries[i].data,
                        currentY: fromRow * cellSize,
                        targetY: targetRow * cellSize,
                    });
                } else {
                    stonesRef[`${col}_${fromRow}`] = colEntries[i].data;
                }
            }
        }

        stonesData = stonesRef;

        if (movingStones.length === 0) { init_drawBoard(true); resolve(); return; }

        const interval = setInterval(() => {
            for (const s of movingStones) {
                if (s.currentY < s.targetY) s.currentY = Math.min(s.currentY + 10, s.targetY);
            }
            init_drawBoard(true);
            for (const s of movingStones) drawPiece(s.col, s.currentY, s.data.color);

            if (movingStones.every(s => s.currentY >= s.targetY)) {
                clearInterval(interval);
                for (const s of movingStones) {
                    stonesRef[`${s.col}_${s.targetY / cellSize}`] = s.data;
                }
                stonesData = stonesRef;
                init_drawBoard(true);
                resolve();
            }
        }, 10);
    });
}

//------------------------------------------------------------------------------------------------
// 鍾離：封鎖列のビジュアルオーバーレイ管理
function updateZhongliBlockOverlays() {
    pvpZhongliOverlays.forEach(el => el.remove());
    pvpZhongliOverlays = [];
    if (!pvpZhongliBlocked || pvpZhongliBlocked.length === 0) return;

    const boardWrap = document.getElementById('boardWrap');
    if (!boardWrap) return;
    const wrapRect = boardWrap.getBoundingClientRect();
    const canvas = document.getElementById('connect4Canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const colWidth = wrapRect.width / cols;

    for (const col of pvpZhongliBlocked) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.width = `${colWidth}px`;
        overlay.style.height = `${canvasRect.height}px`;
        overlay.style.left = `${wrapRect.left + col * colWidth}px`;
        overlay.style.top = `${canvasRect.top}px`;
        overlay.style.pointerEvents = 'none';
        overlay.style.backgroundColor = 'rgba(80, 80, 80, 0.38)';
        overlay.style.border = '2px dashed rgba(255,255,255,0.7)';
        overlay.style.boxSizing = 'border-box';
        overlay.style.zIndex = '50';
        const lockLabel = document.createElement('div');
        lockLabel.style.cssText = 'text-align:center;color:white;font-size:24px;margin-top:6px;text-shadow:0 0 6px #000;font-weight:bold;';
        lockLabel.textContent = '×';
        overlay.appendChild(lockLabel);
        document.body.appendChild(overlay);
        pvpZhongliOverlays.push(overlay);
    }
}

// PvP用非満杯列をランダムに選ぶヘルパー
function pvpGetNonFullCols(count) {
    const nonFull = [];
    for (let c = 0; c < cols; c++) {
        if (findAvailableRow(c, stonesData) >= 0) nonFull.push(c);
    }
    return getRandomElements(nonFull, Math.min(count, nonFull.length));
}

//------------------------------------------------------------------------------------------------
// PvP クロスターンエフェクト処理
// handleRoomUpdate の「勝利なし」ブランチから呼び出される
async function processPvpCrossTurnEffects(turnJustChangedToMe) {
    if (!turnJustChangedToMe || !isTurnPlayer()) return;

    try {
        // ① ドゥリン：自分のターン開始時に自動破壊
        if (pvpDurinPending && playerLeft_Color === pvpDurinCasterColor) {
            const roomsRef = collection(db, "rooms");
            const q = query(roomsRef, where("roomID", "==", roomID));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const roomDoc = querySnapshot.docs[0];
                const localStones = Object.assign({}, roomDoc.data().stones || {});
                for (const k in localStones) localStones[k] = Object.assign({}, localStones[k]);

                const allKeys = Object.keys(localStones);
                const toDelete = getRandomElements(allKeys, Math.min(2, allKeys.length));
                if (toDelete.length > 0) {
                    await highlightStones(toDelete, 400);
                    for (const key of toDelete) delete localStones[key];
                    stonesData = localStones;
                    init_drawBoard(true);
                    await wait(400);
                    await animateGravitySmooth(localStones, toDelete);
                }
                await updateDoc(doc(db, "rooms", roomDoc.id), {
                    stones: localStones,
                    durinPending: false,
                    durinCasterColor: null
                });
                stonesData = localStones;
                init_drawBoard(true);
                pvpDurinPending = false;
            }
        }

        // ② 鍾離：ターン開始時の封鎖処理
        if (pvpZhongliBlocked !== null && playerLeft_Color === pvpZhongliCasterColor) {
            if (pvpZhongliTurnsLeft === 2) {
                // 相手1回目終了 → 自動再封鎖（2列再抽選）
                const newCols = pvpGetNonFullCols(2);
                pvpZhongliBlocked = newCols;
                pvpZhongliTurnsLeft = 1;
                await updateDoc(firestoreRoomDocRef, {
                    zhongliBlocked: newCols,
                    zhongliTurnsLeft: 1
                });
                updateZhongliBlockOverlays();
            } else if (pvpZhongliTurnsLeft === 1) {
                // 相手2回目終了 → 封鎖解除
                pvpZhongliBlocked = null;
                pvpZhongliTurnsLeft = 0;
                pvpZhongliCasterColor = null;
                await updateDoc(firestoreRoomDocRef, {
                    zhongliBlocked: null,
                    zhongliTurnsLeft: 0,
                    zhongliCasterColor: null
                });
                updateZhongliBlockOverlays();
            }
        }

        // ③ ケリュドラ：相手ターン後、自分(発動者)のターン開始時に追加投下
        if (pvpCerluaActive && playerLeft_Color === pvpCerluaCasterColor) {
            const victimColor = playerLeft_Color === 'red' ? 'yellow' : 'red';
            // 相手の最後の投下列を特定（turnCountが直前のもの）
            let lastVictimCol = -1;
            let maxTC = -1;
            for (const key in stonesData) {
                if (stonesData[key].color === victimColor && (stonesData[key].turnCount ?? 0) > maxTC) {
                    maxTC = stonesData[key].turnCount ?? 0;
                    lastVictimCol = parseInt(key.split('_')[0]);
                }
            }

            const roomsRef = collection(db, "rooms");
            const q = query(roomsRef, where("roomID", "==", roomID));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty && lastVictimCol >= 0) {
                const roomDoc = querySnapshot.docs[0];
                const localStones = Object.assign({}, roomDoc.data().stones || {});
                for (const k in localStones) localStones[k] = Object.assign({}, localStones[k]);

                const extraCol = findAvailableRow(lastVictimCol, localStones) >= 0
                    ? lastVictimCol
                    : pvpGetNonFullCols(1)[0] ?? -1;

                if (extraCol >= 0) {
                    const extraRow = findAvailableRow(extraCol, localStones);
                    if (extraRow >= 0) {
                        localStones[`${extraCol}_${extraRow}`] = { color: victimColor, turnCount: turnCount - 1 };
                        await updateDoc(doc(db, "rooms", roomDoc.id), {
                            stones: localStones,
                            cerluaActive: false,
                            cerluaCasterColor: null
                        });
                        stonesData = localStones;
                        init_drawBoard(true);
                        pvpCerluaActive = false;
                    }
                } else {
                    // 全列満杯：追加投下なしでフラグのみクリア
                    await updateDoc(firestoreRoomDocRef, { cerluaActive: false, cerluaCasterColor: null });
                    pvpCerluaActive = false;
                }
            }
        }
    } catch (e) {
        console.error("[CrossTurn] エフェクト処理中にエラー:", e);
    }
}

//------------------------------------------------------------------------------------------------
// 新キャラクター必殺技

async function ult_lowen() {
    console.log("ローエンの必殺技発動！");
    try {
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return;

        const roomDoc = querySnapshot.docs[0];
        const roomData = roomDoc.data();
        const localStones = Object.assign({}, roomData.stones || {});
        for (const key in localStones) localStones[key] = Object.assign({}, localStones[key]);

        // 下から2段目（row 4）の石を全て削除
        const keysToDelete = Object.keys(localStones).filter(k => k.endsWith('_4'));
        if (keysToDelete.length === 0) return;

        await highlightStones(keysToDelete, 400);
        for (const key of keysToDelete) delete localStones[key];

        // 破壊後の空白を一瞬見せてから落下
        stonesData = localStones;
        init_drawBoard(true);
        await wait(400);
        await animateGravitySmooth(localStones, keysToDelete);

        const roomDocRef = doc(db, "rooms", roomDoc.id);
        const [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false);
        await updateDoc(roomDocRef, {
            player1_ChargeNow: p1_chargeNow,
            player2_ChargeNow: p2_chargeNow,
            stones: localStones
        });
        stonesData = localStones;
        init_drawBoard(true);
    } catch (error) {
        console.error("ローエンの必殺技処理中にエラーが発生しました:", error);
    }
}

async function ult_zhongli() {
    console.log("鍾離の必殺技発動！");
    try {
        // 非満杯列からランダムに2列選択して封鎖
        const nonFullCols = pvpGetNonFullCols(2);
        pvpZhongliBlocked = nonFullCols;
        pvpZhongliTurnsLeft = 2; // 相手1ターン（phase1）+相手2ターン（phase2）
        pvpZhongliCasterColor = playerLeft_Color;

        await updateDoc(firestoreRoomDocRef, {
            zhongliBlocked: nonFullCols,
            zhongliTurnsLeft: 2,
            zhongliCasterColor: playerLeft_Color
        });
        updateZhongliBlockOverlays();
        await wait(600);
    } catch (error) {
        console.error("鍾離の必殺技処理中にエラーが発生しました:", error);
    }
}

async function ult_saphel() {
    console.log("サフェルの必殺技発動！");
    try {
        // 相手のキャラIDを取得
        const opponentCharaID = playerRight_CharaID;
        const opponentData = getCharacterDataByID(opponentCharaID);
        if (!opponentData || opponentData.charaID === '013') {
            console.log("サフェル：不発（相手もサフェル、またはキャラ未定義）");
            return;
        }
        const fn = abilities[opponentData.process];
        if (fn) {
            console.log(`サフェル：相手の必殺技「${opponentData.Ability}」をコピー`);
            await fn();
        }
    } catch (error) {
        console.error("サフェルの必殺技処理中にエラーが発生しました:", error);
    }
}

async function ult_durin() {
    console.log("ドゥリンの必殺技発動！");
    try {
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("roomID", "==", roomID));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return;

        const roomDoc = querySnapshot.docs[0];
        const roomData = roomDoc.data();
        const localStones = Object.assign({}, roomData.stones || {});
        for (const key in localStones) localStones[key] = Object.assign({}, localStones[key]);

        // 即時2個破壊
        const allKeys = Object.keys(localStones);
        const toDelete = getRandomElements(allKeys, Math.min(2, allKeys.length));
        if (toDelete.length > 0) {
            await highlightStones(toDelete, 400);
            for (const key of toDelete) delete localStones[key];
            stonesData = localStones;
            init_drawBoard(true);
            await wait(400);
            await animateGravitySmooth(localStones, toDelete);
        }

        const roomDocRef = doc(db, "rooms", roomDoc.id);
        const [p1_chargeNow, p2_chargeNow] = await getcharge(roomData, false);
        await updateDoc(roomDocRef, {
            player1_ChargeNow: p1_chargeNow,
            player2_ChargeNow: p2_chargeNow,
            stones: localStones,
            durinPending: true,
            durinCasterColor: playerLeft_Color
        });
        stonesData = localStones;
        init_drawBoard(true);
        pvpDurinPending = true;
        pvpDurinCasterColor = playerLeft_Color;
    } catch (error) {
        console.error("ドゥリンの必殺技処理中にエラーが発生しました:", error);
    }
}

async function ult_cerylua() {
    console.log("ケリュドラの必殺技発動！");
    try {
        pvpCerluaActive = true;
        pvpCerluaCasterColor = playerLeft_Color;
        await updateDoc(firestoreRoomDocRef, {
            cerluaActive: true,
            cerluaCasterColor: playerLeft_Color
        });
        await wait(400);
    } catch (error) {
        console.error("ケリュドラの必殺技処理中にエラーが発生しました:", error);
    }
}

async function ult_silverwolf() {
    console.log("銀狼LV.999の必殺技発動！");
    try {
        if (playerLeft_Color === 'red') {
            red_Win++;
            updateWinLabels(red_Win, yellow_Win);
        } else {
            yellow_Win++;
            updateWinLabels(yellow_Win, red_Win);
        }

        await wait(800);

        if (red_Win >= 3 || yellow_Win >= 3) {
            // 即座に試合終了：Firestoreにフラグを書き込み、相手にも通知する
            if (isMatchFinalized) return;
            isMatchFinalized = true;
            const winningColor = red_Win >= 3 ? 'red' : 'yellow';
            const isStraightWin = winningColor === 'red' ? yellow_Win === 0 : red_Win === 0;

            await updateDoc(firestoreRoomDocRef, {
                red_Win: red_Win,
                yellow_Win: yellow_Win,
                silverwolfMatchWinner: winningColor
            });

            await handleBO3Final(winningColor, "normal", { isStraightWin, isComebackWin: false });
            displayVictory(winningColor);
        } else {
            // ラウンド+1として次ラウンドへ（発動者がボードリセットを担当）
            startP = player_info === 'P1' ? 'P2' : 'P1'; // 負けた側（相手）が次ラウンド先攻
            await deleteStonesAndUpdate(); // 内部でred_Win, yellow_Winを書き込む
        }
    } catch (error) {
        console.error("銀狼LV.999の必殺技処理中にエラーが発生しました:", error);
    }
}


