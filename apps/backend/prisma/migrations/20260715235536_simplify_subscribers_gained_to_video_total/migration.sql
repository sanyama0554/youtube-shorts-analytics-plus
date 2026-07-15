-- DropForeignKey
ALTER TABLE "SubscriberSnapshot" DROP CONSTRAINT "SubscriberSnapshot_videoId_fkey";

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "subscribersGained" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "SubscriberSnapshot";
