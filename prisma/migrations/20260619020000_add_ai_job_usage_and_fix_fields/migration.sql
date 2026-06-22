-- AlterTable: Add AI limit fields to PricingPlan
ALTER TABLE "PricingPlan" ADD COLUMN IF NOT EXISTS "aiBriefingLimit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PricingPlan" ADD COLUMN IF NOT EXISTS "aiWeeklyRoastLimit" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: Add recipeData and sourceType to FoodRecommendationHistory
ALTER TABLE "FoodRecommendationHistory" ADD COLUMN IF NOT EXISTS "recipeData" TEXT;
ALTER TABLE "FoodRecommendationHistory" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;

-- CreateTable: AiJob
CREATE TABLE IF NOT EXISTS "AiJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "result" TEXT,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AiUsageLog
CREATE TABLE IF NOT EXISTS "AiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiJob_userId_jobType_idx" ON "AiJob"("userId", "jobType");
CREATE INDEX IF NOT EXISTS "AiJob_userId_jobType_status_idx" ON "AiJob"("userId", "jobType", "status");
CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_feature_createdAt_idx" ON "AiUsageLog"("userId", "feature", "createdAt");

-- AddForeignKey
ALTER TABLE "AiJob" DROP CONSTRAINT IF EXISTS "AiJob_userId_fkey";
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiUsageLog" DROP CONSTRAINT IF EXISTS "AiUsageLog_userId_fkey";
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
