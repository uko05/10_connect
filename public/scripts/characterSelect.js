import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { db, auth, authReady, getSharedUserId } from "./firebaseConfig.js"; //firebaseの設定ファイル
import {
  getFirestore, collection, writeBatch, addDoc, query, where, deleteDoc, doc, runTransaction, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { onSnapshot, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { characterData, TEST_ALL_CHARAS_UNLOCKED } from './characterData.js';
import { APP_VERSION } from './version.js';
import { ensureLatestVersion } from './versionGuard.js';
import { setupScaledLayout } from './layoutScaler.js';
import { ensureUserDoc, getUserRating, getUserRank, savePlayerName, syncSharedUserId } from './eloRating.js';
import { getRankTier, getRankCssClass, getRankBadgePath } from './rankConfig.js';
import { applyTitleDisplay } from './achievementManager.js';
import { setupSettingsModal, bindSettingsUI, CPU_DIFFICULTY_LEVELS, getCpuDifficulty, setCpuDifficulty, getSystemVolume, getVoiceVolume, VOICE_GAIN } from './settingsManager.js';
import { initLang, t, getCharaText, getAchText, getCharaAchText } from './i18n.js';
import { applyBattleBackground, getMyStoneSkinCode } from './designSettings.js';
import { CHALLENGE_MODES, CHALLENGE_INFO, challengeText, canChallenge, loadProgress, saveProgress, nextMatch, setSoloChallenge, clearSoloChallenge } from './challengeManager.js';

// 背景(プレイヤー情報 > デザイン変更 で選んだもの)
applyBattleBackground();

// 設定ダイアログ（石カラー・必殺技演出強度・音量）
setupSettingsModal('settingsButton', 'settingsModal');
bindSettingsUI(document.getElementById('settingsModal'));
initLang();

function fitAbilityText(el) {
    if (!el) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.fontSize = '';
        let size = parseFloat(getComputedStyle(el).fontSize);
        const minSize = 7;
        while (el.scrollHeight > el.clientHeight && size > minSize) {
            size -= 0.5;
            el.style.fontSize = size + 'px';
        }
    }));
}

// アチーブメント名を現在の言語で返すヘルパー
function getAchName(achId, jaLabel) {
    if (!achId) return jaLabel || '';
    const charaMatch =
        achId.startsWith('chara_win10_') ? achId.slice('chara_win10_'.length) :
        achId.startsWith('chara_win50_') ? achId.slice('chara_win50_'.length) :
        (achId.startsWith('solo_bakatare_') && achId !== 'solo_bakatare_all') ? achId.slice('solo_bakatare_'.length) :
        null;
    if (charaMatch !== null) {
        const charaEnName = getCharaText(charaMatch, 'name');
        return getCharaAchText(achId, jaLabel, '', charaEnName ?? jaLabel).name;
    }
    return getAchText(achId, 'name') ?? jaLabel;
}

// 言語切替時: キャラ詳細・ロックヒント・称号バナーを即時更新
document.querySelectorAll('input[name="langSelect"]').forEach(radio => {
    radio.addEventListener('change', () => {
        if (currentCharacterData) displayCharacterInfo(currentCharacterData);
        updateVsSummary();
        document.querySelectorAll('.thumbnail-locked-hint[data-req-ach-id]').forEach(el => {
            const achId = el.dataset.reqAchId;
            const jaLabel = el.dataset.reqAchLabel;
            el.innerHTML = t('lockedHintPre') + getAchName(achId, jaLabel) + t('lockedHintPost');
        });
        const titlesEl = document.getElementById('lobbyTitles');
        if (titlesEl) applyTitleDisplay(titlesEl, cachedLobbyUserData);
    });
});

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
    ['easy', 'normal', 'hard', 'bakatare'].forEach(d => cpuDifficultyLabel.classList.remove(d));
    if (difficultyId) cpuDifficultyLabel.classList.add(difficultyId);
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
document.getElementById('soloModeButton').addEventListener('click', async () => {
    const charaID = document.getElementById('charaID').value;
    // 挑戦モード: 万象・逆転はキャラを選ばなくてよいので、キャラ未選択のチェックより先に処理する(連勝は startChallenge 内で確認)
    if (soloMode !== 'solo') {
        if (!(await ensureLatestVersion())) return;
        await startChallenge(charaID.trim());
        return;
    }
    if (charaID.trim() === "") {
        document.getElementById('statusMessage').innerText = t('statusSelectChara');
        return;
    }
    if (!(await ensureLatestVersion())) return;
    clearSoloChallenge();
    const playerName = document.getElementById('playerName').value.trim() || t('defaultPlayerName');
    saveLastChara('cpu', charaID);
    sessionStorage.setItem('soloPlayerCharaID', charaID);
    // CPUの対戦相手（未選択ならソロ画面側でランダム）
    sessionStorage.setItem('soloCpuCharaID', selectedOpponentID || '');
    sessionStorage.setItem('soloPlayerName', playerName);
    // CPUランダム選択で未解放キャラを除くために解放済みアチーブメントを渡す
    sessionStorage.setItem('soloUnlockedAchievements', JSON.stringify([...myAchievements]));
    window.location.href = 'solo.html';
});

