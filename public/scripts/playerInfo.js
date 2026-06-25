// playerInfo.js - プレイヤー情報画面（レート・アチーブメント・称号の表示）
import { authReady } from './firebaseConfig.js';
import { APP_VERSION } from './version.js';
import { ensureUserDoc, getUserRating, getUserRank, savePlayerName } from './eloRating.js';
import { getRankTier, getRankCssClass, getRankBadgePath } from './rankConfig.js';
import { ACHIEVEMENT_GROUPS, ALL_ACHIEVEMENTS, DEBUG_ACHIEVEMENT } from './achievements.js';
import { getAchievementViewModel, setEquippedTitle, debugForceUnlockAchievement, debugForceResetAchievement } from './achievementManager.js';
import { showAchievementToast, showCharacterUnlockModal } from './achievementToast.js';
import { characterData } from './characterData.js';

document.getElementById('version').textContent = APP_VERSION;

document.getElementById('backToHubButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

let currentUid = null;
let latestUserData = {};
let currentSlot = 0; // 称号スロット（0=アチーブメント1, 1=アチーブメント2）。タブで切り替える
let isDebugUser = false; // playerName が @debug で終わる場合だけ true

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await authReady;
        currentUid = user.uid;
        await ensureUserDoc(user.uid);

        const myRating = await getUserRating(user.uid);
        latestUserData = myRating || {};
        isDebugUser = (latestUserData.playerName || '').endsWith('@debug');

        const nameInput = document.getElementById('playerInfoNameInput');
        if (nameInput) nameInput.value = latestUserData.playerName || '';

        renderRankInfo(latestUserData);
        renderTitleSlots(latestUserData);
        renderAchievements();
    } catch (error) {
        console.error('[playerInfo] Auth initialization failed:', error);
    }
});

// 称号タブの切り替え（アチーブメント1/2は同じ内容。どちらの枠に「設定」するかだけが変わる）
document.querySelectorAll('.achievement-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        currentSlot = Number(btn.dataset.slot);
        document.querySelectorAll('.achievement-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderAchievements();
    });
});

// ランク名・レート・ランキングを表示する（playerInfo画面専用のレイアウトのため、共有のapplyRatingDisplay()は使わない）
function renderRankInfo(userData) {
    const rating = userData?.rating ?? 1500;
    const tier = getRankTier(rating);
    const cssClass = getRankCssClass(rating);

    const rankNameEl = document.getElementById('playerInfoRankName');
    if (rankNameEl) {
        rankNameEl.textContent = `ランク：${tier}`;
        rankNameEl.className = `player-rating ${cssClass}`;
    }

    const badgeEl = document.getElementById('playerInfoRankBadge');
    if (badgeEl) {
        badgeEl.src = getRankBadgePath(rating);
        badgeEl.alt = tier;
        badgeEl.style.display = 'block';
    }

    const rateEl = document.getElementById('playerInfoRatingDisplay');
    if (rateEl) rateEl.textContent = `Rate: ${rating}`;

    getUserRank(rating).then((rankInfo) => {
        if (rateEl && rankInfo) {
            rateEl.textContent = `Rate: ${rating}　　Ranking： #${rankInfo.rank}`;
        }
    });
}

// アチーブメント1/2の称号バナーを表示する（下のアチーブメント一覧で「設定」した内容を反映）
function renderTitleSlots(userData) {
    const ids = userData?.equippedTitles || [];
    for (let slot = 0; slot < 2; slot++) {
        const bannerEl = document.getElementById(`titleSlotBanner${slot}`);
        if (!bannerEl) continue;
        const achId = ids[slot];
        const ach = achId ? ALL_ACHIEVEMENTS.find((a) => a.id === achId) : null;
        bannerEl.className = ach ? `title-slot-banner rarity-${ach.rarity}` : 'title-slot-banner empty';
        bannerEl.textContent = ach ? ach.name : '未設定';
    }
}

