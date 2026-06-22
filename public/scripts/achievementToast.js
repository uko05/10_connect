// achievementToast.js - アチーブメント解放トースト（画面下からスライドイン）。キューで順番に表示する。
import { ALL_ACHIEVEMENTS, DEBUG_ACHIEVEMENT } from './achievements.js';

let achToastQueue = [];
let achToastBusy = false;

export function showAchievementToast(achId) {
    achToastQueue.push(achId);
    if (!achToastBusy) processToastQueue();
}

function processToastQueue() {
    if (achToastQueue.length === 0) { achToastBusy = false; return; }
    achToastBusy = true;

    const achId = achToastQueue.shift();
    const ach = ALL_ACHIEVEMENTS.find((a) => a.id === achId) || (achId === DEBUG_ACHIEVEMENT.id ? DEBUG_ACHIEVEMENT : null);
    if (!ach) { processToastQueue(); return; }

    const toast = document.getElementById('ach-toast');
    if (!toast) { achToastBusy = false; return; }

    const rarity = ach.rarity || 'bronze';
    document.getElementById('ach-toast-name').textContent = ach.name;
    document.getElementById('ach-toast-condition').textContent = ach.condition;

    toast.style.display = 'block';
    toast.classList.remove('rarity-bronze', 'rarity-silver', 'rarity-gold', 'rarity-legend');
    toast.classList.add(`rarity-${rarity}`);
    void toast.offsetWidth; // reflow
    toast.classList.remove('ach-toast-hide');
    toast.classList.add('ach-toast-show');

    setTimeout(() => {
        toast.classList.remove('ach-toast-show');
        toast.classList.add('ach-toast-hide');
        // 退場アニメーション(0.42s)完了後に非表示にして次のトーストへ
        setTimeout(() => {
            toast.style.display = 'none';
            toast.classList.remove('ach-toast-hide');
            processToastQueue();
        }, 450);
    }, 3200); // 表示時間 3.2秒
}
