import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenEncryptionService } from '../src/oauth/token-encryption.service';

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

// seed用にOAuthTokenを暗号化する。setup-env.tsで固定したTOKEN_ENCRYPTION_KEYと同じ鍵で
// TokenEncryptionServiceを直接使い、本番の暗号化ロジックとの乖離を防ぐ。
export function getTestTokenEncryption(app: INestApplication): TokenEncryptionService {
  return app.get(TokenEncryptionService);
}
