-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uploadsPlaylistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "privacyStatus" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewCount" INTEGER NOT NULL,
    "likeCount" INTEGER NOT NULL,
    "commentCount" INTEGER NOT NULL,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPoint" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "elapsedVideoTimeRatio" DOUBLE PRECISION NOT NULL,
    "audienceWatchRatio" DOUBLE PRECISION NOT NULL,
    "relativeRetentionPerformance" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberSnapshot" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "subscribersGained" INTEGER NOT NULL,

    CONSTRAINT "SubscriberSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_youtubeChannelId_key" ON "Channel"("youtubeChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_channelId_key" ON "OAuthToken"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_youtubeVideoId_key" ON "Video"("youtubeVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPoint_videoId_elapsedVideoTimeRatio_fetchedAt_key" ON "RetentionPoint"("videoId", "elapsedVideoTimeRatio", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriberSnapshot_videoId_date_key" ON "SubscriberSnapshot"("videoId", "date");

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPoint" ADD CONSTRAINT "RetentionPoint_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberSnapshot" ADD CONSTRAINT "SubscriberSnapshot_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
