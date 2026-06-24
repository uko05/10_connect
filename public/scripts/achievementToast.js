// achievementToast.js - アチーブメント解放トースト＆キャラクター解放モーダル
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

// キャラクター解放モーダル（アチーブメント解放によってキャラが使用可能になった時に表示）
// character: characterData の1エントリ（src / name を使用）
export function showCharacterUnlockModal(character) {
    // 既存モーダルが残っていれば即閉じる
    const existing = document.getElementById('chara-unlock-modal');
    if (existing) existing.remove();

    // CSS keyframes を1回だけ注入
    if (!document.getElementById('chara-unlock-styles')) {
        const style = document.createElement('style');
        style.id = 'chara-unlock-styles';
        style.textContent = `
            @keyframes chara-unlock-fadein  { from { opacity:0 } to { opacity:1 } }
            @keyframes chara-unlock-fadeout { from { opacity:1 } to { opacity:0 } }
            @keyframes chara-unlock-pop {
                0%   { opacity:0; transform:scale(0.55) }
                65%  { transform:scale(1.06) }
                100% { opacity:1; transform:scale(1) }
            }
            @keyframes chara-unlock-glow {
                from { box-shadow: 0 0 18px #ffd700, 0 0 4px #fff; }
                to   { box-shadow: 0 0 52px #ffd700, 0 0 22px #ff9900; }
            }
            @keyframes chara-unlock-shimmer {
                0%,100% { text-shadow: 0 0 8px #ffd700; }
                50%     { text-shadow: 0 0 24px #ffd700, 0 0 48px #ff9900; }
            }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'chara-unlock-modal';
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,0,0.86)',
        zIndex: '99999',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        animation: 'chara-unlock-fadein 0.35s ease',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
        textAlign: 'center',
        animation: 'chara-unlock-pop 0.55s cubic-bezier(.17,.67,.42,1.28)',
        padding: '0 16px',
    });

    const label = document.createElement('div');
    label.textContent = '✦ 新キャラクター解放 ✦';
    Object.assign(label.style, {
        fontSize: 'clamp(1em, 3vw, 1.4em)',
        color: '#ffd700', letterSpacing: '2px',
        marginBottom: '16px',
        animation: 'chara-unlock-shimmer 2s ease-in-out infinite',
    });

    const img = document.createElement('img');
    img.src = character.src;
    img.alt = character.name;
    Object.assign(img.style, {
        width: 'min(200px, 44vw)', height: 'auto',
        borderRadius: '12px',
        animation: 'chara-unlock-glow 1.4s ease-in-out infinite alternate',
    });

    const name = document.createElement('div');
    name.textContent = character.name;
    Object.assign(name.style, {
        marginTop: '18px',
        fontSize: 'clamp(1.3em, 5vw, 2em)',
        fontWeight: 'bold', color: '#fff',
        textShadow: '0 0 10px #ffd700',
    });

    const sub = document.createElement('div');
    sub.textContent = 'を解放しました！';
    Object.assign(sub.style, {
        marginTop: '6px', color: '#ffd700',
        fontSize: 'clamp(0.9em, 2.5vw, 1.1em)',
    });

    const hint = document.createElement('div');
    hint.textContent = 'タップ / クリックで閉じる';
    Object.assign(hint.style, {
        marginTop: '28px', color: '#888',
        fontSize: 'clamp(0.7em, 2vw, 0.85em)',
    });

    box.appendChild(label);
    box.appendChild(img);
    box.appendChild(name);
    box.appendChild(sub);
    box.appendChild(hint);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const dismiss = () => {
        overlay.style.animation = 'chara-unlock-fadeout 0.3s ease forwards';
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.addEventListener('click', dismiss);
    setTimeout(dismiss, 6000);
}
