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
- 一覧テーブルに列追加：タグ / 累計獲得登録者数
- 「維持率サマリ」列は一覧テーブルに追加しない（2026-07-17付けで仕様変更）。単一動画・単一時点の`audienceWatchRatio`や`relativeRetentionPerformance`を1値だけ切り出しても比較文脈がなく読み取りにくいため、維持率の確認は`/retention`ビュー（複数動画の曲線比較）に一本化する
- 累計獲得登録者数は時系列グラフ化はせず、動画単位の合計値を一覧テーブルの列としてのみ表示する（2026-07-15付けで仕様変更、初版では`/subscribers`時系列ビューを予定していたが取りやめ）
- 既存の視聴回数グラフ・集計サマリは変更しない

**画面: 維持率比較ビュー（`/retention`）**
- 動画を複数選択（チェックボックス）→ `elapsedVideoTimeRatio`を横軸、`audienceWatchRatio`/`relativeRetentionPerformance`を縦軸に、選択動画分の曲線を重ね書き
- YouTube Studioでは提供されない「複数動画の維持率を横並び比較する」ことを主目的とする

**OAuth認可フロー（NestJS実装）**

| Method | Path | 説明 |
|---|---|---|
| GET | `/oauth/youtube/authorize` | Googleの認可URLへリダイレクト。スコープは`youtube.readonly`（タグ取得用）と`yt-analytics.readonly`（Analytics API用） |
| GET | `/oauth/youtube/callback` | 認可コードをアクセストークン/リフレッシュトークンに交換。保存前に取得トークンで`channels.list?mine=true`を呼び、返ってきたチャンネルIDが環境変数`YOUTUBE_CHANNEL_ID`と一致するか検証する（不一致なら保存を拒否）。トークンはAES-256-GCMで暗号化してDBへ保存 |

**データ同期・取得API**

