-- DropIndex
DROP INDEX "RetentionPoint_videoId_elapsedVideoTimeRatio_fetchedAt_key";

-- AlterTable
ALTER TABLE "RetentionPoint" ALTER COLUMN "fetchedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPoint_videoId_elapsedVideoTimeRatio_key" ON "RetentionPoint"("videoId", "elapsedVideoTimeRatio");