function renderAchievements() {
    const list = document.getElementById('achievementList');
    const summary = document.getElementById('achievementSummary');
    if (!list) return;

    // 開いているグループは再描画後も開いた状態を保つ（タブ切替・設定操作のたびに閉じてしまうと使いづらいため）
    const openGroupIds = new Set(
        [...list.querySelectorAll('details.achievement-group[open]')].map((d) => d.dataset.groupId)
    );

    const items = getAchievementViewModel(latestUserData);
    const unlockedCount = items.filter((a) => a.unlocked).length;
    if (summary) summary.textContent = `${unlockedCount} / ${items.length} 解放`;

    const equippedInSlot = (latestUserData.equippedTitles || [])[currentSlot] || null;

    // ①: ロック中キャラのアチーブメント名・条件文をマスクするためのデータ
    const unlockedAchSet = new Set(latestUserData.achievements || []);
    const lockedCharaIds = new Set(
        characterData
            .filter(c => c.requiredAchievementId && !unlockedAchSet.has(c.requiredAchievementId))
            .map(c => c.charaID)
    );
    const charaIdToName = Object.fromEntries(characterData.map(c => [c.charaID, c.name]));

    // ②: 新キャラ解放に紐づくアチーブメントID一覧
    const charUnlockAchIds = new Set(
        characterData.filter(c => c.requiredAchievementId).map(c => c.requiredAchievementId)
    );

    // ロックキャラに関連するアチーブメントのキャラ名をマスク
    function maskCharaText(text, ach) {
        const match = ach.id.match(/(?:chara_win\d+_|solo_bakatare_)(\d+)$/);
        const charaId = match?.[1] ?? ach.hiddenCharaId ?? null;
        if (!charaId || !lockedCharaIds.has(charaId)) return text;
        const realName = charaIdToName[charaId];
        if (!realName) return text;
        const escaped = realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(escaped, 'g'), '？？？');
    }

    list.innerHTML = '';

    ACHIEVEMENT_GROUPS.forEach((group) => {
        const allGroupItems = items.filter((a) => a.groupId === group.id);
        // hidden: true かつ未解放のアチーブは存在を隠す（解放済みなら表示）
        const groupItems = allGroupItems.filter((a) => !a.hidden || a.unlocked);
        const groupUnlocked = groupItems.filter((a) => a.unlocked).length;

        // グループはdetails/summaryで開閉式にする（デフォルトは閉じた状態）
        const details = document.createElement('details');
        details.className = 'achievement-group';
        details.dataset.groupId = group.id;
        if (openGroupIds.has(group.id)) details.open = true;

        const summaryEl = document.createElement('summary');
        summaryEl.className = 'achievement-group-header';
        const groupHasLockedCharUnlock = groupItems.some(a => charUnlockAchIds.has(a.id) && !a.unlocked);
        const groupBadgeHtml = groupHasLockedCharUnlock ? `<span class="new-char-badge">新キャラ解放！</span>` : '';
        summaryEl.innerHTML = `<span class="achievement-group-name">${group.name}</span>${groupBadgeHtml}<span class="achievement-group-count">${groupUnlocked} / ${groupItems.length}</span>`;
        details.appendChild(summaryEl);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'achievement-items';

        groupItems.forEach((ach) => {
            const item = document.createElement('div');
            item.className = `achievement-item rarity-${ach.rarity} ${ach.unlocked ? 'unlocked' : 'locked'}`;

            const displayName = maskCharaText(ach.name, ach);
            const displayCondition = maskCharaText(ach.condition, ach);

            const progressHtml = ach.progress
                ? `<span class="achievement-progress">${Math.min(ach.progress.current, ach.progress.target)} / ${ach.progress.target}</span>`
                : '';

            const isSet = equippedInSlot === ach.id;
            const isCharUnlock = charUnlockAchIds.has(ach.id);
            const charUnlockBadge = `<span class="new-char-badge">新キャラ解放！</span>`;

            // ②: 未所持かつ新キャラ解放アチーブメントの場合、未所持ボタン左にバッジを表示
            const setBtnHtml = ach.unlocked
                ? `<button type="button" class="ach-set-btn ${isSet ? 'set' : ''}" data-id="${ach.id}">${isSet ? '設定済み' : '設定'}</button>`
                : (isCharUnlock ? charUnlockBadge : '') + `<button type="button" class="ach-set-btn" disabled>未所持</button>`;

            const debugBtnsHtml = isDebugUser
                ? `<span class="debug-ach-btns">` +
                  `<button type="button" class="debug-ach-btn debug-unlock-btn" data-id="${ach.id}">解放</button>` +
                  `<button type="button" class="debug-ach-btn debug-reset-btn" data-id="${ach.id}">リセット</button>` +
                  `</span>`
                : '';

            item.innerHTML =
                `<div class="achievement-text">` +
                    `<span class="achievement-name">${displayName}<span class="rarity-badge rarity-${ach.rarity}">${ach.rarity}</span></span>` +
                    `<span class="achievement-condition">${displayCondition}</span>` +
                    progressHtml +
                `</div>` +
                debugBtnsHtml +
                setBtnHtml;
            itemsEl.appendChild(item);
        });

        details.appendChild(itemsEl);
        list.appendChild(details);
    });
}

