# YouTubeチャンネル分析ダッシュボード 要件定義書

## 1. プロジェクト概要と目的

| 項目 | 内容 |
|---|---|
| プロジェクト名（仮） | YouTubeチャンネル分析ダッシュボード |
| 対象 | 開発者本人が運用するYouTubeチャンネル（RPGキャラ解説ショート）1チャンネル |
| 目的（プロダクト） | 自チャンネルの動画パフォーマンスをデータで可視化し、コンテンツ改善の判断材料を得る |
| 目的（キャリア） | 就職活動用ポートフォリオ。特に「外部API連携」「OAuth 2.0実装」「データ永続化・キャッシュ設計」というバックエンド実務力の証明を主眼に置く |
| 想定利用者 | 開発者本人のみ（不特定多数への公開は想定しない） |

フロントエンド経験は十分にあるため、本プロジェクトの評価軸はバックエンド設計の妥当性（API設計、認可フロー、クォータ制約下でのキャッシュ戦略）に置く。

---

## 2. スコープ

### 第1段（MVP）
- APIキーのみでYouTube Data API v3から公開情報を取得・表示する
- OAuth・DB蓄積は必須としない（キャッシュ用途でのDB利用は可）
- 「デプロイして動く」状態を最優先ゴールとする

### 第2段
- OAuth 2.0認可を実装し、所有者権限が必要な情報（タグ、Analytics API系指標）を取得する
- 維持率・登録者増加数はPostgreSQLに蓄積し、画面はDBキャッシュから返す
- 第1段の一覧テーブルを**作り直さず**、列追加・API拡張で対応する

### スコープ外（明示的に対象外）
- 複数チャンネル対応（マルチテナント化）
- 他ユーザーへのアプリ公開・アカウント登録機能
- コメント内容の分析（コメント数のみ取得、本文は扱わない）
- 動画のアップロード・編集などYouTube側への書き込み操作

---

## 3. 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js（App Router）, TypeScript |
| バックエンド | NestJS, TypeScript |
| DB | PostgreSQL（ローカル: Docker Compose） |
| ORM | Prisma |
| 外部API | YouTube Data API v3（第1・2段）, YouTube Analytics API（第2段） |
| 認可 | OAuth 2.0（Google, 第2段） |

---

## 4. システム構成

```
┌─────────────────┐        ┌──────────────────────────┐        ┌─────────────────────────┐
│   Next.js        │  HTTP  │   NestJS (Backend)        │  HTTPS │  YouTube Data API v3     │
│   (Frontend)      │ ─────▶ │   - REST Controllers      │ ─────▶ │  YouTube Analytics API   │
│                   │ ◀───── │   - Service層              │ ◀───── │  OAuth 2.0 Authorization │
│  ブラウザで実行     │  JSON  │   - Prisma Client          │        │  Server                  │
└─────────────────┘        │   - 環境変数(.env)         │        └─────────────────────────┘
                            │     ・APIキー               │
                            │     ・OAuth Client Secret   │
                            │     ・OAuth Access/Refresh  │
                            │       Token（DB保存）        │
                            └───────────┬──────────────┘
                                        │ SQL (Prisma)
                                        ▼
                            ┌──────────────────────────┐
                            │  PostgreSQL                │
                            │  （動画・統計・維持率・      │
                            │    登録者時系列を永続化）    │
                            └──────────────────────────┘
```

**設計原則**
- ブラウザは常にNestJSのAPIエンドポイントのみを呼び出す。YouTube API・OAuth認可サーバーへの直接リクエストは行わない。
- APIキー、OAuth Client ID/Secret、Access/Refresh Tokenはすべてサーバー側（NestJSプロセスの環境変数、およびDBの保護されたテーブル）にのみ存在し、フロントエンドのレスポンス・ソースマップ・Gitリポジトリに含めない。
- `.env`はGit管理外（`.gitignore`登録必須）。`.env.example`のみコミットしキー名の一覧を共有する。

---

## 5. 機能要件

### 5.1 第1段（MVP）

