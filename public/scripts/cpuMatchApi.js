// cpuMatchApi.js — レート戦のCPU戦(2026-10-25)のサーバー呼び出し。
// サーバー側は 24_AccountCenter/functions/connectCpu.js(connectCpuStart / connectCpuFinish)
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { app } from "./firebaseConfig.js";

const functions = getFunctions(app, 'asia-northeast1');

export const CPU_MATCH_KEY = 'connectCpuMatch'; // sessionStorage: 対局の内容(キャラ選択画面 → 対戦画面)

// CPU戦を始める(CPUの名前・キャラ・レート・強さ・シードがサーバーで決まる)
export async function startCpuMatch(charaId) {
    const res = await httpsCallable(functions, 'connectCpuStart')({ charaId });
    return res.data;
}

// CPU戦の結果を送る(自分の操作の記録だけ。サーバーが対局を再現してレートを動かす)
export async function finishCpuMatch(matchId, log) {
    const res = await httpsCallable(functions, 'connectCpuFinish', { timeout: 120000 })({ matchId, log });
    return res.data;
}