// アチーブメント一覧のクリックをイベント委任で一括処理（再描画後もバインド不要）
document.getElementById('achievementList').addEventListener('click', async (event) => {
    if (!currentUid) return;

    // 称号設定ボタン
    const setBtn = event.target.closest('.ach-set-btn');
    if (setBtn && !setBtn.disabled) {
        const achId = setBtn.dataset.id;
        const isCurrentlySet = setBtn.classList.contains('set');
        setBtn.disabled = true;
        try {
            const updated = await setEquippedTitle(currentUid, currentSlot, isCurrentlySet ? null : achId);
            latestUserData = { ...latestUserData, equippedTitles: updated };
            renderTitleSlots(latestUserData);
            renderAchievements();
        } catch (e) {
            console.error('[playerInfo] 称号の設定に失敗:', e);
            setBtn.disabled = false;
        }
        return;
    }

    // デバッグ：解放ボタン
    const unlockBtn = event.target.closest('.debug-unlock-btn');
    if (unlockBtn && !unlockBtn.disabled) {
        unlockBtn.disabled = true;
        const achId = unlockBtn.dataset.id;
        try {
            await debugForceUnlockAchievement(currentUid, achId);
            latestUserData = (await getUserRating(currentUid)) || {};
            renderTitleSlots(latestUserData);
            renderAchievements();
            showAchievementToast(achId);
            const unlocked = characterData.find(c => c.requiredAchievementId === achId);
            if (unlocked) showCharacterUnlockModal(unlocked);
        } catch (e) {
            console.error('[playerInfo] デバッグ解放に失敗:', e);
        }
        return;
    }

    // デバッグ：リセットボタン
    const resetBtn = event.target.closest('.debug-reset-btn');
    if (resetBtn && !resetBtn.disabled) {
        resetBtn.disabled = true;
        try {
            await debugForceResetAchievement(currentUid, resetBtn.dataset.id);
            latestUserData = (await getUserRating(currentUid)) || {};
            renderTitleSlots(latestUserData);
            renderAchievements();
        } catch (e) {
            console.error('[playerInfo] デバッグリセットに失敗:', e);
        }
        return;
    }
});

document.getElementById('savePlayerNameButton').addEventListener('click', async () => {
    const nameInput = document.getElementById('playerInfoNameInput');
    const feedback = document.getElementById('saveNameFeedback');
    if (!currentUid || !nameInput) return;

    if (nameInput.value.trim() === '') {
        if (feedback) feedback.textContent = '名前を入力してください';
        return;
    }

    await savePlayerName(currentUid, nameInput.value);

    if (feedback) {
        feedback.textContent = '保存しました';
        setTimeout(() => { feedback.textContent = ''; }, 2000);
    }

    // デバッグ専用：名前の末尾が「@debug」の場合、アチーブを解放してトーストを表示する
    if (nameInput.value.trim().endsWith('@debug')) {
        await debugForceUnlockAchievement(currentUid, DEBUG_ACHIEVEMENT.id);
        latestUserData = (await getUserRating(currentUid)) || {};
        renderTitleSlots(latestUserData);
        renderAchievements();
        showAchievementToast(DEBUG_ACHIEVEMENT.id);
    }
});
