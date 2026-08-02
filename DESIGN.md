# Connect10 を genshin-bakatare01 に統合する計画メモ

まだ実装フェーズではなく、うこ氏との壁打ちで合意した設計方針の書き出し。
実装は「あとで」（別セッション、または後日）行う想定。これを読む別セッションのCCは、
ここに書かれた前提・決定事項を再度ゼロから議論し直さず、6章の「未着手の作業」から進めてよい。

---

## 1. 背景

`10_connect`（通称「コネバト」、原神/スタレキャラのコネクトフォー対戦ゲーム）は現在、
独立したFirebaseプロジェクト(`connect-10-ca73c`)を使い、プレイヤー識別にFirebase Anonymous Auth
(`signInAnonymously`)のUIDをそのまま使っている。

一方、`14_GenshinOmikuji`は`genshin-bakatare01`プロジェクトで、`localStorage`の
`genshinOmikuji_userId`という自前生成IDをキーにFirestoreへ保存する方式（`24_AccountCenter`が
このIDの登録・機種変引き継ぎを管理するサイトとして既に稼働中）。

うこ氏サイト群全体でアカウントを一元管理したい構想があり、「まだリリースしていない`10_connect`を、
今のうちに`genshin-bakatare01`＋共通ID方式に合わせておきたい」という話になった。

---

## 2. 合意した方針（重要: セキュリティ上の理由で識別子は使い分ける）

### 2.1 対戦のセキュリティに関わる識別子は変更しない

`10_connect`の`firestore.rules`（`rooms`・`users`コレクション）は、対戦相手のなりすまし・
レート改ざん防止のために**`request.auth.uid`（Firebase Anonymous Authの本物のUID）**を前提に
厳格に組まれている（例: `player1_ID == request.auth.uid`、レート変化量の上限チェック等）。

これをomikuji方式の「クライアントが自己申告するだけのローカル生成ID」に置き換えると、
対戦相手のUIDを騙ってレート・勝敗を改ざんできてしまう。**そのため、`rooms`/`users`の
プレイヤー識別子は今まで通りFirebase Anonymous Authのままにする（変更しない）。**

### 2.2 クロスサイト連携用に `sharedUserId` フィールドを追加する

`users/{authUid}` ドキュメントに新しいフィールド `sharedUserId` を追加し、そこに
`localStorage["genshinOmikuji_userId"]` の値を保存する。これにより対戦の安全性を一切損なわずに
「同じ人物のomikuji側アカウントと紐づける」ことができる。

- **omikujiに先に入っていた場合**: `localStorage`に既に`genshinOmikuji_userId`があるので、
  `10_connect`はそれを読んで`sharedUserId`に保存するだけでよい。
- **`10_connect`に先に入った場合**: `localStorage`にまだ無いので、`10_connect`側で
  **omikujiの`userData.js`の`getUserId()`と全く同じアルゴリズム**でIDを新規生成し、
  同じキー名`genshinOmikuji_userId`で`localStorage`に保存してから`sharedUserId`にも入れる。
  （`uko05.github.io`配下は同一オリジンなので、後でomikujiを開いた時にそのIDがそのまま使われる。
  この「同一オリジンlocalStorage共有」の仕組みは`23_TowerDef/DESIGN.md`で確認済みの前提を流用している）

  ```js
  // 14_GenshinOmikuji/userData.js の getUserId() と同じロジック
  function getSharedUserId() {
    let id = localStorage.getItem('genshinOmikuji_userId');
    if (!id) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = 'u_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('genshinOmikuji_userId', id);
    }
    return id;
  }
  ```

  キー名を`genshinOmikuji_userId`のまま流用するのが重要（`connectUserId`等の別名にしない）。
  それが唯一、omikuji側の既存コード（変更しない前提）と自動的に繋がる方法のため。

### 2.3 コレクション名に接頭辞を付ける

同じFirestoreデータベースを複数サイトで共有する以上、`rooms`や`users`のような汎用的すぎる名前は
将来の衝突・分かりにくさの原因になる。`genshin-bakatare01`で既に使われている命名規則
（`omikujiUsers`, `bakatareCounts`, `checkSheetVotes`, `bunpuzuOdai`）に合わせ、フラットな接頭辞方式に統一する。

| 旧コレクション名 | 新コレクション名 |
|---|---|
| `rooms` | `connectRooms` |
| `users` | `connectUsers` |
| `charaStats` | `connectCharaStats` |
| `waitingPlayers`（現状未使用） | `connectWaitingPlayers` |

Firestoreのサブコレクション化（`apps/connect10/rooms`等）も検討したが、結局どのコード上の
`collection(db, "rooms")`呼び出し箇所も書き換えが必要になる点は同じで、フラット接頭辞の方が
ルールもシンプルなため、既存の命名規則に揃えることにした。

