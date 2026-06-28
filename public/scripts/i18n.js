// i18n.js - 言語切替モジュール（TopPageと同一の "lang" キーで共有）
// data-i18n属性でHTML静的テキスト切替 + t()で動的テキスト切替

const dict = {
  ja: {
    pageTitle: "原壊：コネクトバトル",
    helpBtn: "あそびかた",
    hubTitle: "モードを選択",
    btnMatch: "マッチング対戦",
    btnCpu: "CPU対戦",
    btnPlayerInfo: "プレイヤー情報・アチーブメント",
    settingsTitle: "設定",
    settingsLang: "言語",
    langJa: "日本語",
    langEn: "English",
    settingsStoneColor: "石の色",
    settingsColorClassic: "クラシック",
    settingsColorSafeA: "カラーセーフ(青/オレンジ)",
    settingsColorSafeB: "カラーセーフ(緑/紫)",
    settingsUltIntensity: "必殺技演出の強度",
    settingsUltStrong: "強(おすすめ)",
    settingsUltWeak: "弱(控えめ)",
    settingsUltOff: "なし",
    settingsVolume: "音量",
    settingsSysVol: "システム音量: ",
    settingsVoiceVol: "ボイス音量: ",
    settingsClickMode: "クリック操作",
    settingsClickSingle: "1クリックで石を落とす",
    settingsClickDouble: "2クリックで石を落とす（列選択→確定）",
    backBtn: "← 戻る",
    labelName: "名前",
    placeholderName: "プレイヤー名を入力",
    labelChara: "キャラ",
    labelCT: "CT",
    labelAbility: "必殺技",
    labelPassphrase: "合言葉",
    placeholderPassphrase: "合言葉を入力",
    btnMatchStart: "マッチング",
    btnSolo: "ソロモード(CPU対戦)",
    statusSelectChara: "キャラクターを選択してください。",
    statusInputName: "名前を入力してください。",
    statusMatching: "マッチング待機中",
    statusMatchingInProgress: "マッチング中・・・",
    statusMatchingDone: "マッチングしました！！",
    statusMatchingCanceled: "分経過したのでキャンセルしました。",
    matchLabelDone: "マッチングしました！<br>バトル画面に移動します。",
    orientationMsg: "横画面にしてください",
    orientationSub: "This game currently supports Japanese only.<br>Thanks for your support!",
    labelAbilityBtn: "必殺技発動",
    btnLeave: "退出する",
    btnRestart: "もう一度",
    btnBackLobby: "ロビーに戻る",
    turnYours: "自分のターン",
    turnOpponent: "相手のターン",
    turnPlayer: "あなたの番",
    turnCpu: "CPUの番",
    winLabelWin: "YOU WIN!",
    winLabelLose: "YOU LOSE!",
    winLabelDraw: "DRAW",
    victoryMsgDraw: "DRAW!! (3-3)",
    leaveConfirm: "本当に退出しますか？\nこの試合は敗北扱いとなり、通常よりも大きいレートペナルティが入ります。",
    ratingCalculating: "レート計算中...",
    msgOpponentLeft: "相手が部屋を抜けたので、あなたの勝利です！<br>キャラクター選択画面に戻ります。",
    alertNoChara: "キャラクターが選択されていません。キャラクター選択画面に戻ります。",
    playerInfoTitle: "プレイヤー情報",
    portraitHint: "📱 この画面は端末を縦持ちにすると見やすくなります",
    backBtnPlayerInfo: "← モード選択に戻る",
    btnSaveName: "保存",
    titleSlotEmpty: "未設定",
    achSectionLabel: "▼アチーブメント▼",
    tabAch1: "アチーブメント1",
    tabAch2: "アチーブメント2",
    toastLabel: "✦ アチーブメント解放！",
    btnAchSet: "設定",
    btnAchSetDone: "設定済み",
    btnAchUnowned: "未所持",
    saveFeedback: "保存しました",
    saveFeedbackEmpty: "名前を入力してください",
    winCountBadge: "勝利数：",
    lockedHintPre: "解放条件<br>アチーブメント<br>",
    lockedHintPost: "<br>を取得",
    returnMsg: "秒後にキャラ選択画面に戻ります。",
    charaUnlockTitle: "✦ 新キャラクター解放 ✦",
    charaUnlockSub: "を解放しました！",
    charaUnlockHint: "タップ / クリックで閉じる",
    newCharBadge: "新キャラ解放！",
  },
  en: {
    pageTitle: "GK: Connect Battle",
    helpBtn: "How to Play",
    hubTitle: "Select Mode",
    btnMatch: "Online Match",
    btnCpu: "CPU Battle",
    btnPlayerInfo: "Player Info & Achievements",
    settingsTitle: "Settings",
    settingsLang: "Language",
    langJa: "日本語",
    langEn: "English",
    settingsStoneColor: "Stone Color",
    settingsColorClassic: "Classic",
    settingsColorSafeA: "Color-Safe (Blue/Orange)",
    settingsColorSafeB: "Color-Safe (Green/Purple)",
    settingsUltIntensity: "Ultimate Effect Intensity",
    settingsUltStrong: "Strong (Recommended)",
    settingsUltWeak: "Weak (Subtle)",
    settingsUltOff: "Off",
    settingsVolume: "Volume",
    settingsSysVol: "System Volume: ",
    settingsVoiceVol: "Voice Volume: ",
    settingsClickMode: "Click Mode",
    settingsClickSingle: "Drop stone in 1 click",
    settingsClickDouble: "Drop stone in 2 clicks (select → confirm)",
    backBtn: "← Back",
    labelName: "Name",
    placeholderName: "Enter player name",
    labelChara: "Chara",
    labelCT: "CT",
    labelAbility: "Ultimate",
    labelPassphrase: "Passphrase",
    placeholderPassphrase: "Enter passphrase",
    btnMatchStart: "Match",
    btnSolo: "Solo Mode (CPU Battle)",
    statusSelectChara: "Please select a character.",
    statusInputName: "Please enter your name.",
    statusMatching: "Waiting for match...",
    statusMatchingInProgress: "Matching...",
    statusMatchingDone: "Match found!!",
    statusMatchingCanceled: " min passed. Matching canceled.",
    matchLabelDone: "Match found!<br>Moving to Battle screen.",
    orientationMsg: "Please rotate to landscape",
    orientationSub: "このゲームは現在日本語のみ対応しています。<br>いつも遊んでくれてありがとう！",
    labelAbilityBtn: "Use Ultimate",
    btnLeave: "Leave",
    btnRestart: "Play Again",
    btnBackLobby: "Back to Lobby",
    turnYours: "Your Turn",
    turnOpponent: "Opponent's Turn",
    turnPlayer: "Your Turn",
    turnCpu: "CPU's Turn",
    winLabelWin: "YOU WIN!",
    winLabelLose: "YOU LOSE!",
    winLabelDraw: "DRAW",
    victoryMsgDraw: "DRAW!! (3-3)",
    leaveConfirm: "Are you sure you want to leave?\nThis match will count as a loss with a larger rating penalty.",
    ratingCalculating: "Calculating rating...",
    msgOpponentLeft: "Your opponent has left. You win!<br>Returning to character select.",
    alertNoChara: "No character selected. Returning to character select.",
    playerInfoTitle: "Player Info",
    portraitHint: "📱 Best viewed in portrait mode.",
    backBtnPlayerInfo: "← Back to Mode Select",
    btnSaveName: "Save",
    titleSlotEmpty: "Not Set",
    achSectionLabel: "▼ Achievements ▼",
    tabAch1: "Achievement 1",
    tabAch2: "Achievement 2",
    toastLabel: "✦ Achievement Unlocked!",
    btnAchSet: "Equip",
    btnAchSetDone: "Equipped",
    btnAchUnowned: "Locked",
    saveFeedback: "Saved",
    saveFeedbackEmpty: "Please enter a name",
    winCountBadge: "Wins: ",
    lockedHintPre: "Unlock:<br>Achievement<br>",
    lockedHintPost: "",
    returnMsg: "s until character select.",
    charaUnlockTitle: "✦ New Character Unlocked ✦",
    charaUnlockSub: " has been unlocked!",
    charaUnlockHint: "Tap / Click to close",
    newCharBadge: "New Character!",
  },
};

