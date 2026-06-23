-- DropIndex
DROP INDEX "AiJob_userId_jobType_createdAt_idx";

-- DropIndex
DROP INDEX "ForumPost_classId_discussionId_createdAt_idx";

-- DropIndex
DROP INDEX "Notification_userId_createdAt_idx";

-- DropIndex
DROP INDEX "QnaQuestion_userId_createdAt_idx";

-- DropIndex
DROP INDEX "QnaVote_answerId_createdAt_idx";

-- DropIndex
DROP INDEX "SplitBill_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "BawelSetting" ADD COLUMN     "financialDna" TEXT,
ADD COLUMN     "interactionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastInteraction" TIMESTAMP(3),
ADD COLUMN     "memory" TEXT,
ADD COLUMN     "personalityStage" TEXT NOT NULL DEFAULT 'NEWBIE';

-- AlterTable
ALTER TABLE "FoodRecommendationHistory" ALTER COLUMN "sourceType" DROP NOT NULL,
ALTER COLUMN "sourceType" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "QnaBookmark_userId_idx" ON "QnaBookmark"("userId");

-- CreateIndex
CREATE INDEX "QnaQuestionVote_questionId_idx" ON "QnaQuestionVote"("questionId");