**画面: ダッシュボードトップ（`/`）**
- 動画一覧テーブル：タイトル / 公開設定 / 公開日時 / 視聴回数 / いいね数 / コメント数（全列ソート可能）
- 集計サマリカード：総動画数 / 総視聴回数 / 平均いいね率（いいね数÷視聴回数の平均）/ 平均コメント率（コメント数÷視聴回数の平均）
- 時系列グラフ：横軸=公開日時、縦軸=視聴回数（散布図または折れ線、動画1本＝1点）

**データ取得フロー**
1. `channels.list`（`part=contentDetails`）で uploads プレイリストID取得
2. `playlistItems.list`（`part=contentDetails`）を`pageToken`でページングし、全動画IDを列挙
3. 動画IDを50件ずつまとめ、`videos.list`（`part=snippet,statistics,status`）で一括取得

**バックエンドAPIエンドポイント**

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/videos` | 動画一覧を返す。DBキャッシュが有効期限内ならDBから、期限切れならYouTube APIを叩いて更新後に返す |
| POST | `/api/videos/sync` | 手動で強制的にYouTube APIから再取得しDBを更新する |
| GET | `/api/videos/summary` | 集計サマリを返す（DB上の最新データから算出） |

### 5.2 第2段

**画面: ダッシュボードトップ（拡張）**
- 一覧テーブルに列追加：タグ / 維持率サマリ（例: 30%到達時点の相対維持率）/ 累計獲得登録者数
- 既存の視聴回数グラフ・集計サマリは変更しない

**画面: 維持率比較ビュー（`/retention`）**
- 動画を複数選択（チェックボックス）→ `elapsedVideoTimeRatio`を横軸、`audienceWatchRatio`/`relativeRetentionPerformance`を縦軸に、選択動画分の曲線を重ね書き
- YouTube Studioでは提供されない「複数動画の維持率を横並び比較する」ことを主目的とする

**画面: 登録者数時系列ビュー（`/subscribers`）**
- 動画別 or 全体の`subscribersGained`を時系列（日次）で表示

**OAuth認可フロー（NestJS実装）**

| Method | Path | 説明 |
|---|---|---|
| GET | `/oauth/youtube/authorize` | Googleの認可URLへリダイレクト（`https://www.googleapis.com/auth/yt-analytics.readonly` 等のスコープ要求） |
| GET | `/oauth/youtube/callback` | 認可コードをアクセストークン/リフレッシュトークンに交換し、DBへ保存 |

**データ同期・取得API**

| Method | Path | 説明 |
|---|---|---|
| POST | `/api/videos/:id/retention/sync` | 対象動画1本の維持率レポート（`elapsedVideoTimeRatio`ディメンション、100点）をAnalytics APIから取得しDB保存 |
| POST | `/api/sync/batch/retention` | 全動画を対象に維持率を1本ずつ順次同期するバッチジョブを実行（手動トリガー or Cron） |
| GET | `/api/videos/:id/retention` | DBから維持率カーブを返す |
| GET | `/api/retention/compare?videoIds=id1,id2,...` | 複数動画の維持率カーブをまとめて返す |
| GET | `/api/videos/:id/subscribers-gained` | 動画別の`subscribersGained`時系列をDBから返す |
| GET | `/api/videos` | （拡張）タグ・維持率サマリ・登録者増加数を含めて返す |

> 補足：タグ（`snippet.tags`）は所有者OAuth認証済みの`videos.list`呼び出し時のみ取得可能なため、第2段で`videos.list`をOAuthトークン付きに切り替える。

---

## 6. データモデル（Prismaスキーマ方針）

第2段の蓄積を見据え、第1段の時点でこのモデルに沿って実装する（後からの作り直しを避ける）。

