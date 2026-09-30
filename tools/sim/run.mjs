// tools/sim/run.mjs — 全キャラの総当たりをCPU同士で対戦させ、勝率表を作る
//
// 使い方(10_connect フォルダで実行):
//   node --experimental-default-type=module tools/sim/run.mjs --depth 3 --games 100
//     --depth  CPUの先読みの深さ(ソロの難易度: EASY=1 / NORMAL=3 / HARD=6)
//     --games  1つの組み合わせあたりの試合数(3本先取を1試合と数える)
//     --tie-random  同点の手をランダムに選ぶ(省略時は本来のCPUと同じく中央寄りを必ず選ぶ)
//     --rollout     必殺技を撃つかを「撃つ/撃たないを裏で試して良い方」で決める(省略時はソロCPUと同じキャラ別ルール)
//     --charge 010=13,011=12  キャラの1石あたりチャージ量を一時的に上書き(characterData.js は変えない。調整案の試し打ち用)
//     --turn   010=18  必殺技を撃てるターン(AbilityUseTurn)を一時的に上書き
//     --only   010,011,004  このキャラが出る組み合わせだけ回す(速い。他キャラの勝率はこのキャラ戦だけの値になる)
//     --tag    ファイル名に付ける目印(例: --tag nerfA)
//     --out    結果の保存先(省略時 tools/sim/results/)
// 結果: results/<日時>_d<深さ>.json と .md(総合勝率ランキング・相性表)
//
// ※ public/scripts の .js を ESM として読むため --experimental-default-type=module が必要。

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Match, makeRng, CHARAS } from './engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function seedOf(a, b, g, depth) {
    let h = 2166136261;
    for (const ch of `${a}|${b}|${g}|${depth}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// 1組み合わせ分の試合を回す(ワーカー側)
function runPair({ a, b, games, depth, tieRandom, rollout, gameFrom = 0, chargeOverride = {}, turnOverride = {} }) {
    for (const [id, v] of Object.entries(chargeOverride)) CHARAS[id].charge = v;
    for (const [id, v] of Object.entries(turnOverride)) CHARAS[id].AbilityUseTurn = v;
    const r = { a, b, winsA: 0, winsB: 0, draws: 0, ultsA: 0, ultsB: 0, rounds: 0, roundDraws: 0, cappedRounds: 0, turns: 0, firstMoverRoundWins: 0, decidedRounds: 0 };
    for (let g = gameFrom; g < gameFrom + games; g++) {
        const swap = g % 2 === 1; // 奇数試合は左右(赤/黄)を入れ替えて、石の色の有利不利を打ち消す
        const [x, y] = swap ? [b, a] : [a, b];
        const m = new Match(x, y, { depthA: depth, depthB: depth, rng: makeRng(seedOf(a, b, g, depth)), tieRandom, abilityMode: rollout ? 'rollout' : 'rules' });
        const w = m.play();
        // a は入れ替えなしならサイドA、入れ替えありならサイドBで戦っている
        const aSide = swap ? 'B' : 'A';
        if (w === 'draw') r.draws++;
        else if (w === aSide) r.winsA++;
        else r.winsB++;
        r.ultsA += swap ? m.sides.B.ultCount : m.sides.A.ultCount;
        r.ultsB += swap ? m.sides.A.ultCount : m.sides.B.ultCount;
        r.rounds += m.rounds;
        r.roundDraws += m.draws;
        r.cappedRounds += m.cappedRounds;
        r.turns += m.totalTurns;
        r.firstMoverRoundWins += m.firstMoverRoundWins;
        r.decidedRounds += m.decidedRounds;
    }
    return r;
}

if (!isMainThread) {
    parentPort.on('message', (task) => {
        if (task === null) { process.exit(0); }
        parentPort.postMessage(runPair(task));
    });
} else {
    const argv = process.argv.slice(2);
    const tieRandom = argv.includes('--tie-random');
    const rollout = argv.includes('--rollout');
    const args = Object.fromEntries(argv.filter((v) => v !== '--tie-random' && v !== '--rollout').reduce((acc, v, i, arr) => (v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
    const depth = parseInt(args.depth ?? '3', 10);
    const games = parseInt(args.games ?? '100', 10);
    const outDir = args.out ?? path.join(HERE, 'results');
    const ids = Object.keys(CHARAS).sort();
    const parseOverride = (opt) => Object.fromEntries((args[opt] ?? '').split(',').filter(Boolean).map((kv) => {
        const [id, v] = kv.split('=');
        if (!CHARAS[id] || !(Number(v) > 0)) { console.error(`--${opt} の指定が不正: ${kv}`); process.exit(1); }
        return [id, Number(v)];
    }));
    const chargeOverride = parseOverride('charge');
    const turnOverride = parseOverride('turn');
    const only = (args.only ?? '').split(',').filter(Boolean);
    for (const id of only) if (!CHARAS[id]) { console.error(`--only のキャラIDが不正: ${id}`); process.exit(1); }
    const origCharge = Object.fromEntries(ids.map((id) => [id, CHARAS[id].charge]));
    const origTurn = Object.fromEntries(ids.map((id) => [id, CHARAS[id].AbilityUseTurn]));
    const tasks = [];
    // 1組み合わせを10試合ずつに分けて配る(時間のかかる組み合わせに1つのワーカーが張り付かないように)
    const CHUNK = 10;
    for (let i = 0; i < ids.length; i++) for (let j = i; j < ids.length; j++) {
        if (only.length && !only.includes(ids[i]) && !only.includes(ids[j])) continue;
        for (let from = 0; from < games; from += CHUNK) tasks.push({ a: ids[i], b: ids[j], games: Math.min(CHUNK, games - from), gameFrom: from, depth, tieRandom, rollout, chargeOverride, turnOverride });
    }
    fs.mkdirSync(outDir, { recursive: true });
    const progressFile = path.join(outDir, 'progress.txt'); // 途中経過(いつでも確認できるように)

    const threads = Math.max(1, Math.min(os.cpus().length - 2, tasks.length));
    const chunks = [];
    const started = Date.now();
    let next = 0;
    await new Promise((resolve) => {
        let alive = threads;
        for (let t = 0; t < threads; t++) {
            const w = new Worker(fileURLToPath(import.meta.url), { execArgv: process.execArgv });
            const feed = () => {
                if (next < tasks.length) w.postMessage(tasks[next++]);
                else { w.postMessage(null); if (--alive === 0) resolve(); }
            };
            w.on('message', (res) => {
                chunks.push(res);
                const msg = `${chunks.length}/${tasks.length} 完了 (${((Date.now() - started) / 1000).toFixed(0)}秒)`;
                process.stdout.write(`\r${msg}`);
                fs.writeFileSync(progressFile, `${msg}\n`);
                feed();
            });
            w.on('error', (e) => { console.error(e); process.exit(1); });
            feed();
        }
    });
    console.log();
    // 分割した結果を組み合わせごとに合算する
    const merged = new Map();
    for (const c of chunks) {
        const key = `${c.a}|${c.b}`;
        const m = merged.get(key);
        if (!m) { merged.set(key, { ...c }); continue; }
        for (const k of Object.keys(c)) if (typeof c[k] === 'number') m[k] += c[k];
    }
    const results = [...merged.values()];

    // ── 集計 ──
    const name = (id) => CHARAS[id].name;
    const total = Object.fromEntries(ids.map((id) => [id, { wins: 0, losses: 0, draws: 0, ults: 0, games: 0 }]));
    const matrix = {}; // matrix[a][b] = a が b に勝った割合
    for (const r of results) {
        matrix[r.a] ??= {}; matrix[r.b] ??= {};
        const n = r.winsA + r.winsB + r.draws;
        matrix[r.a][r.b] = (r.winsA + r.draws / 2) / n;
        matrix[r.b][r.a] = (r.winsB + r.draws / 2) / n;
        if (r.a === r.b) continue; // ミラー戦は総合勝率に入れない
        total[r.a].wins += r.winsA; total[r.a].losses += r.winsB; total[r.a].draws += r.draws; total[r.a].ults += r.ultsA; total[r.a].games += n;
        total[r.b].wins += r.winsB; total[r.b].losses += r.winsA; total[r.b].draws += r.draws; total[r.b].ults += r.ultsB; total[r.b].games += n;
    }
    const firstMover = results.reduce((acc, r) => [acc[0] + r.firstMoverRoundWins, acc[1] + r.decidedRounds], [0, 0]);
    const ranking = ids.filter((id) => total[id].games > 0).map((id) => ({ id, name: name(id), ...total[id], rate: (total[id].wins + total[id].draws / 2) / total[id].games }))
        .sort((x, y) => y.rate - x.rate);

    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const base = path.join(outDir, `${stamp}_d${depth}${tieRandom ? '_tr' : ''}${rollout ? '_ro' : ''}${args.tag ? `_${args.tag}` : ''}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ depth, games, tieRandom, rollout, chargeOverride, turnOverride, only, ranking, matrix, results, firstMoverRate: firstMover[0] / firstMover[1] }, null, 2));

    const pct = (v) => `${(v * 100).toFixed(1)}%`;
    let md = `# コネバト 対戦シミュレーション結果\n\n- CPUの先読み: ${depth}手${tieRandom ? '(同点の手はランダム)' : ''}${rollout ? ' / 必殺技は「撃つ・撃たないを試して判断」' : ' / 必殺技はキャラ別ルールで判断'} / 1組み合わせ ${games}試合(3本先取) / 計 ${results.reduce((s, r) => s + r.winsA + r.winsB + r.draws, 0)}試合\n`;
    md += `- ラウンド先攻の勝率: ${pct(firstMover[0] / firstMover[1])}\n`;
    md += `- 手数上限(150手)で打ち切ったラウンド: ${results.reduce((s, r) => s + r.cappedRounds, 0)} / ${results.reduce((s, r) => s + r.rounds, 0)}\n`;
    if (Object.keys(chargeOverride).length) md += `- チャージ量を上書き: ${Object.entries(chargeOverride).map(([id, v]) => `${name(id)} ${origCharge[id]}→${v}`).join(' / ')}
`;
    if (Object.keys(turnOverride).length) md += `- 撃てるターンを上書き: ${Object.entries(turnOverride).map(([id, v]) => `${name(id)} ${origTurn[id]}→${v}`).join(' / ')}
`;
    if (only.length) md += `- ${only.map(name).join('・')} が出る組み合わせだけ回した(他キャラの勝率はこのキャラ戦だけの値)
`;
    md += `- ※アベンチュリンはソロ仕様(相手チャージ-50)で代用した参考値\n\n`;
    md += `## 総合勝率(ミラー戦を除く)\n\n| 順位 | キャラ | 勝率 | 勝 | 敗 | 分 | 1試合あたり必殺技 |\n|---|---|---|---|---|---|---|\n`;
    ranking.forEach((r, i) => { md += `| ${i + 1} | ${r.name} | ${pct(r.rate)} | ${r.wins} | ${r.losses} | ${r.draws} | ${(r.ults / r.games).toFixed(2)} |\n`; });
    md += `\n## 相性表(行のキャラが列のキャラに勝った割合)\n\n| | ${ranking.map((r) => r.name).join(' | ')} |\n|---|${ranking.map(() => '---').join('|')}|\n`;
    for (const row of ranking) md += `| **${row.name}** | ${ranking.map((col) => (row.id === col.id ? '-' : pct(matrix[row.id][col.id]))).join(' | ')} |\n`;
    fs.writeFileSync(`${base}.md`, md);
    console.log(`保存: ${base}.md / .json (${((Date.now() - started) / 1000).toFixed(0)}秒)`);
}
