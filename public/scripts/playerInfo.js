// playerInfo.js - プレイヤー情報画面（レート・称号・実績の表示用、実績本体は今後追加）
import { authReady } from './firebaseConfig.js';
import { APP_VERSION } from './version.js';
import { ensureUserDoc, getUserRating, applyRatingDisplay } from './eloRating.js';

document.getElementById('version').textContent = APP_VERSION;

document.getElementById('backToHubButton').addEventListener('click', () => {
    window.location.href = 'index.html';
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await authReady;
        await ensureUserDoc(user.uid);

        const myRating = await getUserRating(user.uid);

        const nameEl = document.getElementById('playerInfoName');
        if (nameEl) nameEl.textContent = myRating?.playerName || 'プレイヤー';

        applyRatingDisplay(
            document.getElementById('playerInfoRatingDisplay'),
            myRating,
            document.getElementById('playerInfoRankBadge'),
            document.getElementById('playerInfoRankName')
        );
    } catch (error) {
        console.error('[playerInfo] Auth initialization failed:', error);
    }
});
