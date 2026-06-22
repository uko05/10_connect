// playerInfo.js - プレイヤー情報画面（レート・アチーブメント・称号の表示）
import { authReady } from './firebaseConfig.js';
import { APP_VERSION } from './version.js';
import { ensureUserDoc, getUserRating, getUserRank, savePlayerName } from './eloRating.js';
import { getRankTier, getRankCssClass, getRankBadgePath } from './rankConfig.js';
import { ACHIEVEMENT_GROUPS, ALL_ACHIEVEMENTS, DEBUG_ACHIEVEMENT } from './achievements.js';
import { getAchievementViewModel, setEquippedTitle } from './achievementManager.js';
import { showAchievementToast } from './achievementToast.js';

document.getElementById('version').textContent = APP_VERSION;

document.getElementById('backToHubButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

let currentUid = null;
let latestUserData = {};
let currentSlot = 0; // 称号スロット（0=アチーブメント1, 1=アチーブメント2）。タブで切り替える

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await authReady;
        currentUid = user.uid;
        await ensureUserDoc(user.uid);

        const myRating = await getUserRating(user.uid);
        latestUserData = myRating || {};

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

    list.innerHTML = '';

    ACHIEVEMENT_GROUPS.forEach((group) => {
        const groupItems = items.filter((a) => a.groupId === group.id);
        const groupUnlocked = groupItems.filter((a) => a.unlocked).length;

        // グループはdetails/summaryで開閉式にする（デフォルトは閉じた状態）
        const details = document.createElement('details');
        details.className = 'achievement-group';
        details.dataset.groupId = group.id;
        if (openGroupIds.has(group.id)) details.open = true;

        const summaryEl = document.createElement('summary');
        summaryEl.className = 'achievement-group-header';
        summaryEl.innerHTML = `<span class="achievement-group-name">${group.name}</span><span class="achievement-group-count">${groupUnlocked} / ${groupItems.length}</span>`;
        details.appendChild(summaryEl);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'achievement-items';

        groupItems.forEach((ach) => {
            const item = document.createElement('div');
            item.className = `achievement-item rarity-${ach.rarity} ${ach.unlocked ? 'unlocked' : 'locked'}`;

            const progressHtml = ach.progress
                ? `<span class="achievement-progress">${Math.min(ach.progress.current, ach.progress.target)} / ${ach.progress.target}</span>`
                : '';

            const isSet = equippedInSlot === ach.id;
            const setBtnHtml = ach.unlocked
                ? `<button type="button" class="ach-set-btn ${isSet ? 'set' : ''}" data-id="${ach.id}">${isSet ? '設定済み' : '設定'}</button>`
                : `<button type="button" class="ach-set-btn" disabled>未所持</button>`;

            item.innerHTML =
                `<div class="achievement-text">` +
                    `<span class="achievement-name">${ach.unlocked ? ach.name : '？？？'}<span class="rarity-badge rarity-${ach.rarity}">${ach.rarity}</span></span>` +
                    `<span class="achievement-condition">${ach.condition}</span>` +
                    progressHtml +
                `</div>` +
                setBtnHtml;
            itemsEl.appendChild(item);
        });

        details.appendChild(itemsEl);
        list.appendChild(details);
    });
}

// 「設定」/「設定済み」ボタンのクリック（イベント委任：一覧が再描画されても再バインド不要）
document.getElementById('achievementList').addEventListener('click', async (event) => {
    const btn = event.target.closest('.ach-set-btn');
    if (!btn || !currentUid || btn.disabled) return;

    const achId = btn.dataset.id;
    const isCurrentlySet = btn.classList.contains('set');

    btn.disabled = true;
    try {
        const updated = await setEquippedTitle(currentUid, currentSlot, isCurrentlySet ? null : achId);
        latestUserData = { ...latestUserData, equippedTitles: updated };
        renderTitleSlots(latestUserData);
        renderAchievements();
    } catch (e) {
        console.error('[playerInfo] 称号の設定に失敗:', e);
        btn.disabled = false;
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

    // デバッグ専用：名前の末尾が「@debug」の場合、何度でもトーストを確認できる（一覧には出さず、解放記録もしない）
    if (nameInput.value.trim().endsWith('@debug')) {
        showAchievementToast(DEBUG_ACHIEVEMENT.id);
    }
});
