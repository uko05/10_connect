#!/usr/bin/env bash
# tools/sim/overnight.sh — 寝ている間に回す一式(10_connect フォルダで実行: bash tools/sim/overnight.sh)
# 1. 先読み3手・試して判断(200試合/組み合わせ)
# 2. 先読み6手・キャラ別ルール(200試合/組み合わせ)
# 3. 先読み6手・試して判断(200試合/組み合わせ)
# 4. 比較表を作る(キャラ別ルール vs 試して判断、先読み3手と6手それぞれ)
set -e
cd "$(dirname "$0")/../.."
RUN="node --experimental-default-type=module tools/sim/run.mjs --tie-random --games 200"
R=tools/sim/results
latest() { ls -t $R/*_$1.json | head -1; }
echo "開始: $(date)"
$RUN --depth 3 --rollout > /dev/null 2>&1; echo "3手・試して判断 完了: $(date)"
$RUN --depth 6          > /dev/null 2>&1; echo "6手・キャラ別ルール 完了: $(date)"
$RUN --depth 6 --rollout > /dev/null 2>&1; echo "6手・試して判断 完了: $(date)"
node tools/sim/compare.mjs "$(latest d3_tr)" "$(latest d3_tr_ro)" $R/compare_d3.md > /dev/null
node tools/sim/compare.mjs "$(latest d6_tr)" "$(latest d6_tr_ro)" $R/compare_d6.md > /dev/null
echo "全部完了: $(date)"