// バージョン表示
document.getElementById('version').textContent = APP_VERSION;

// スマホ対応：ロビー画面のスケーリング
// 幅は .parent-container と同じ(2026-10-21: キャラ一覧を横5列にして1200→1310)
const setupLobbyLayout = setupScaledLayout('lobbyWrap', 1310, 730);

const orientationLabel = document.getElementById('orientationLabel');
if (orientationLabel) {
    orientationLabel.innerHTML =
        `<div>${t('orientationMsg')}</div>` +
        `<div style="font-size:0.45em; margin-top:0.5em; line-height:1.4;">${t('orientationSub')}</div>`;
}

let playerDocRef = null;
let NowMatching = false;  //既にマッチング処理が進行中かどうかを示すフラグ
let roomDocRef = null; //ここで roomDocRef を宣言

//選択中のキャラクターを保持する変数
let selectedCharacter = null;
// CPU戦の対戦相手（null = おまかせ／ランダム）と、一覧のクリック先（'self' | 'opponent'）
let selectedOpponentID = null;
let pickTarget = 'self';

// 直前に使ったキャラ・CPU戦の相手を覚えておく（CPU戦とマッチング対戦で別々）
const LAST_CHARA_KEY = { cpu: 'connectLastChara_cpu', match: 'connectLastChara_match' };
const LAST_OPPONENT_KEY = 'connectLastCpuOpponent';
function saveLastChara(mode, charaID) {
    try { localStorage.setItem(LAST_CHARA_KEY[mode], charaID); } catch (e) { /* 保存できなくても続行 */ }
}
function loadStored(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}
// 選択中キャラクターのdataオブジェクト（言語切替時の再描画に使用）
let currentCharacterData = null;
// ロビーのユーザーデータキャッシュ（言語切替時の称号再描画に使用）
let cachedLobbyUserData = null;

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

const WAITING_EXPIRE_MS = 15 * 60 * 1000; // 15分

// 同じ相手との連戦を避ける(2026-10-22)。対戦が終わると2人同時にキャラ選択に戻るので、
// 待ち時間なしで探すと、また同じ2人で当たりやすく、ほかの人と当たれなくなる。
// ランク戦では直前の相手の部屋を、待ち始めてから REMATCH_AVOID_MS の間だけ避ける(誰もいなければその後に当たる)。
// 合言葉マッチは友達同士で続けて遊ぶものなので避けない
const REMATCH_AVOID_MS = 20 * 1000;
const LAST_OPP_KEY = 'connectLastOpponent';
function getLastOpponent() { try { return localStorage.getItem(LAST_OPP_KEY); } catch { return null; } }
function setLastOpponent(uid) { try { if (uid) localStorage.setItem(LAST_OPP_KEY, uid); } catch { /* 保存できなくても対戦はできる */ } }