// キャラクター名・必殺技の英語訳（charaIDをキーにする）
const charaDict = {
  en: {
    '001': { name: 'Wanderer',           Ability: 'Kyougen: Five Ceremonial Plays',              AbilityDetail: '[BREAK] Selects 4 random columns. Destroys the top 2 stones of each selected column. (Available from turn 15)' },
    '002': { name: 'Citlali',            Ability: 'Edict of Entwined Splendor',                  AbilityDetail: '[BREAK] Selects 3 random columns. Destroys the top 1 stone of each selected column. (Available from turn 6)' },
    '003': { name: 'Alhaitham',          Ability: 'Particular Field: Fetters of Phenomena',      AbilityDetail: '[BREAK] Selects 2 random columns from the center 3. Destroys all stones in those columns. (Available from turn 15)' },
    '004': { name: 'Navia',              Ability: "As the Sunlit Sky's Singing Salute",          AbilityDetail: '[BREAK] Destroys all stones in the top 3 rows.' },
    '005': { name: 'Sparkle',            Ability: 'The Hero with a Thousand Faces',              AbilityDetail: "[EUPHORIA] For this turn and the opponent's next turn, placed stones appear in the opposite color. Win conditions use original colors. (Cannot be used if the opponent used this ability the previous turn.)" },
    '006': { name: 'The Herta',          Ability: 'Told Ya! Magic Happens',                      AbilityDetail: '[BREAK] Selects 1 random column. Destroys all stones in that column. (Even empty columns can be selected)' },
    '007': { name: 'Castorice',          Ability: "Doomshriek, Dawn's Chime",                    AbilityDetail: '[BREAK] Selects 3 random columns from the 4 outer columns (2 on each side). Destroys all stones in those columns. (Available from turn 12)' },
    '008': { name: 'Aventurine',         Ability: 'Roulette Shark',                              AbilityDetail: "[SUPPORT] Reduces opponent's turn time limit by 19 seconds. Can be used up to 5 times." },
    '009': { name: 'Firefly',            Ability: 'Fyrefly Type-IV: Complete Combustion',        AbilityDetail: '[CONSECUTIVE] Selects 1 random column. Drops your stone into that column. (Available from turn 5)' },
    '010': { name: 'Ruan Mei',           Ability: "Petals to Stream, Repose in Dream",           AbilityDetail: '[CONVERT/BREAK] Converts 3 random opponent stones to yours. Then destroys 6 of your stones at random. (Available from turn 13)' },
    '011': { name: 'Lohen',              Ability: 'Manifest Judgment',                           AbilityDetail: '[BREAK] Destroys all stones in the 2nd row from the bottom. Stones above fall due to gravity. (Available from turn 10)' },
    '012': { name: 'Zhongli',            Ability: 'Planet Befall',                               AbilityDetail: "[SEAL] Seals 2 random available columns. Neither player can drop stones there until the end of the opponent's next turn. Reactivates at the start of your next turn with new columns. (Available from turn 5)" },
    '013': { name: 'Cipher',             Ability: "Yours Truly, Kitty Phantom Thief!",           AbilityDetail: "[COPY] Uses the same ability as the opponent. Does nothing if the opponent is also Savel." },
    '014': { name: 'Durin',              Ability: 'Principle of Darkness: As the Stars Smolder', AbilityDetail: '[BREAK] Selects 2 random stones and destroys them. Reactivates at the start of your next turn with new stones. (Available from turn 8)' },
    '015': { name: 'Cerydra',            Ability: "Veni, vidi, vici.",                           AbilityDetail: "[CURSE] On the opponent's next turn, after they place a stone, an additional opponent stone drops in the same column. If that column is full, it drops in a random column." },
    '016': { name: 'Silver Wolf LV.999', Ability: 'God Mode: ON!',                               AbilityDetail: '[VICTORY] Adds +1 to your victory points. If you reach 3 points, the match ends immediately.' },
  },
};

