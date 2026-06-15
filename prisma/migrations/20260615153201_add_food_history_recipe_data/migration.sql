-- AlterTable
ALTER TABLE "FoodRecommendationHistory" ADD COLUMN     "recipeData" TEXT,
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'fridge';

-- CreateIndex
CREATE INDEX "ForumPost_classId_discussionId_createdAt_idx" ON "ForumPost"("classId", "discussionId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QnaQuestion_userId_createdAt_idx" ON "QnaQuestion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QnaVote_answerId_createdAt_idx" ON "QnaVote"("answerId", "createdAt");

-- CreateIndex
CREATE INDEX "SplitBill_userId_createdAt_idx" ON "SplitBill"("userId", "createdAt");