// 部屋離脱検知用ハートビート：waiting中はP1が自分の生存時刻を定期的に書き込み、
// 他のクライアントはこれが古い（既定で30秒超）場合に「不在」と判定する
// 2026-10-11: 書き込み削減のため10秒→30秒に(不在判定もそれに合わせて30秒→75秒)
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const STALE_THRESHOLD_MS = 75 * 1000;
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
    selectSound.volume = getSystemVolume();


    // charaID順にすべてのキャラを描画（解放状態にかかわらず）
    characterData.forEach((character) => {
        const isLocked = !TEST_ALL_CHARAS_UNLOCKED && character.requiredAchievementId && !myAchievements.has(character.requiredAchievementId);
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';

        if (isLocked) {
            const lockedSlot = document.createElement('div');
            lockedSlot.className = 'thumbnail thumbnail-locked';

            const mark = document.createElement('span');
            mark.className = 'thumbnail-locked-mark';
            mark.textContent = '？';
            lockedSlot.appendChild(mark);

            const hint = document.createElement('div');
            hint.className = 'thumbnail-locked-hint';
            hint.dataset.reqAchId = character.requiredAchievementId || '';
            hint.dataset.reqAchLabel = character.requiredAchievementLabel || '';
            hint.innerHTML = t('lockedHintPre') + getAchName(character.requiredAchievementId, character.requiredAchievementLabel) + t('lockedHintPost');
            lockedSlot.appendChild(hint);

            wrapper.appendChild(lockedSlot);
        } else {
            const img = document.createElement('img');
            img.src = character.src;
            img.alt = character.name;
            img.className = 'thumbnail';
            img.setAttribute('data-voice', character.voice_select);

            img.dataset.charaId = character.charaID;
            img.addEventListener('click', () => {
                if (pickTarget === 'opponent') selectOpponent(img, character, true);
                else selectSelf(img, character, true);
            });

            wrapper.appendChild(img);

            // キャラ別勝利数バッジ（ソロモードでは非表示）
            if (requestedMode !== 'cpu') {
                const winBadge = document.createElement('span');
                winBadge.className = 'chara-win-badge';
                winBadge.textContent = `${t('winCountBadge')}${myCharaWins[character.charaID] || 0}`;
                wrapper.appendChild(winBadge);
            }
        }

        container.appendChild(wrapper);
    });

    // まだキャラが決まっていない空き枠(2026-10-21: 4x4 → 横5列x縦4行に)。
    // キャラ数を5の倍数(最低20)まで埋めるので、キャラを追加すると空き枠が自動で減る
    const SLOT_COLS = 5, MIN_SLOTS = 20;
    const totalSlots = Math.max(MIN_SLOTS, Math.ceil(characterData.length / SLOT_COLS) * SLOT_COLS);
    for (let i = characterData.length; i < totalSlots; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';
        const empty = document.createElement('div');
        empty.className = 'thumbnail thumbnail-empty';
        wrapper.appendChild(empty);
        container.appendChild(wrapper);
    }

    // 直前に使ったキャラ（と前回のCPUの相手）を選択状態に戻す。自動選択なのでボイスは鳴らさない
    const mode = requestedMode === 'match' ? 'match' : 'cpu';
    const lastImg = findThumbnail(loadStored(LAST_CHARA_KEY[mode]));
    if (lastImg) selectSelf(lastImg, characterData.find(c => c.charaID === lastImg.dataset.charaId), false);
    if (isOpponentPickerActive()) {
        const oppImg = findThumbnail(loadStored(LAST_OPPONENT_KEY));
        if (oppImg) selectOpponent(oppImg, characterData.find(c => c.charaID === oppImg.dataset.charaId), false);
        if (lastImg) showCharacterInfo(currentCharacterData); // 情報欄は自分のキャラを表示
        updateVsSummary();
    }
}

// 解放済み（クリックできる）サムネイルを charaID で探す
function findThumbnail(charaID) {
    if (!charaID) return null;
    return document.querySelector(`#thumbnailContainer img.thumbnail[data-chara-id="${charaID}"]`);
}

function playSelectVoices(img, withVoice) {
    if (!withVoice) return;
    if (charaSound && !charaSound.paused) {
        charaSound.pause();
        charaSound.currentTime = 0;
    }
    selectSound.currentTime = 0;
    selectSound.play().catch(err => console.error('システム音の再生に失敗しました:', err));
    charaSoundUrl = img.getAttribute('data-voice');
    charaSound = new Audio(charaSoundUrl);
    charaSound.volume = (voicevolumeSlider ? parseFloat(voicevolumeSlider.value) : getVoiceVolume()) * VOICE_GAIN;
    charaSound.play().catch(err => console.error('音声の再生に失敗しました:', err));
}

// 自分のキャラを選ぶ
function selectSelf(img, character, withVoice) {
    if (selectedCharacter) selectedCharacter.classList.remove('selected');
    img.classList.add('selected');
    selectedCharacter = img;
    currentCharacterData = character;
    displayCharacterInfo(character);
    playSelectVoices(img, withVoice);
    updateVsSummary();
}

// CPUの対戦相手を選ぶ（同じキャラをもう一度押すと「おまかせ」に戻す）
function selectOpponent(img, character, withVoice) {
    if (withVoice && selectedOpponentID === character.charaID) {
        setOpponentRandom();
        return;
    }
    document.querySelectorAll('#thumbnailContainer img.opponent-selected').forEach(el => el.classList.remove('opponent-selected'));
    img.classList.add('opponent-selected');
    selectedOpponentID = character.charaID;
    try { localStorage.setItem(LAST_OPPONENT_KEY, character.charaID); } catch (e) { /* 保存できなくても続行 */ }
    showCharacterInfo(character); // 相手の必殺技も確認できるように、表示だけ切り替える
    playSelectVoices(img, withVoice);
    updateVsSummary();
}

