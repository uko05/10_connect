
// キャラクターのデータ
export const characterData = [
    { 
        src: 'public/chara/Albedo.png', 
        charaID: '001', 
        name: 'アルベド', 
        charge: 10, 
        chargeMax: 200,
        Ability: '誕生式・大地の潮', 
        AbilityDetail: '【破壊】ランダムな4列の上から2個の石を破壊する。(15ターン目から発動可能)', 
        AbilityUseTurn: 15,  
        AbilityCutImage: 'public/chara/ult_Albedo.png', 
        voice_select: 'public/scripts/sound/albedo_select.wav',
        voice_attack: 'public/scripts/sound/albedo_attack.wav',
        voice_ult: 'public/scripts/sound/albedo_ult.wav',
        process: 'ult_allTopDelete' // 関数名を文字列として保持
    },
    { 
        src: 'public/chara/YaeMiko.png', 
        charaID: '002', 
        name: '八重神子', 
        charge: 15, 
        chargeMax: 200,
        Ability: '大密法・天狐顕現', 
        AbilityDetail: '【破壊】ランダムな縦3列の一番上の石を破壊する。(6ターン目から発動可能)', 
        AbilityUseTurn: 6,  
        AbilityCutImage: 'public/chara/ult_YaeMiko.png', 
        voice_select: 'public/scripts/sound/yaemiko_select.wav',
        voice_attack: 'public/scripts/sound/yaemiko_attack.wav',
        voice_ult: 'public/scripts/sound/yaemiko_ult.wav',
        process: 'ult_random3TopDelete' // 関数名を文字列として保持
    },
    { 
        src: 'public/chara/Cyno.png', 
        charaID: '003', 
        name: 'セノ', 
        charge: 12, 
        chargeMax: 200,
        Ability: '聖儀・狼駆憑走', 
        AbilityDetail: '【破壊】中央3列の内、ランダムな２列の石を破壊する。(15ターン目から発動可能)', 
        AbilityUseTurn: 15,  
        AbilityCutImage: 'public/chara/ult_Cyno.png', 
        voice_select: 'public/scripts/sound/cyno_select.wav',
        voice_attack: 'public/scripts/sound/cyno_attack.wav',
        voice_ult: 'public/scripts/sound/cyno_ult.wav',
        process: 'ult_randomCenter2Delete' // 関数名を文字列として保持
    },
    { 
        src: 'public/chara/Raiden.png', 
        charaID: '004', 
        name: '雷電将軍', 
        charge: 9, 
        chargeMax: 200,
        Ability: '奥義·夢想真説', 
        AbilityDetail: '【破壊】上から横3列の石を全て破壊する。', 
        AbilityUseTurn: 1,  
        AbilityCutImage: 'public/chara/ult_Raiden.png', 
        voice_select: 'public/scripts/sound/raiden_select.wav',
        voice_attack: 'public/scripts/sound/raiden_attack.wav',
        voice_ult: 'public/scripts/sound/raiden_ult.wav',
        process: 'ult_Top2Delete' // 関数名を文字列として保持
    },
    { 
        src: 'public/chara/hanabi.png', 
        charaID: '005', 
        name: '花火', 
        charge: 9, 
        chargeMax: 200,
        Ability: '一人千役', 
        AbilityDetail: '【愉悦】このターンと次の相手のターン、打つ石の色を逆転させる。(勝敗判定などは元の色で行う)', 
        AbilityUseTurn: 1,  
        AbilityCutImage: 'public/chara/ult_hanabi.png', 
        voice_select: 'public/scripts/sound/hanabi_select.mp3',
        voice_attack: 'public/scripts/sound/hanabi_attack.mp3',
        voice_ult: 'public/scripts/sound/hanabi_ult.mp3',
        process: 'ult_randomAbility' // 関数名を文字列として保持
    },
    { 
        src: 'public/chara/helta.png', 
        charaID: '006', 
        name: 'ヘルタ', 
        charge: 14, 
        chargeMax: 200,
        Ability: '私がかけた魔法だよ', 
        AbilityDetail: '【破壊】ランダムな縦列の石を全て破壊する。(石がない列も対象)', 
        AbilityUseTurn: 1,  
        AbilityCutImage: 'public/chara/ult_helta.png', 
        voice_select: 'public/scripts/sound/helta_select.mp3',
        voice_attack: 'public/scripts/sound/helta_attack.mp3',
        voice_ult: 'public/scripts/sound/helta_ult.mp3', 
        process: 'ult_randomVerticalAllDelete' // 関数名を文字列として保持
    },
    { 
        src: 'public/chara/ruanmama.png', 
        charaID: '007', 
        name: 'ルアン・メェイ', 
        charge: 10, 
        chargeMax: 200,
        Ability: '花に濡れても雫は払わず', 
        AbilityDetail: '【狂気】ランダムなお互いの石をX個ずつ逆転させる(X…この必殺技の使用回数)。(10ターン目から発動可能)', 
        AbilityUseTurn: 10,  
        AbilityCutImage: 'public/chara/ult_ruanmama.png', 
        voice_select: 'public/scripts/sound/ruan_select.mp3',
        voice_attack: 'public/scripts/sound/ruan_attack.mp3',
        voice_ult: 'public/scripts/sound/ruan_ult.mp3',
        process: 'ult_madness' // 関数名を文字列として保持
    },
    { 
        src: 'public/chara/aben.png', 
        charaID: '008', 
        name: 'アベンチュリン', 
        charge: 17, 
        chargeMax: 200,
        Ability: 'ロード・オブ・ルーレット', 
        AbilityDetail: '【サポート】相手の思考時間を10％減少させる。この必殺技は9回まで使用可能。',
        AbilityUseTurn: 1,  
        AbilityCutImage: 'public/chara/ult_aben.png', 
        voice_select: 'public/scripts/sound/aben_select.mp3',
        voice_attack: 'public/scripts/sound/aben_attack.mp3',
        voice_ult: 'public/scripts/sound/aben_ult.mp3',  
        process: 'ult_downThinkingTime' // 関数名を文字列として保持
    },
    {
        src: 'public/chara/hotaru.png', 
        charaID: '009', 
        name: 'ホタル', 
        charge: 13, 
        chargeMax: 200,
        Ability: 'ファイアフライ-Ⅳ-完全燃焼', 
        AbilityDetail: '【連続攻撃】ランダムな縦列に石を投下する。(5ターン目から発動可能)', 
        AbilityUseTurn: 5,  
        AbilityCutImage: 'public/chara/ult_hotaru.png', 
        voice_select: 'public/scripts/sound/hotaru_select.mp3',
        voice_attack: 'public/scripts/sound/hotaru_attack.mp3',
        voice_ult: 'public/scripts/sound/hotaru_ult.mp3',
        process: 'ult_randomVertical1Drop'
    }
];
