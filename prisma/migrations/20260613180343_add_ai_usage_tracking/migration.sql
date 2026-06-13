-- Safe migration: uses IF EXISTS / IF NOT EXISTS for idempotency

-- DropIndex (safe)
DROP INDEX IF EXISTS "PersonalTodo_userId_sortOrder_idx";

-- AlterTable BawelSetting (drop columns if they exist)
ALTER TABLE "BawelSetting" DROP COLUMN IF EXISTS "roundUpAmount";
ALTER TABLE "BawelSetting" DROP COLUMN IF EXISTS "roundUpEnabled";
ALTER TABLE "BawelSetting" DROP COLUMN IF EXISTS "roundUpTreeId";

-- AlterTable FoodPreference
ALTER TABLE "FoodPreference" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "FoodPreference" DROP COLUMN IF EXISTS "updatedAt";

-- AlterTable NotificationPreference
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable PersonalTodo
ALTER TABLE "PersonalTodo" DROP COLUMN IF EXISTS "inputMethod";
ALTER TABLE "PersonalTodo" DROP COLUMN IF EXISTS "tags";

-- AlterTable PricingPlan
ALTER TABLE "PricingPlan" ADD COLUMN IF NOT EXISTS "aiBriefingLimit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PricingPlan" ADD COLUMN IF NOT EXISTS "aiWeeklyRoastLimit" INTEGER NOT NULL DEFAULT 1;

-- AlterTable TodoCategory
ALTER TABLE "TodoCategory" DROP COLUMN IF EXISTS "icon";
ALTER TABLE "TodoCategory" ADD COLUMN IF NOT EXISTS "emoji" TEXT NOT NULL DEFAULT '📌';
ALTER TABLE "TodoCategory" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TodoCategory" ALTER COLUMN "color" SET DEFAULT '#6b7280';

-- AlterTable Transaction
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "receiptBatchId";
ALTER TABLE "Transaction" ALTER COLUMN "inputMethod" SET DEFAULT 'text';

-- AlterTable User (drop profile columns moved to UserProfile)
ALTER TABLE "User" DROP COLUMN IF EXISTS "address";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bio";
ALTER TABLE "User" DROP COLUMN IF EXISTS "birthDate";
ALTER TABLE "User" DROP COLUMN IF EXISTS "city";
ALTER TABLE "User" DROP COLUMN IF EXISTS "currentSemester";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dailyStudyHours";
ALTER TABLE "User" DROP COLUMN IF EXISTS "enrollmentYear";
ALTER TABLE "User" DROP COLUMN IF EXISTS "faculty";
ALTER TABLE "User" DROP COLUMN IF EXISTS "gender";
ALTER TABLE "User" DROP COLUMN IF EXISTS "gpa";
ALTER TABLE "User" DROP COLUMN IF EXISTS "hobbies";
ALTER TABLE "User" DROP COLUMN IF EXISTS "interests";
ALTER TABLE "User" DROP COLUMN IF EXISTS "learningStyle";
ALTER TABLE "User" DROP COLUMN IF EXISTS "major";
ALTER TABLE "User" DROP COLUMN IF EXISTS "nickname";
ALTER TABLE "User" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "User" DROP COLUMN IF EXISTS "preferredLanguage";
ALTER TABLE "User" DROP COLUMN IF EXISTS "province";
ALTER TABLE "User" DROP COLUMN IF EXISTS "skills";
ALTER TABLE "User" DROP COLUMN IF EXISTS "socialLinks";
ALTER TABLE "User" DROP COLUMN IF EXISTS "studentId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "studyGoals";
ALTER TABLE "User" DROP COLUMN IF EXISTS "university";

-- AlterTable UserProfile
ALTER TABLE "UserProfile" ALTER COLUMN "hobbies" DROP DEFAULT;

-- CreateTable AiUsageLog
CREATE TABLE IF NOT EXISTS "AiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable PushSubscription
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (safe)
CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_feature_createdAt_idx" ON "AiUsageLog"("userId", "feature", "createdAt");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId", "endpoint");

-- AddForeignKey (use DO block to avoid duplicate constraint error)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiUsageLog_userId_fkey') THEN
    ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey') THEN
    ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
