// 結合テスト専用の環境変数。dotenvは既存のprocess.envを上書きしないため、
// AppModuleがロードされる前にここで設定しておけば.env(開発用)の値を汚さない。
// TOKEN_ENCRYPTION_KEYはテスト用の固定ダミー値(実運用の鍵とは無関係)。
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/youtube_shorts_analytics_test';
process.env.YOUTUBE_API_KEY = 'test-youtube-api-key';
process.env.YOUTUBE_CHANNEL_ID = 'UCtestChannelId000000';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:4000/oauth/youtube/callback';
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.VIDEOS_CACHE_TTL_MINUTES = '60';
process.env.PORT = '4001';