function setOpponentRandom() {
    document.querySelectorAll('#thumbnailContainer img.opponent-selected').forEach(el => el.classList.remove('opponent-selected'));
    selectedOpponentID = null;
    try { localStorage.setItem(LAST_OPPONENT_KEY, ''); } catch (e) { /* 保存できなくても続行 */ }
    updateVsSummary();
}

function isOpponentPickerActive() {
    return !!document.getElementById('cpuOpponentPicker') && requestedMode !== 'match';
}

// 「自分を選ぶ／相手を選ぶ」ボタン。情報欄は、いま選んでいる側のキャラを表示する
function setPickTarget(target) {
    pickTarget = target;
    document.getElementById('pickSelfBtn')?.classList.toggle('active', target === 'self');
    document.getElementById('pickOpponentBtn')?.classList.toggle('active', target === 'opponent');
    if (target === 'self' && currentCharacterData) showCharacterInfo(currentCharacterData);
    if (target === 'opponent' && selectedOpponentID) showCharacterInfo(characterData.find(c => c.charaID === selectedOpponentID));
    updateVsSummary();
}
document.getElementById('pickSelfBtn')?.addEventListener('click', () => setPickTarget('self'));
document.getElementById('pickOpponentBtn')?.addEventListener('click', () => setPickTarget('opponent'));
document.getElementById('opponentRandomBtn')?.addEventListener('click', () => { setOpponentRandom(); setPickTarget('self'); });

// 相手が未選択（おまかせ）なら「おまかせ」ボタンを点灯
function updateVsSummary() {
    document.getElementById('opponentRandomBtn')?.classList.toggle('active', !selectedOpponentID);
}

//キャラクターの情報を表示する関数（自分のキャラとして選ぶ）
function displayCharacterInfo(character) {
    showCharacterInfo(character);
    document.getElementById('charaID').value = character.charaID;
}

// 情報欄の表示だけを切り替える（CPUの相手の確認用。選択中の自分のキャラは変えない）
function showCharacterInfo(character) {
    document.getElementById('characterName').innerText = getCharaText(character.charaID, 'name') ?? character.name;
    document.getElementById('characterCharge').innerText = character.charge;
    document.getElementById('Ability').innerText = getCharaText(character.charaID, 'Ability') ?? character.Ability;
    document.getElementById('AbilityDetail').innerText = getCharaText(character.charaID, 'AbilityDetail') ?? character.AbilityDetail;
    fitAbilityText(document.getElementById('Ability'));
    fitAbilityText(document.getElementById('AbilityDetail'));
}

