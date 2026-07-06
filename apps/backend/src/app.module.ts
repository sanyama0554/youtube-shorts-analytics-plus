import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { PrismaModule } from './prisma/prisma.module';
import { VideosModule } from './videos/videos.module';

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
      }),
    }),
    PrismaModule,
    VideosModule,
  ],
})
export class AppModule {}