```prisma
model Channel {
  id                 String   @id @default(cuid())
  youtubeChannelId   String   @unique
  title              String
  uploadsPlaylistId  String
  oauthToken         OAuthToken?
  videos             Video[]
  createdAt          DateTime @default(now())
}

model OAuthToken {
  id             String   @id @default(cuid())
  channelId      String   @unique
  channel        Channel  @relation(fields: [channelId], references: [id])
  accessToken    String   // 暗号化して保存（要確認事項参照）
  refreshToken   String   // 暗号化して保存
  scope          String
  expiryDate     DateTime
  updatedAt      DateTime @updatedAt
}

model Video {
  id                String   @id @default(cuid())
  youtubeVideoId    String   @unique
  channelId         String
  channel           Channel  @relation(fields: [channelId], references: [id])
  title             String
  publishedAt       DateTime
  privacyStatus     String
  tags              String[] @default([])   // 第2段でOAuth経由取得、第1段は空配列
  viewCount         Int
  likeCount         Int
  commentCount      Int
  lastFetchedAt     DateTime @default(now())
  retentionPoints   RetentionPoint[]
  subscriberPoints  SubscriberSnapshot[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

// 第2段: 動画1本につき最大100点（elapsedVideoTimeRatio刻み）
model RetentionPoint {
  id                          String  @id @default(cuid())
  videoId                     String
  video                       Video   @relation(fields: [videoId], references: [id])
  elapsedVideoTimeRatio       Float
  audienceWatchRatio          Float
  relativeRetentionPerformance Float
  fetchedAt                   DateTime @default(now())

  @@unique([videoId, elapsedVideoTimeRatio, fetchedAt])
}

// 第2段: 動画別・日次のsubscribersGained
model SubscriberSnapshot {
  id                String   @id @default(cuid())
  videoId           String
  video             Video    @relation(fields: [videoId], references: [id])
  date              DateTime
  subscribersGained Int

  @@unique([videoId, date])
}
```

**設計メモ**
- `Video`本体には「最新の統計値」を持たせ、第1段の一覧APIはこのテーブルをそのまま返す。過去時点の視聴回数推移が将来必要になった場合は`VideoStatsSnapshot`テーブルを別途追加できる（第1段では不要と判断し省略）。
- `RetentionPoint`は再同期のたびに`fetchedAt`で新しい行を追加する設計とし、履歴を残す（同一`elapsedVideoTimeRatio`の最新値のみ画面表示に使う）。
- `tags`はPrismaの`String[]`（Postgres配列型）で表現。

---

## 7. 非機能要件

### セキュリティ
- APIキー・OAuth Client Secret・トークンはすべて環境変数管理。フロントエンドのバンドル・レスポンスJSON・エラーメッセージに含めない。
- OAuthのAccess/Refresh TokenはDBに平文で保存しない（アプリケーション層での暗号化、または暗号化拡張の利用を検討／要確認事項）。
- CORSはフロントエンドのオリジンのみ許可。
- 本番環境ではHTTPS必須（OAuthリダイレクトURIの要件でもある）。

### クォータ管理
- YouTube Data API既定クォータ：10,000ユニット/日を前提に、`part`パラメータは画面表示に必要な最小限のみ指定する。
- `videos.list`は動画IDを50件単位でまとめてリクエストし、呼び出し回数を最小化する。
- DBキャッシュにTTL（例：1時間、要確認事項）を設け、TTL内はYouTube APIを再呼び出ししない。
- 維持率バッチ（1本ずつしか取得できない）は動画数に比例してユニットを消費するため、全件同期は手動トリガー＋実行間隔の制御（連続リクエスト間にウェイトを入れる等）を行う。
- APIエラー（403 quotaExceeded等）はキャッチし、画面には「最終取得日時」付きでキャッシュデータを表示するフォールバックを行う。

### パフォーマンス・キャッシュ
- 画面表示は常にDB（Postgres）からのレスポンスを優先し、外部API呼び出しは同期処理（`sync`系エンドポイント）でのみ発生させる。
- フロントエンドはSWR/React Query等でAPIレスポンスをクライアントキャッシュする（ライブラリ選定は要確認事項）。
- 維持率バッチ処理は同期的にリクエストを待たず、非同期ジョブとして扱う（実装方式は要確認事項）。

---

## 8. 段階実装の順序とDefinition of Done

