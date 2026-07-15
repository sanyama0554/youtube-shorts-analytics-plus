import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { PrismaModule } from './prisma/prisma.module';
import { VideosModule } from './videos/videos.module';
import { OAuthModule } from './oauth/oauth.module';
import { RetentionModule } from './retention/retention.module';
import { SubscribersModule } from './subscribers/subscribers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        YOUTUBE_API_KEY: Joi.string().required(),
        YOUTUBE_CHANNEL_ID: Joi.string().required(),
        PORT: Joi.number().default(4000),
        CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
        VIDEOS_CACHE_TTL_MINUTES: Joi.number().default(60),
        GOOGLE_OAUTH_CLIENT_ID: Joi.string().required(),
        GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_OAUTH_REDIRECT_URI: Joi.string().uri().required(),
        TOKEN_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
      }),
    }),
    PrismaModule,
    VideosModule,
    OAuthModule,
    RetentionModule,
    SubscribersModule,
  ],
})
export class AppModule {}