| Method | Path | 説明 |
|---|---|---|
| POST | `/api/videos/:id/retention/sync` | 対象動画1本の維持率レポート（`elapsedVideoTimeRatio`ディメンション、100点）をAnalytics APIから取得し、最新値のみDBへupsert |
| POST | `/api/sync/batch/retention` | 全動画を対象に維持率を1本ずつ順次同期するバッチジョブを実行（手動トリガーのみ） |
| GET | `/api/videos/:id/retention` | DBから維持率カーブを返す |
| GET | `/api/retention/compare?videoIds=id1,id2,...` | 複数動画の維持率カーブをまとめて返す |
| POST | `/api/videos/:id/subscribers/sync` | 対象動画1本の累計獲得登録者数（`subscribersGained`、日次ディメンションなしの単一合計値）をAnalytics APIから取得し、`Video.subscribersGained`を上書き |
| POST | `/api/sync/batch/subscribers` | 全動画を対象に登録者増加数を1本ずつ順次同期するバッチジョブを実行（手動トリガーのみ、維持率バッチと同様のレート制御） |
| GET | `/api/videos` | （拡張）タグ・維持率サマリ・累計獲得登録者数を含めて返す |

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
  subscribersGained Int      @default(0)    // 第2段: Analytics APIから取得した動画別の累計獲得登録者数（時系列は持たない）
  lastFetchedAt     DateTime @default(now())
  retentionPoints   RetentionPoint[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

// 第2段: 動画1本につき最大100点（elapsedVideoTimeRatio刻み）
// 履歴は残さず、再同期のたびに同一videoId+elapsedVideoTimeRatioの行をupsertで上書きする
// （設計変更：初版では fetchedAt を含めた複合ユニークで履歴を残す設計だったが、
//  維持率は公開から数週間でほぼ変動しないため実装単純化を優先し変更）
model RetentionPoint {
  id                          String  @id @default(cuid())
  videoId                     String
  video                       Video   @relation(fields: [videoId], references: [id])
  elapsedVideoTimeRatio       Float
  audienceWatchRatio          Float
  relativeRetentionPerformance Float
  fetchedAt                   DateTime @updatedAt

  @@unique([videoId, elapsedVideoTimeRatio])
}
```

**設計メモ**
- `Video`本体には「最新の統計値」を持たせ、第1段の一覧APIはこのテーブルをそのまま返す。過去時点の視聴回数推移が将来必要になった場合は`VideoStatsSnapshot`テーブルを別途追加できる（第1段では不要と判断し省略）。
- `RetentionPoint`は履歴を残さず、`videoId`+`elapsedVideoTimeRatio`の一意制約でupsertし常に最新値のみ保持する（`fetchedAt`は最終同期日時として`@updatedAt`で自動更新）。
- `tags`はPrismaの`String[]`（Postgres配列型）で表現。
- `subscribersGained`は初版では`SubscriberSnapshot`（動画別・日次）テーブルを予定していたが、時系列表示をやめ動画単位の合計値のみ一覧テーブルに表示する仕様に変更したため（2026-07-15）、`Video`本体のInt列に簡素化した。

---

## 7. 非機能要件

### セキュリティ
- APIキー・OAuth Client Secret・トークンはすべて環境変数管理。フロントエンドのバンドル・レスポンスJSON・エラーメッセージに含めない。
- OAuthのAccess/Refresh Tokenはアプリケーション層でAES-256-GCM暗号化してからDBに保存する。暗号鍵は環境変数（`TOKEN_ENCRYPTION_KEY`）で管理し、DBやバックアップが漏洩してもトークン単体では復号できない状態にする。
- CORSはフロントエンドのオリジンのみ許可。
- 本番環境ではHTTPS必須（OAuthリダイレクトURIの要件でもある）。

### クォータ管理
- YouTube Data API既定クォータ：10,000ユニット/日を前提に、`part`パラメータは画面表示に必要な最小限のみ指定する。
- `videos.list`は動画IDを50件単位でまとめてリクエストし、呼び出し回数を最小化する。
- DBキャッシュにTTL（`VIDEOS_CACHE_TTL_MINUTES`環境変数、デフォルト60分）を設け、TTL内はYouTube APIを再呼び出ししない。
- 維持率バッチ（1本ずつしか取得できない）は動画数に比例してユニットを消費するため、実行トリガーは手動ボタン（`POST /api/sync/batch/retention`）のみとし、Cron等の自動実行は行わない。リクエスト間には待機（数百ms〜1秒程度）を入れてレート制御する。
- APIエラー（403 quotaExceeded等）はキャッチし、画面には「最終取得日時」付きでキャッシュデータを表示するフォールバックを行う。

### パフォーマンス・キャッシュ
- 画面表示は常にDB（Postgres）からのレスポンスを優先し、外部API呼び出しは同期処理（`sync`系エンドポイント）でのみ発生させる。
- フロントエンドはSWRでAPIレスポンスをクライアントキャッシュする。
- 維持率バッチ処理は手動トリガーで実行し、進捗はサーバーログに出力する（専用の進捗確認APIは第2段では設けない）。

---

## 8. 段階実装の順序とDefinition of Done

### 第1段 DoD
- [x] `channels.list → playlistItems.list → videos.list`のフローが実装され、全動画（ページング含む）を取得できる
- [x] 動画一覧テーブル（全列ソート可能）・集計サマリ・視聴回数の時系列グラフが表示される
- [x] フロントエンドからYouTube APIキーが一切参照されない（NestJS経由のみ）ことをコードレビューで確認
- [x] 本番環境にデプロイされ、実チャンネルのデータで動作する（フロント: Vercel、バックエンド+DB: Railway）

### 第2段 DoD
- [x] OAuth 2.0認可フロー（authorize→callback→トークン保存）が実装され、リフレッシュトークンでの再認証が動作する
- [x] タグが一覧テーブルに表示される
- [x] 全動画の維持率データがバッチでDBに蓄積され、`/retention`ビューで複数動画の比較曲線が表示される
- [x] 動画別の累計獲得登録者数（`subscribersGained`合計値）が一覧テーブルに表示される
- [x] 第1段のAPI・テーブル構造を破壊的変更なしに拡張できたことを確認（マイグレーションのみで対応）

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

1. **CSV取り込み機能の実装時期**：退路として構造は考慮するとの要件だが、実際にいつ実装するか（第1段/第2段/対応しない）は未確定。
2. **アプリ自体へのアクセス制御**：YouTube側のOAuthとは別に、ダッシュボードアプリ自体にログイン認証（Basic認証等）を設けるか、単純にURLを非公開にするだけかは未確定。公開URLで運用する場合、`/oauth/youtube/authorize`等のOAuth関連エンドポイントも第三者がアクセスできてしまう点に留意（第三者がなりすまし目的で叩いても、コールバック時に取得チャンネルIDが`YOUTUBE_CHANNEL_ID`と一致するか検証し一致しなければ保存を拒否する設計とするが、根本的なアクセス制御は別途必要）。

### 決定済み事項（初版の要確認事項から確定）
- デプロイ先：フロントエンドはVercel、バックエンド＋PostgreSQLはRailway
- キャッシュTTL：60分（`VIDEOS_CACHE_TTL_MINUTES`環境変数、デフォルト値）
- グラフ描画ライブラリ：Recharts
- クライアントキャッシュライブラリ：SWR
- ディレクトリ構成：pnpm workspacesモノレポ（`apps/backend` + `apps/frontend`）、パッケージマネージャはpnpm
- OAuthトークンの暗号化方式：アプリケーション層でAES-256-GCM（第7章参照）
- 維持率・登録者数バッチの実行トリガー：手動ボタンのみ（Cron等の自動実行は行わない）
- 維持率データ（RetentionPoint）の保存方式：履歴を残さず最新値のみ上書き保存（第6章参照。初版の設計から変更）
- 登録者増加数の表示方式：`/subscribers`時系列ビューは廃止し、動画単位の累計獲得登録者数（合計値）をダッシュボードトップの一覧テーブル列として表示する（2026-07-15、初版から変更。第6章・5.2節参照）
- 一覧テーブルの「維持率サマリ」列：追加しない。維持率確認は`/retention`ビューに一本化する（2026-07-17、初版から変更。5.2節参照）
- テストの範囲（2026-07-20決定）：バックエンドは単体テスト（Jest、外部依存はモック）と結合テスト（実PostgreSQLテストDB使用、YouTube API/OAuth等の外部HTTPはnockでモック）の両方を実装する。フロントエンドは単体テスト（Jest + React Testing Library）・結合テスト（ページ単位、fetchをモック）に加えE2Eテスト（Playwright、バックエンドAPIはroute傍受でモック）まで実装する。CIでの自動実行は本項の対象外（別途検討）。
