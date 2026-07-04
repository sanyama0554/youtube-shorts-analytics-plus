# CLAUDE.md

Claude Codeがこのリポジトリで作業する際に必ず従うルール。

## プロジェクト概要

- 自分が管理するYouTubeチャンネルのデータを可視化するダッシュボード。ポートフォリオ用の個人開発。
- 詳細な要件は [docs/requirements.md](docs/requirements.md) を正典とする。実装判断で迷ったら、まずこのファイルを確認する。
- 要件定義書と矛盾する実装を独断で進めない。矛盾を見つけたら作業を止めてユーザーに報告し、確認を取る。

## 現在のリポジトリ状態

- 現時点でコードのスケルトンは未作成（`docs/requirements.md`のみ存在）。
- ディレクトリ構成（モノレポ or front/back分離）は要件定義書に明記がない。着手前にユーザーに提案し、承認を得てから scaffold する。
- スケルトンを作成したら、本ファイルの「よく使うコマンド」セクションを実際の`package.json`の`scripts`に合わせて更新する。

## 技術スタック

- フロントエンド：Next.js（App Router, TypeScript）
- バックエンド：NestJS（TypeScript）
- DB：PostgreSQL（ローカルはDocker Compose）
- ORM：Prisma
- 外部API：YouTube Data API v3 / YouTube Analytics API

## アーキテクチャの絶対ルール（違反禁止）

- フロントエンドからYouTube APIを直接呼ばない。必ずNestJSバックエンド経由にする。
- APIキー、OAuthトークン、OAuthクライアントシークレットは、サーバー側の環境変数（`.env`、`.gitignore`済み）でのみ扱う。フロントのコードやリポジトリに書かない。
- 秘密情報（APIキー・トークン・シークレット）をコミットしない、出力しない、ログに残さない、要約や引用でも表示しない。

## 実装の進め方（段階）

- 第1段（OAuth不要、APIキーのみ）を先に完成させ、デプロイまで通す。第1段が動くまで第2段（OAuth）に着手しない。
- 各段のDefinition of Doneは`docs/requirements.md`の該当セクションに従う。
- 第1段のUI・データ構造は、第2段で列やエンティティを「追加」できる形にする。作り直しを避ける。

## YouTube API利用上の注意

- Data API v3の`part`指定は必要最小限にする（`snippet`,`statistics`,`status`など使う分だけ）。
- 既定クォータは10,000ユニット/日。無駄な呼び出しを避け、取得結果はキャッシュ/DBを活用する。
- 第2段の視聴維持率（audience retention）は動画1本ずつしか取得できない。全動画はバッチで個別取得しPostgreSQLに蓄積し、画面表示はDBから返す。
- タグ（`snippet.tags`）は所有者OAuth認証時のみ取得可能。APIキーのみの第1段では扱わない。

## コーディング規約

- TypeScriptは`strict`を有効にする。`any`禁止（避けられない場合は理由をコメントで明記）。
- NestJSは標準的なモジュール/コントローラ/サービス構成とし、DIを使う。
- 環境変数はスキーマバリデーション（例：`@nestjs/config`のvalidation、または`zod`）で検証する。
- フロントエンドはエラーハンドリングとローディング状態を必ず扱う。

## よく使うコマンド

> スケルトン未作成のため暫定。実装時にディレクトリ構成と`package.json`の`scripts`を確定し、このセクションを実態に合わせて書き換える。

- 開発サーバー起動（front/back）
- ビルド
- 型チェック（`tsc --noEmit`）
- lint
- テスト
- Prisma：`prisma generate` / `prisma migrate dev` / `prisma studio`
- Docker Compose：ローカルPostgreSQL起動（`docker compose up -d`）

## やってはいけないこと

- フロントエンドから外部API（YouTube API等）を直叩きする。
- 秘密情報をハードコードする、出力する、ログに残す。
- 第1段を飛ばして第2段（OAuth関連）に着手する。
- `docs/requirements.md`と矛盾する実装を、確認を取らずに進める。