// ロビーのプレイヤー情報エリアを更新する（5行レイアウト）
async function applyLobbyDisplay(userData) {
    cachedLobbyUserData = userData;
    const rankAndRateEl = document.getElementById('lobbyRankAndRate');
    const rankingEl     = document.getElementById('lobbyRanking');
    const badgeEl       = document.getElementById('lobbyRankBadge');
    const titlesEl      = document.getElementById('lobbyTitles');

    if (!userData) {
        if (rankAndRateEl) rankAndRateEl.textContent = '---';
        if (badgeEl) badgeEl.style.display = 'none';
        return;
    }

    const rating = userData.rating ?? 1500;
    const tier   = getRankTier(rating);
    const css    = getRankCssClass(rating);

    if (rankAndRateEl) {
        rankAndRateEl.textContent = `${tier}　/　Rate：${rating}`;
        rankAndRateEl.className = `player-rating ${css}`;
        rankAndRateEl.style.cssText = 'text-align:left; margin:2px 0;';
    }
    if (badgeEl) {
        badgeEl.src = getRankBadgePath(rating);
        badgeEl.alt = tier;
        badgeEl.style.display = 'block';
    }
    if (titlesEl) applyTitleDisplay(titlesEl, userData);

    // Ranking は非同期で後から更新
    const rankInfo = await getUserRank(rating);
    if (rankInfo && rankingEl) {
        rankingEl.textContent = `Ranking: #${rankInfo.rank}`;
    }
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
        syncSharedUserId(user.uid, getSharedUserId());
        console.log("[characterSelect] Auth ready, uid:", user.uid);

        // ロビーにレート・称号表示
        const myRating = await getUserRating(user.uid);
        applyLobbyDisplay(myRating);

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

    //サムネイルを表示
    displayThumbnails();
    await initSoloModeSwitch();

    // 音量スライダー：リアルタイムで再生中の音声に反映
    systemvolumeSlider = document.getElementById('systemvolumeSlider');
    voicevolumeSlider  = document.getElementById('voicevolumeSlider');
    if (systemvolumeSlider) {
        systemvolumeSlider.addEventListener('input', (e) => { selectSound.volume = parseFloat(e.target.value); });
    }
    if (voicevolumeSlider) {
        voicevolumeSlider.addEventListener('input', (e) => { if (charaSound) charaSound.volume = parseFloat(e.target.value) * VOICE_GAIN; });
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

    document.getElementById('statusMessage').innerText = isDisabled ? t('statusMatching') : "";

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

    const roomRef = query(collection(db, "connectRooms"), where("player1_ID", "==", generatedId));

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

function clearWaitingExpireTimer() {
  if (waitingExpireTimerId) {
    clearTimeout(waitingExpireTimerId);
    waitingExpireTimerId = null;
  }
}

function startWaitingExpireTimer(roomDocRef) {
  clearWaitingExpireTimer();

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
          stopRoomWatcher();
          NowMatching = false;
          toggleInputs(false);

          const matchButton = document.getElementById('matchButton');
          matchButton.innerText = t('btnMatchStart');
          matchButton.style.backgroundColor = "";

          document.getElementById('statusMessage').innerText =
            `${WAITING_EXPIRE_MS / 60000}${t('statusMatchingCanceled')}`;

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
        document.getElementById('statusMessage').innerText = t('statusInputName');
        return;
    }

    //キャラクター選択チェック
    const charaID = document.getElementById('charaID').value;
    if (charaID.trim() === "") {
        document.getElementById('statusMessage').innerText = t('statusSelectChara');
        return;
    }
    if (!NowMatching && !(await ensureLatestVersion())) return;
    saveLastChara('match', charaID);

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
        matchButton.innerText = t('statusMatchingInProgress');
        matchButton.style.backgroundColor = "#ff9900";
    } else {
        matchButton.innerText = t('btnMatchStart');
        matchButton.style.backgroundColor = "";
    }

    if (NowMatching) {
        //マッチング解除
        await cancelWaiting(playerUUID);
        document.getElementById('matchButton').disabled = false;
        return;
    }

    const ctx = { roomMatching, playerUUID, charaID, playerName };
    try {
        listenForMatches();
        NowMatching = true;

        //待っている部屋があれば古い順に入ってみる。同時に入ろうとして先を越されたら次の部屋へ
        const rooms = await findWaitingRooms(roomMatching);
        const avoid = roomMatching ? null : getLastOpponent();
        const candidates = rooms.filter((d) => d.data().player1_ID !== playerUUID && d.data().player1_ID !== avoid);
        for (const d of candidates) {
            if (await tryJoinRoom(d.ref, ctx)) return;
        }

        //入れる部屋がないので、Player1として新規作成して待つ
        await createWaitingRoom(ctx);

    } catch (error) {
        console.error("Error adding document: ", error);
    } finally {
        document.getElementById('matchButton').disabled = false;
    }
});

//------------------------------------------------------------------------------------------------
// マッチングの部品(2026-10-22 整理)

const roomCreatedMs = (data) => data.createdAt?.toMillis ? data.createdAt.toMillis() : new Date(data.createdAt).getTime();

// 作った人がまだ画面にいる部屋か(ハートビートが途絶えていないか)
function isRoomLive(data) {
    const lastActiveMs = data.player1_LastActive?.toMillis ? data.player1_LastActive.toMillis() : roomCreatedMs(data);
    return Number.isFinite(lastActiveMs) && (Date.now() - lastActiveMs) <= STALE_THRESHOLD_MS;
}

// 条件(ステータスがwaitingかつ合言葉が同じ。未入力の場合はnull)に合う部屋を古い順に返す。
// ハートビートが途絶えている(作成者が不在の可能性が高い)部屋は除外し、可能であれば削除して自浄する
async function findWaitingRooms(roomMatching) {
    const snap = await getDocs(query(collection(db, "connectRooms"),
        where("status", "==", "waiting"), where("roomMatching", "==", roomMatching)));
    const live = [];
    for (const docSnap of snap.docs) {
        if (!isRoomLive(docSnap.data())) {
            console.log("[stale] abandoned room detected, deleting:", docSnap.id);
            try { await deleteDoc(docSnap.ref); } catch (e) { console.error("[stale] delete failed:", e); }
            continue;
        }
        live.push(docSnap);
    }
    return live.sort((a, b) => roomCreatedMs(a.data()) - roomCreatedMs(b.data()));
}

// 待っている部屋にPlayer2として入る。先にほかの人が入っていた場合はルールで拒否されるので false
async function tryJoinRoom(ref, ctx) {
    try {
        await updateDoc(ref, {
            player2_ID: ctx.playerUUID,
            player2_CharaID: ctx.charaID,
            player2_Name: ctx.playerName,
            player2_StoneSkin: getMyStoneSkinCode(), // 相手の画面に自分の石のデザインを出すため(2026-10-11)
            status: "in_progress",
            player2_LastActive: serverTimestamp()
        });
        roomDocRef = ref;
        return true;
    } catch (e) {
        console.warn("[match] join failed (already taken?):", ref.id, e);
        return false;
    }
}