---

## 3. 移行後の firestore.rules（マージ対象・コレクション名のみ変更、ロジックは無変更）

以下はうこ氏が提示した現行`10_connect/firestore.rules`のロジックをそのまま維持し、
コレクション名だけ2.3節の表に沿って書き換えたもの。`24_AccountCenter/firestore.rules`
（`genshin-bakatare01`の現行の統合ルールファイル）に、`omikujiUsers`等の既存ブロックはそのまま残し、
以下を追加でマージする。

```
    match /connectWaitingPlayers/{document=**} {
      allow read, write: if request.auth != null;
    }

    match /connectRooms/{roomId} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
        && request.resource.data.player1_ID == request.auth.uid
        && request.resource.data.player2_ID == null
        && request.resource.data.status == "waiting";

      allow update: if request.auth != null
        && resource.data.status == "waiting"
        && resource.data.player2_ID == null
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(
          ['player2_ID', 'player2_CharaID', 'player2_Name', 'status', 'player2_LastActive']
        )
        && request.resource.data.player2_ID == request.auth.uid
        && request.resource.data.player1_ID == resource.data.player1_ID;

      allow update: if request.auth != null
        && resource.data.status == "waiting"
        && resource.data.player1_ID == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['player1_LastActive']);

      allow update: if request.auth != null
        && request.auth.uid in [resource.data.player1_ID, resource.data.player2_ID]
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'player1_ChargeNow', 'player2_ChargeNow',
          'player1_UltCount', 'player2_UltCount',
          'player1_TimeLimit', 'player2_TimeLimit',
          'player1_TimeoutCount', 'player2_TimeoutCount',
          'player1_LastActive', 'player2_LastActive',
          'red_Win', 'yellow_Win',
          'status', 'turn', 'turnCount', 'changeStone', 'stones', 'startP',
          'winnerUid', 'resultType', 'p1CharaId', 'p2CharaId',
          'bo3Final', 'rated', 'finishedAt',
          'zhongliBlocked', 'zhongliTurnsLeft', 'zhongliCasterColor',
          'durinPending', 'durinCasterColor',
          'cerluaActive', 'cerluaCasterColor',
          'silverwolfMatchWinner'
        ])
        && request.resource.data.player1_ID == resource.data.player1_ID
        && request.resource.data.player2_ID == resource.data.player2_ID
        && request.resource.data.player1_CharaID == resource.data.player1_CharaID
        && request.resource.data.player2_CharaID == resource.data.player2_CharaID
        && request.resource.data.player1_Color == resource.data.player1_Color
        && request.resource.data.player2_Color == resource.data.player2_Color
        && request.resource.data.roomID == resource.data.roomID
        && (!("matchType" in resource.data) || request.resource.data.matchType == resource.data.matchType)
        && request.resource.data.player1_ChargeNow is int && request.resource.data.player1_ChargeNow >= 0 && request.resource.data.player1_ChargeNow <= 200
        && request.resource.data.player2_ChargeNow is int && request.resource.data.player2_ChargeNow >= 0 && request.resource.data.player2_ChargeNow <= 200
        && request.resource.data.player1_TimeLimit is int && request.resource.data.player1_TimeLimit >= 0 && request.resource.data.player1_TimeLimit <= 100
        && request.resource.data.player2_TimeLimit is int && request.resource.data.player2_TimeLimit >= 0 && request.resource.data.player2_TimeLimit <= 100
        && request.resource.data.changeStone is int && request.resource.data.changeStone >= 0 && request.resource.data.changeStone <= 3
        && request.resource.data.turn in ['P1', 'P2']
        && request.resource.data.startP in ['P1', 'P2']
        && request.resource.data.status in ['waiting', 'in_progress', 'leave']
        && request.resource.data.red_Win is int && request.resource.data.red_Win >= resource.data.red_Win && request.resource.data.red_Win <= resource.data.red_Win + 1 && request.resource.data.red_Win <= 3
        && request.resource.data.yellow_Win is int && request.resource.data.yellow_Win >= resource.data.yellow_Win && request.resource.data.yellow_Win <= resource.data.yellow_Win + 1 && request.resource.data.yellow_Win <= 3
        && request.resource.data.turnCount is int && (request.resource.data.turnCount == resource.data.turnCount || request.resource.data.turnCount == resource.data.turnCount + 1 || request.resource.data.turnCount == 1)
        && request.resource.data.player1_UltCount is int && request.resource.data.player1_UltCount >= resource.data.player1_UltCount && request.resource.data.player1_UltCount <= resource.data.player1_UltCount + 1
        && request.resource.data.player2_UltCount is int && request.resource.data.player2_UltCount >= resource.data.player2_UltCount && request.resource.data.player2_UltCount <= resource.data.player2_UltCount + 1
        && request.resource.data.player1_TimeoutCount is int && request.resource.data.player1_TimeoutCount >= resource.data.player1_TimeoutCount && request.resource.data.player1_TimeoutCount <= resource.data.player1_TimeoutCount + 1
        && request.resource.data.player2_TimeoutCount is int && request.resource.data.player2_TimeoutCount >= resource.data.player2_TimeoutCount && request.resource.data.player2_TimeoutCount <= resource.data.player2_TimeoutCount + 1
        && (
          !("bo3Final" in request.resource.data) || request.resource.data.bo3Final != true
          || resource.data.red_Win == 3 || resource.data.yellow_Win == 3
        )
        && (
          !("bo3Final" in resource.data) || resource.data.bo3Final != true
          || (
            request.resource.data.winnerUid == resource.data.winnerUid
            && request.resource.data.resultType == resource.data.resultType
            && request.resource.data.p1CharaId == resource.data.p1CharaId
            && request.resource.data.p2CharaId == resource.data.p2CharaId
            && request.resource.data.bo3Final == resource.data.bo3Final
          )
        )
        && (!("winnerUid" in request.resource.data) || request.resource.data.winnerUid in [resource.data.player1_ID, resource.data.player2_ID])
        && (
          !("rated" in resource.data)
          || resource.data.rated == false
          || resource.data.rated == request.resource.data.rated
        );

      allow delete: if request.auth != null
        && (
          resource.data.player1_ID == request.auth.uid
          || resource.data.player2_ID == request.auth.uid
          || (
            resource.data.status == "waiting"
            && "player1_LastActive" in resource.data
            && request.time > resource.data.player1_LastActive + duration.value(30, 's')
          )
        );
    }

    match /connectUsers/{uid} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(['rating', 'matchCount', 'winCount', 'lastMatchAt', 'achievements', 'achievementCount', 'achStats', 'equippedTitles', 'unlockedHiddenCharas', 'unlockedHiddenCharaCount', 'sharedUserId'])
        && request.resource.data.rating == 1500
        && request.resource.data.matchCount == 0
        && request.resource.data.winCount == 0;

      allow update: if request.auth != null
        && request.resource.data.keys().hasOnly(['rating', 'matchCount', 'winCount', 'lastMatchAt', 'charaWins', 'playerName', 'achievements', 'achievementCount', 'achStats', 'equippedTitles', 'unlockedHiddenCharas', 'unlockedHiddenCharaCount', 'sharedUserId'])
        && request.resource.data.rating is int
        && request.resource.data.rating >= 100
        && request.resource.data.rating <= resource.data.rating + 48
        && request.resource.data.rating >= resource.data.rating - 72
        && request.resource.data.matchCount is int
        && (request.resource.data.matchCount == resource.data.matchCount || request.resource.data.matchCount == resource.data.matchCount + 1)
        && request.resource.data.winCount is int
        && request.resource.data.winCount >= resource.data.winCount
        && request.resource.data.winCount <= resource.data.winCount + 1
        && (!("charaWins" in request.resource.data) || request.resource.data.charaWins is map)
        && (!("playerName" in request.resource.data) || (request.resource.data.playerName is string && request.resource.data.playerName.size() <= 20))
        && (!("achievements" in request.resource.data) || request.resource.data.achievements is list)
        && (!("achievementCount" in request.resource.data) || (request.resource.data.achievementCount is int && request.resource.data.achievementCount >= 0 && request.resource.data.achievementCount <= 200))
        && (!("achStats" in request.resource.data) || request.resource.data.achStats is map)
        && (!("equippedTitles" in request.resource.data) || (request.resource.data.equippedTitles is list && request.resource.data.equippedTitles.size() <= 2))
        && (!("sharedUserId" in request.resource.data) || (request.resource.data.sharedUserId is string && request.resource.data.sharedUserId.size() <= 60));
    }

    match /connectCharaStats/{charaId} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(['pickCount', 'winCount'])
        && request.resource.data.pickCount is int && request.resource.data.pickCount >= 0 && request.resource.data.pickCount <= 2
        && request.resource.data.winCount is int && request.resource.data.winCount >= 0 && request.resource.data.winCount <= 1;

      allow update: if request.auth != null
        && request.resource.data.keys().hasOnly(['pickCount', 'winCount'])
        && request.resource.data.pickCount is int
        && request.resource.data.pickCount >= resource.data.pickCount
        && request.resource.data.pickCount <= resource.data.pickCount + 2
        && request.resource.data.winCount is int
        && request.resource.data.winCount >= resource.data.winCount
        && request.resource.data.winCount <= resource.data.winCount + 1;
    }
```

