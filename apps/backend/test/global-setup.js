// 結合テストスイート開始前に一度だけ、テスト専用DBへマイグレーションを適用する。
const { execSync } = require('child_process');

module.exports = async () => {
  execSync('npx prisma migrate deploy', {
    cwd: __dirname + '/..',
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/youtube_shorts_analytics_test',
    },
  });
};