let waitingSince = 0; //自分の部屋で待ち始めた時刻

async function createWaitingRoom(ctx) {
    const startP = (crypto.getRandomValues(new Uint8Array(1))[0] % 2) === 0 ? 'P1' : 'P2';
    const p1color = startP === 'P1' ? 'red' : 'yellow';
    const p2color = startP === 'P2' ? 'red' : 'yellow';

    playerDocRef = await addDoc(collection(db, "connectRooms"), {
        player1_ID: ctx.playerUUID,
        player1_CharaID: ctx.charaID,
        player1_ChargeNow: 0,
        player1_Name: ctx.playerName,
        player1_Color: p1color,
        player1_StoneSkin: getMyStoneSkinCode(), // 相手の画面に自分の石のデザインを出すため(2026-10-11)
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
        roomMatching: ctx.roomMatching,
        matchType: ctx.roomMatching ? "private" : "ranked",
        roomID: crypto.randomUUID(),
        status: "waiting",
        createdAt: new Date(),
        startP: startP,
        turn: startP,
        turnCount: 1,
        changeStone: 0,
        player1_LastActive: serverTimestamp()
    });
    waitingSince = Date.now();
    startWaitingExpireTimer(playerDocRef);
    startWaitingHeartbeat(playerDocRef);
    startRoomWatcher(ctx);
}

async function cancelWaiting(playerUUID) {
    stopHeartbeat();
    stopRoomWatcher();
    clearWaitingExpireTimer();
    NowMatching = false;
    playerDocRef = null;
    toggleInputs(false);
    try { await removePlayerFromRoom(playerUUID); } catch (e) { console.error("[match] cancel failed:", e); }
}

// 自分の部屋で待っている間も、ほかの待機部屋を見張る(2026-10-22)。
// 自分より先に作られた部屋があれば、自分の部屋を閉じてそちらに入る(古い部屋に寄せるので、2人が同時に移ることはない)。
// 2人がほぼ同時に部屋を作って、お互いに待ちぼうけになるのを防ぐ。直前の相手を避けた場合も、
// 避ける時間が過ぎたらここでその相手の部屋に入る
let roomWatcherUnsub = null;
let roomWatcherTimer = null;
let lastWaitingSnap = null;
let switchingRoom = false;

function stopRoomWatcher() {
    if (roomWatcherUnsub) { roomWatcherUnsub(); roomWatcherUnsub = null; }
    if (roomWatcherTimer) { clearTimeout(roomWatcherTimer); roomWatcherTimer = null; }
    lastWaitingSnap = null;
}

function startRoomWatcher(ctx) {
    stopRoomWatcher();
    const q = query(collection(db, "connectRooms"), where("status", "==", "waiting"), where("roomMatching", "==", ctx.roomMatching));
    roomWatcherUnsub = onSnapshot(q, (snap) => { lastWaitingSnap = snap; moveToOlderRoom(ctx); },
        (e) => console.error("[watch] failed:", e));
    // 直前の相手を避けている間に変化がなくても、時間が過ぎたら見直す
    if (!ctx.roomMatching && getLastOpponent()) {
        roomWatcherTimer = setTimeout(() => moveToOlderRoom(ctx), REMATCH_AVOID_MS + 500);
    }
}

async function moveToOlderRoom(ctx) {
    if (switchingRoom || !NowMatching || isNavigatingToBattle || !playerDocRef || !lastWaitingSnap) return;
    const myRef = playerDocRef;
    const mine = lastWaitingSnap.docs.find((d) => d.id === myRef.id);
    if (!mine) return; //もう誰かが入った(waitingでなくなった)
    const myCreated = roomCreatedMs(mine.data());
    const avoid = (!ctx.roomMatching && Date.now() - waitingSince < REMATCH_AVOID_MS) ? getLastOpponent() : null;
    const target = lastWaitingSnap.docs
        .filter((d) => d.id !== myRef.id && d.data().player1_ID !== ctx.playerUUID && d.data().player1_ID !== avoid && isRoomLive(d.data()))
        .filter((d) => { const c = roomCreatedMs(d.data()); return c < myCreated || (c === myCreated && d.id < myRef.id); })
        .sort((a, b) => roomCreatedMs(a.data()) - roomCreatedMs(b.data()))[0];
    if (!target) return;

    switchingRoom = true;
    try {
        //自分の部屋を閉じる。その間に誰かが入っていたら、そのまま自分の部屋で対戦する
        const closed = await runTransaction(db, async (tx) => {
            const snap = await tx.get(myRef);
            if (!snap.exists() || snap.data().status !== "waiting" || snap.data().player2_ID) return false;
            tx.delete(myRef);
            return true;
        });
        if (!closed) return;
        stopHeartbeat();
        stopRoomWatcher();
        clearWaitingExpireTimer();
        playerDocRef = null;
        console.log("[watch] moving to older room:", target.id);
        if (await tryJoinRoom(target.ref, ctx)) return;
        await createWaitingRoom(ctx); //先を越されたら、部屋を作り直して待つ
    } catch (e) {
        console.error("[watch] move failed:", e);
    } finally {
        switchingRoom = false;
    }
}