`sharedUserId`は`create`時のキー制限にも加えてある点に注意（`users`作成時に一緒に書き込む前提のため）。

---

## 4. コード側で必要になる変更（未着手・見積もりレベル）

- `public/scripts/firebaseConfig.js`: `firebaseConfig`オブジェクトを`14_GenshinOmikuji/firebaseConfig.js`
  と同じ`genshin-bakatare01`の値に差し替え
- `getSharedUserId()`相当の関数を追加し、`authReady`確立後（またはユーザーdoc作成/更新時）に
  `connectUsers/{uid}.sharedUserId`へ書き込む処理を追加
- `collection(db, "rooms")` / `doc(db, "rooms", ...)` → `"connectRooms"`、
  `collection(db, "users")` / `doc(db, "users", ...)` → `"connectUsers"`、
  `collection(db, "charaStats")` → `"connectCharaStats"` の一括リネーム。
  現状の grep 結果で該当箇所は以下に分布（概算40箇所以上）:
  - `public/scripts/characterSelect.js`
  - `public/scripts/eloRating.js`
  - `public/scripts/gameLogic.js`（大半がここ）
  - `public/scripts/achievementManager.js`
- `.firebaserc` / `firebase.json` の見直し（Hosting先はこれまで通り`connect-10-ca73c`のままにするか、
  Firestoreだけ`genshin-bakatare01`に向けるか、サイトを丸ごと移すかは要検討 = TBD）

