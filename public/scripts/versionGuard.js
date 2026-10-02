// versionGuard.js
// 対戦を始める前(CPU戦・マッチング)に、このタブが最新版かを確かめる(2026-10-02追加)。
// 開きっぱなしのタブは、修正を公開しても古いプログラムのまま動き続けるため。
// 公開中の version.js を読み直して APP_VERSION を比べ、違えば知らせて読み込み直す。
// version.js は GitHub Pages の普通のファイルなので、Firestore の読み取りは増えない。
// - 確認に失敗したとき(通信エラーなど)は止めない。
// - 読み込み直しても、GitHub Pages のキャッシュ(最大10分)で古いファイルが返ることがあるため、
//   同じ新バージョンのために一度読み込み直したタブは、二度目は止めない(読み込み直しの繰り返し防止)。
import { APP_VERSION } from './version.js';
import { t } from './i18n.js';

const RELOADED_FOR_KEY = 'connectReloadedForVersion';

export async function ensureLatestVersion() {
    try {
        const res = await fetch(new URL('./version.js', import.meta.url).href, { cache: 'no-store' });
        if (!res.ok) return true;
        const latest = ((await res.text()).match(/APP_VERSION\s*=\s*["']([^"']+)["']/) || [])[1];
        if (!latest || latest === APP_VERSION) return true;
        if (sessionStorage.getItem(RELOADED_FOR_KEY) === latest) return true;
        sessionStorage.setItem(RELOADED_FOR_KEY, latest);
        alert(t('versionOutdated'));
        location.reload();
        return false;
    } catch (e) {
        console.error('[versionGuard] version check failed', e);
        return true;
    }
}