// アチーブメント英語訳（IDをキーにする）
const achDict = {
  en: {
    groups: {
      'ソロモード':     'Solo Mode',
      'ランク到達':     'Rank Achieved',
      '累計勝利':       'Total Wins',
      'キャラ別勝利':   'Character Wins',
      '必殺技':         'Ultimate',
      '決着パターン':   'Victory Pattern',
      'ばかたれチャレンジ': 'Bakatare Challenge',
    },
    items: {
      'solo_win_easy':      { name: 'First Victory',                       condition: 'Win against EASY CPU' },
      'solo_win_normal':    { name: 'Mastering the Standard',              condition: 'Win against NORMAL CPU' },
      'solo_win_hard':      { name: 'Defeating the Tough',                 condition: 'Win against HARD CPU' },
      'solo_win_bakatare':  { name: 'Bakatare Vanquished',                 condition: 'Win against BAKATARE CPU' },
      'solo_bakatare_all':  { name: 'Cheat? Not Me!',                      condition: 'Win against BAKATARE CPU with 9 different characters total' },
      'rank_silver':        { name: 'Silver',                              condition: 'Reach rating 1400 or above' },
      'rank_gold':          { name: 'Gold',                                condition: 'Reach rating 1600 or above' },
      'rank_platinum':      { name: 'Platinum',                            condition: 'Reach rating 1800 or above' },
      'rank_diamond':       { name: 'Diamond',                             condition: 'Reach rating 2000 or above' },
      'rank_legend':        { name: 'Legend',                              condition: 'Reach rating 2200 or above' },
      'rank_bakata_legend': { name: 'Bakata Legend',                       condition: 'Reach rating 2500 or above' },
      'win_first':          { name: 'First Win',                           condition: 'Win your first online match' },
      'win_10':             { name: 'Rising Warrior',                      condition: 'Win 10 online matches' },
      'win_50':             { name: 'Veteran Warrior',                     condition: 'Win 50 online matches' },
      'win_100':            { name: 'Battle-Hardened',                     condition: 'Win 100 online matches' },
      'ult_first_use':      { name: 'First Ultimate',                      condition: 'Use an Ultimate for the first time' },
      'ult_seal_win':       { name: 'Proving Real Skill',                  condition: 'Win an online match without using any Ultimates' },
      'ult_double_win':     { name: 'Ultimate Barrage',                    condition: 'Use an Ultimate 2+ times in one match and win' },
      'ult_five_win':       { name: 'Master of the Board',                 condition: 'Use an Ultimate 5+ times in one match and win' },
      'straight_win':       { name: 'Overwhelming Victory',                condition: 'Win an online match 3-0' },
      'clean_win':          { name: 'Fair and Square',                     condition: 'Win a match with no disconnects or timeouts' },
      'comeback_win':       { name: 'Miraculous Comeback',                 condition: 'Come back from 0-2 down to win 3-2' },
      'cerylua_ult5_win':   { name: 'Air of a Ruler',                      condition: "Use Cerylua's Ultimate 5 times in one match and win" },
      'bakatare_tester':    { name: 'Comrade of Bakatare',                 condition: "Save a name starting with 'ばかたれ@' in Player Info" },
      'debug_test':         { name: 'Debug Test @debug',                   condition: "Save a name ending with '@debug' in Player Info" },
    },
  },
};