---

## 5. まだ決まっていないこと（TBD）

- Firebase Hostingまで`genshin-bakatare01`側に統合するか、Firestoreの参照先だけ変えて
  Hostingは`connect-10-ca73c`のまま残すか（後者でも技術的には可能。GitHub Pages/Firebase Hosting先と
  Firestoreプロジェクトは独立して選べる）
- `connectUsers`の`achievements`（コネバト側の実績）とomikuji側の実績を、AccountCenterの管理画面で
  今後どう横断表示するか（`sharedUserId`で引ければ可能ではある）
- 移行のタイミング（`10_connect`はまだ未リリースなので、リリース前に一括で変更するのが前提）
- `waitingPlayers`は現状未使用とのことなので、移行時にルールごと削除するか、将来用に残すか

---

## 6. 実施済み（本セッションで完了）

1. ✅ `firebaseConfig.js`を`genshin-bakatare01`向けに差し替え、`getSharedUserId()`を追加
2. ✅ `characterSelect.js`(3)・`eloRating.js`(rooms1/users6/charaStats3)・`gameLogic.js`(33)・
   `achievementManager.js`(users4)のコレクション名を一括リネーム（`node --check`で構文確認済み）
3. ✅ `eloRating.js`に`syncSharedUserId(uid, sharedUserId)`を追加し、`characterSelect.js`と
   `playerInfo.js`の「自分の`ensureUserDoc`呼び出し」の直後だけで呼ぶようにした
   （`ensureUserDoc`は対戦相手のuidに対しても呼ばれる関数なので、そちらでは絶対に呼んでいない）
4. ✅ `24_AccountCenter/firestore.rules`に3章のブロックをマージし、
   `firebase deploy --only firestore:rules --project genshin-bakatare01`でデプロイ済み

## 6.5 追加で発覚した論点: Firebase AuthセッションはApp単位で共有される

`10_connect`が`genshin-bakatare01`＋無名(デフォルト)Appのままだと、同一オリジン(`uko05.github.io`)上で
AccountCenter/omikujiがログイン中の場合、そのログインセッション（ID+パスワードでのAuthユーザー）を
コネバトもそのまま拾ってしまい、匿名認証をスキップしてしまう。これだと「AccountCenterにログインしている
かどうか」でコネバトの`connectUsers`の参照先(uid)が意図せず切り替わり、レート・戦績が急に空になる
ように見えてしまう。

対策として、`10_connect/public/scripts/firebaseConfig.js`は`initializeApp(firebaseConfig, 'connect10')`
と**名前付きApp**にし、匿名認証セッションを他サイトのデフォルトAppのAuthセッションから完全に分離した
（`account-status.js`側は逆に常にデフォルトAppだけを見るよう`getApps().some(a => a.name === '[DEFAULT]')`
で判定するようにした）。これにより、コネバトの識別子は常に安定した匿名UIDのままになる。

## 7. 未着手・要確認

- 実機での動作確認（マッチング・対戦・レート更新が壊れていないか、`connectUsers.sharedUserId`が
  正しく書き込まれるか）はまだ行っていない。`10_connect`には他の未コミットWIPも混在しているため、
  デプロイして実際に動かして確認する必要がある
- `.firebaserc` / `firebase.json`（Hosting）は今回は変更していない。Firestoreの向き先だけ
  `genshin-bakatare01`に変えた状態（5章のTBDの通り、Hosting統合するかは未決定のまま）
- `gameLogic.js`は既にうこ氏の他の未コミット変更が入った状態だったため、今回のリネームもその上に
  重なっている。コミット時は分離できない点に注意