//------------------------------------------------------------------------------------------------

//プレイヤーが待機リストに入ったときのリスナー処理
let matchListenerUnsubs = [];
function listenForMatches() {
    // 解除して探し直すたびに見張りが増えないよう、前の見張りは外す
    matchListenerUnsubs.forEach((u) => u());
    matchListenerUnsubs = [];

    const roomsRef = collection(db, "connectRooms");
    const playerName = document.getElementById('playerName').value;
    const charaID = document.getElementById('charaID').value;

    let roomMatching = document.getElementById('roomMatching').value;
    if (roomMatching.trim() === "") {
        roomMatching = null;
    }
    let playerUUID = getUUIDFromCookie(); //クッキーからUUIDを読み込む

    // 自分が入っている部屋だけを見張る(2026-10-11)。以前は対戦部屋を全部見張っていたため、
    // ほかの人の対戦で石が置かれるたびに、待っている全員に読み取りが発生していた。
    // P1として作った部屋(player1_ID)と、P2として参加した部屋(player2_ID)の2つの条件で見張る
    const handleRoomsSnapshot = async (snapshot) => {

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

                document.getElementById('statusMessage').innerText = t('statusMatchingDone');
                isNavigatingToBattle = true; //バトル画面への遷移フラグを設定

                showMatchLabel();

                setTimeout(() => {
                    window.location.href = "battle.html";
                }, 5000);
            }

            //statusが"waiting"かつroomMatchingが一致する部屋のみを処理
            if (roomData.status === "in_progress" && roomData.roomMatching === roomMatching && roomData.player2_ID === playerUUID) {

                stopRoomWatcher();
                setLastOpponent(roomData.player1_ID);
                document.getElementById('statusMessage').innerText = t('statusMatchingDone');
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
                stopRoomWatcher();
                clearWaitingExpireTimer();
                setLastOpponent(roomData.player2_ID);
                document.getElementById('statusMessage').innerText = t('statusMatchingDone');
                isNavigatingToBattle = true; //バトル画面への遷移フラグを設定

                showMatchLabel();

                setTimeout(() => {
                    window.location.href = "battle.html";
                }, 5000);
            }
        });
    };
    matchListenerUnsubs = [
        onSnapshot(query(roomsRef, where("player1_ID", "==", playerUUID)), handleRoomsSnapshot),
        onSnapshot(query(roomsRef, where("player2_ID", "==", playerUUID)), handleRoomsSnapshot),
    ];
}

