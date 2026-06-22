// playerInfo.js - プレイヤー情報画面（レート・アチーブメントの表示）
import { authReady } from './firebaseConfig.js';
import { APP_VERSION } from './version.js';
import { ensureUserDoc, getUserRating, applyRatingDisplay, savePlayerName } from './eloRating.js';
import { ACHIEVEMENT_GROUPS, DEBUG_ACHIEVEMENT } from './achievements.js';
import { getAchievementViewModel } from './achievementManager.js';
import { showAchievementToast } from './achievementToast.js';

document.getElementById('version').textContent = APP_VERSION;

document.getElementById('backToHubButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

let currentUid = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await authReady;
        currentUid = user.uid;
        await ensureUserDoc(user.uid);

        const myRating = await getUserRating(user.uid);

        const nameInput = document.getElementById('playerInfoNameInput');
        if (nameInput) nameInput.value = myRating?.playerName || '';

        applyRatingDisplay(
            document.getElementById('playerInfoRatingDisplay'),
            myRating,
            document.getElementById('playerInfoRankBadge'),
            document.getElementById('playerInfoRankName')
        );

        renderAchievements(myRating || {});
    } catch (error) {
        console.error('[playerInfo] Auth initialization failed:', error);
    }
});

function renderAchievements(userData) {
    const list = document.getElementById('achievementList');
    const summary = document.getElementById('achievementSummary');
    if (!list) return;

    const items = getAchievementViewModel(userData);
    const unlockedCount = items.filter((a) => a.unlocked).length;
    if (summary) summary.textContent = `${unlockedCount} / ${items.length} 解放`;

    list.innerHTML = '';

    ACHIEVEMENT_GROUPS.forEach((group) => {
        const groupItems = items.filter((a) => a.groupId === group.id);
        const groupUnlocked = groupItems.filter((a) => a.unlocked).length;

        // グループはdetails/summaryで開閉式にする（デフォルトは閉じた状態）
        const details = document.createElement('details');
        details.className = 'achievement-group';

        const summaryEl = document.createElement('summary');
        summaryEl.className = 'achievement-group-header';
        summaryEl.innerHTML = `<span>${group.name}</span><span>${groupUnlocked} / ${groupItems.length}</span>`;
        details.appendChild(summaryEl);

        const itemsEl = document.createElement('div');
        itemsEl.className = 'achievement-items';

        groupItems.forEach((ach) => {
            const item = document.createElement('div');
            item.className = `achievement-item rarity-${ach.rarity} ${ach.unlocked ? 'unlocked' : 'locked'}`;

            const progressHtml = ach.progress
                ? `<span class="achievement-progress">${Math.min(ach.progress.current, ach.progress.target)} / ${ach.progress.target}</span>`
                : '';

            item.innerHTML =
                `<div class="achievement-text">` +
                    `<span class="achievement-name">${ach.unlocked ? ach.name : '？？？'}<span class="rarity-badge rarity-${ach.rarity}">${ach.rarity}</span></span>` +
                    `<span class="achievement-condition">${ach.condition}</span>` +
                    progressHtml +
                `</div>`;
            itemsEl.appendChild(item);
        });

        details.appendChild(itemsEl);
        list.appendChild(details);
    });
}

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