export function getCurrentLang() {
  const saved = localStorage.getItem("lang");
  return (saved === "en" || saved === "ja") ? saved : "ja";
}

export function t(key) {
  const lang = getCurrentLang();
  return (dict[lang] || dict.ja)[key] ?? dict.ja[key] ?? key;
}

export function applyLang(lang) {
  localStorage.setItem("lang", lang);
  const d = dict[lang] || dict.ja;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (Object.prototype.hasOwnProperty.call(d, key)) el.textContent = d[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (Object.prototype.hasOwnProperty.call(d, key)) el.placeholder = d[key];
  });
  document.documentElement.lang = lang;
}

export function initLang() {
  applyLang(getCurrentLang());
}

// キャラクター名・必殺技テキストを言語に合わせて返す（null=日本語そのまま使う）
export function getCharaText(charaID, field) {
  const lang = getCurrentLang();
  if (lang === 'ja') return null;
  return charaDict.en[charaID]?.[field] ?? null;
}

// アチーブメントグループ名を言語に合わせて返す
export function getAchGroupName(jaName) {
  const lang = getCurrentLang();
  if (lang === 'ja') return jaName;
  return achDict.en.groups[jaName] ?? jaName;
}

// アチーブメント名・条件を言語に合わせて返す（null=日本語そのまま使う）
export function getAchText(achId, field) {
  const lang = getCurrentLang();
  if (lang === 'ja') return null;
  return achDict.en.items[achId]?.[field] ?? null;
}

// キャラ別アチーブメントの動的テキスト（chara_win10_XXX / chara_win50_XXX / solo_bakatare_XXX）
export function getCharaAchText(achId, jaName, jaCondition, charaEnName) {
  const lang = getCurrentLang();
  if (lang === 'ja') return { name: jaName, condition: jaCondition };
  if (achId.startsWith('chara_win10_')) {
    return { name: `${charaEnName}'s Guidance`, condition: `Win 10 online matches as ${charaEnName}` };
  }
  if (achId.startsWith('chara_win50_')) {
    return { name: `${charaEnName}'s Bond`, condition: `Win 50 online matches as ${charaEnName}` };
  }
  if (achId.startsWith('solo_bakatare_') && achId !== 'solo_bakatare_all') {
    return { name: `Vanquish with ${charaEnName}`, condition: `Win against BAKATARE CPU as ${charaEnName}` };
  }
  return { name: jaName, condition: jaCondition };
}
