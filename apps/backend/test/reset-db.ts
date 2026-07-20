import { PrismaClient } from '@prisma/client';

// 各結合テストの前にテーブルを空にし、テスト間でデータが漏れないようにする。
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.retentionPoint.deleteMany(),
    prisma.oAuthToken.deleteMany(),
    prisma.video.deleteMany(),
    prisma.channel.deleteMany(),
  ]);
}
