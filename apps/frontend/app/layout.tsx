import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YouTubeチャンネル分析ダッシュボード',
  description: '自チャンネルの動画パフォーマンスを可視化する個人開発ダッシュボード',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