### 第1段 DoD
- [ ] `channels.list → playlistItems.list → videos.list`のフローが実装され、全動画（ページング含む）を取得できる
- [ ] 動画一覧テーブル（全列ソート可能）・集計サマリ・視聴回数の時系列グラフが表示される
- [ ] フロントエンドからYouTube APIキーが一切参照されない（NestJS経由のみ）ことをコードレビューで確認
- [ ] 本番環境にデプロイされ、実チャンネルのデータで動作する

### 第2段 DoD
- [ ] OAuth 2.0認可フロー（authorize→callback→トークン保存）が実装され、リフレッシュトークンでの再認証が動作する
- [ ] タグが一覧テーブルに表示される
- [ ] 全動画の維持率データがバッチでDBに蓄積され、`/retention`ビューで複数動画の比較曲線が表示される
- [ ] `subscribersGained`の時系列が表示される
- [ ] 第1段のAPI・テーブル構造を破壊的変更なしに拡張できたことを確認（マイグレーションのみで対応）

---

## 9. 想定リスクと対策

| リスク | 内容 | 対策 |
|---|---|---|
| OAuth実装の時間リスク | 認可フロー・トークンリフレッシュ・スコープ設定の学習コストが高く、第2段が長期化する可能性 | 第1段を独立してデプロイ可能な状態で完成させ、ポートフォリオとして先に提示できるようにする。第2段は別スプリントとして時間区切りで着手 |
| 維持率が動画1本ずつしか取得できない制約 | 動画数が多いほどバッチ処理時間・クォータ消費が増える | DB蓄積による再取得不要化、バッチ間にディレイを入れたレート制御、実行状況を確認できるログ／進捗表示を用意する |
| クォータ枯渇（10,000ユニット/日） | 開発中の試行錯誤やバッチ再実行でクォータを使い切り、開発が止まる | DBキャッシュを開発時から使う、`part`最小化、YouTube StudioのCSVエクスポート取り込みを退路として設計だけ確保（実装は必要になった時点） |
| リフレッシュトークン失効・スコープ変更 | Googleアカウント側の設定変更やトークン失効でAnalytics APIが呼べなくなる | エラー時に再認可を促すUI導線を用意し、失敗時は前回DBキャッシュを表示し続ける |
| 単独開発によるレビュー不在 | セキュリティ上の見落とし（シークレット露出等）に気づきにくい | `.env`のGit除外・CIでのシークレットスキャン等、機械的なチェックを導入する |

---

## 10. 要確認事項

要件確定情報からは判断できず、推測で埋めていない項目。実装着手前に決定が必要。

1. **デプロイ先**：フロントエンド（Vercel想定？）・バックエンド（Railway/Render/Fly.io等？）・本番PostgreSQL（マネージドDB？）の具体的なホスティング先は未確定。
2. **OAuthトークンの暗号化方式**：DB保存時にアプリケーション層で暗号化するか、DB自体の暗号化に委ねるか、使用ライブラリ（例：Node標準`crypto`）は未確定。
3. **キャッシュTTLの具体値**：動画一覧・統計情報の「何時間で再取得するか」の具体的な数値は未確定。
4. **バッチ処理の実行トリガー**：維持率・登録者数のバッチ同期を「手動ボタン」のみとするか、Cron（NestJSの`@nestjs/schedule`等）で定期実行するかは未確定。
5. **CSV取り込み機能の実装時期**：退路として構造は考慮するとの要件だが、実際にいつ実装するか（第1段/第2段/対応しない）は未確定。
6. **グラフ描画ライブラリ**：Recharts / Chart.js / visx等、フロントエンドのグラフ実装ライブラリは未指定。
7. **アプリ自体へのアクセス制御**：YouTube側のOAuthとは別に、ダッシュボードアプリ自体にログイン認証（Basic認証等）を設けるか、単純にURLを非公開にするだけかは未確定。
8. **フロントエンド／バックエンドのクライアントキャッシュライブラリ**：SWRかReact Queryか、あるいは使用しないかは未確定。
9. **テストの範囲**：ユニットテスト／E2Eテストをどこまで実装するか（ポートフォリオとしてのアピール度合いにも関わる）は未確定。