//matchingを表示するための関数
async function showMatchLabel() {

    const matchLabel = document.getElementById("matchLabel");

    matchLabel.innerHTML = t('matchLabelDone');

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

//------------------------------------------------------------------------------------------------
// ソロモードの ◀ ▶ 切り替えと挑戦モード(2026-10-22、challengeManager.js)
const SOLO_MODES = ['solo', ...CHALLENGE_MODES];
const SOLO_MODE_KEY = 'connectSoloMode';
let soloMode = 'solo';
let challengeProgress = {};
const isCharaUnlocked = (c) => TEST_ALL_CHARAS_UNLOCKED || !c.requiredAchievementId || myAchievements.has(c.requiredAchievementId);
const charaName = (id) => getCharaText(id, 'name') ?? characterData.find((c) => c.charaID === id)?.name ?? id;
const isEn = () => document.documentElement.lang === 'en';

async function initSoloModeSwitch() {
    const btn = document.getElementById('soloModeButton');
    if (!btn || requestedMode !== 'cpu') return;
    try { const saved = localStorage.getItem(SOLO_MODE_KEY); if (SOLO_MODES.includes(saved)) soloMode = saved; } catch (e) { /* 保存できなくても続行 */ }
    try { challengeProgress = await loadProgress(currentUid); } catch (e) { console.warn('[challenge] 進み具合の読み込みに失敗', e); }
    // 試合の途中で画面を閉じた挑戦は失敗(最初から)にする
    const abandoned = CHALLENGE_MODES.filter((m) => challengeProgress[m]?.playing);
    for (const m of abandoned) {
        try { await saveProgress(currentUid, m, null); } catch (e) { /* 次回また判定する */ }
        delete challengeProgress[m];
    }
    if (abandoned.length) {
        const names = abandoned.map((m) => challengeText(m).name).join(isEn() ? ', ' : '・');
        document.getElementById('statusMessage').innerText = isEn()
            ? `You left a match of "${names}" before it ended, so that challenge was reset.`
            : `「${names}」は試合の途中で抜けたため、挑戦失敗として最初からになりました。`;
    }
    const step = (d) => { soloMode = SOLO_MODES[(SOLO_MODES.indexOf(soloMode) + d + SOLO_MODES.length) % SOLO_MODES.length]; try { localStorage.setItem(SOLO_MODE_KEY, soloMode); } catch (e) { /* 続行 */ } renderSoloMode(); };
    document.getElementById('soloModePrev').addEventListener('click', () => step(-1));
    document.getElementById('soloModeNext').addEventListener('click', () => step(1));
    const modal = document.getElementById('challengeInfoModal');
    document.getElementById('soloModeInfo').addEventListener('click', () => {
        const tx = challengeText(soloMode);
        document.getElementById('challengeInfoTitle').textContent = tx.name;
        document.getElementById('challengeInfoText').textContent = tx.desc;
        modal.style.display = 'block';
    });
    document.getElementById('challengeInfoClose').addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    renderSoloMode();
}

function challengeStatusText(mode) {
    const p = challengeProgress[mode];
    if (mode === 'streak') {
        if (!p) return isEn() ? 'Start: choose your character, then press the button.' : '最初から：キャラを選んでボタンを押すと始まります';
        return isEn() ? `Continue: ${p.index} / ${p.order.length} wins (${charaName(p.chara)})` : `続きから：${p.index} / ${p.order.length}勝（${charaName(p.chara)}）`;
    }
    if (mode === 'all') {
        if (!p) return isEn() ? 'Start: characters are chosen at random.' : '最初から：キャラはランダムで決まります';
        return isEn() ? `Continue: ${p.index} / ${p.pairs.length} wins` : `続きから：${p.index} / ${p.pairs.length}勝`;
    }
    if (!p) return isEn() ? 'Start: your character is chosen at random each match.' : '最初から：自分のキャラは毎試合ランダムで決まります';
    return isEn() ? `Continue: ${p.wins} / 3 wins` : `続きから：${p.wins} / 3勝`;
}

function renderSoloMode() {
    const btn = document.getElementById('soloModeButton');
    const info = document.getElementById('soloModeInfo');
    const status = document.getElementById('challengeStatus');
    const isSolo = soloMode === 'solo';
    const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };
    show('cpuDifficultySelector', isSolo);
    show('cpuOpponentPicker', isSolo);
    info.hidden = isSolo;
    status.hidden = isSolo;
    btn.classList.toggle('challenge-mode', !isSolo);
    if (isSolo) {
        btn.textContent = t('btnSolo');
        btn.disabled = false;
        return;
    }
    const tx = challengeText(soloMode);
    const ok = canChallenge(soloMode, isCharaUnlocked);
    btn.textContent = tx.name;
    btn.disabled = !ok;
    status.textContent = ok ? challengeStatusText(soloMode) : tx.need;
}

async function startChallenge(chosenCharaID) {
    const mode = soloMode;
    if (!canChallenge(mode, isCharaUnlocked) || !currentUid) return;
    if (mode === 'streak' && !challengeProgress.streak && !chosenCharaID) {
        document.getElementById('statusMessage').innerText = t('statusSelectChara');
        return;
    }
    const m = nextMatch(mode, challengeProgress[mode], chosenCharaID);
    m.progress.playing = true;   // 試合の途中で抜けたら負け扱いにするための印(結果が出たらソロ画面で外す)
    try {
        await saveProgress(currentUid, mode, m.progress);
    } catch (e) {
        console.error('[challenge] 進み具合の保存に失敗', e);
        document.getElementById('statusMessage').innerText = isEn() ? 'Could not save your progress. Please try again.' : '進み具合を保存できませんでした。もう一度お試しください。';
        return;
    }
    const playerName = document.getElementById('playerName').value.trim() || t('defaultPlayerName');
    sessionStorage.setItem('soloPlayerCharaID', m.player);
    sessionStorage.setItem('soloCpuCharaID', m.cpu);
    sessionStorage.setItem('soloPlayerName', playerName);
    sessionStorage.setItem('soloUnlockedAchievements', JSON.stringify([...myAchievements]));
    setSoloChallenge({ mode, difficulty: CHALLENGE_INFO[mode].difficulty, done: m.done, total: m.total });
    window.location.href = 'solo.html';
}

