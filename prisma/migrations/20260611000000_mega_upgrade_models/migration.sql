-- AlterTable: Add fields to Notification
ALTER TABLE "Notification" ADD COLUMN "category" TEXT;
ALTER TABLE "Notification" ADD COLUMN "actionUrl" TEXT;

-- AlterTable: Add fields to PersonalTodo
ALTER TABLE "PersonalTodo" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PersonalTodo" ADD COLUMN "recurrence" TEXT;
ALTER TABLE "PersonalTodo" ADD COLUMN "parentTodoId" TEXT;

-- AlterTable: Add fields to NotificationPreference
ALTER TABLE "NotificationPreference" ADD COLUMN "forumReply" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "qnaAnswer" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "achievementAlert" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Add splitMethod to SplitBill
ALTER TABLE "SplitBill" ADD COLUMN "splitMethod" TEXT NOT NULL DEFAULT 'item';

-- AlterTable: Add percentage to SplitParticipant
ALTER TABLE "SplitParticipant" ADD COLUMN "percentage" DOUBLE PRECISION;

-- CreateTable: QnaVote
CREATE TABLE "QnaVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QnaVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserSettings
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "language" TEXT NOT NULL DEFAULT 'id',
    "exportRequested" TIMESTAMP(3),
    "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable: TodoSubtask
CREATE TABLE "TodoSubtask" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TodoSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SubscriptionDismissal
CREATE TABLE "SubscriptionDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QnaReport
CREATE TABLE "QnaReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QnaReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WeeklyChallenge
CREATE TABLE "WeeklyChallenge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "rewardXp" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WeeklyChallengeProgress
CREATE TABLE "WeeklyChallengeProgress" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WeeklyChallengeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FoodFavorite
CREATE TABLE "FoodFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeName" TEXT NOT NULL,
    "recipeData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FoodRecommendationHistory
CREATE TABLE "FoodRecommendationHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeName" TEXT NOT NULL,
    "budget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodRecommendationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QnaVote_answerId_idx" ON "QnaVote"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "QnaVote_userId_answerId_key" ON "QnaVote"("userId", "answerId");

-- CreateIndex
CREATE INDEX "TodoSubtask_todoId_idx" ON "TodoSubtask"("todoId");

-- CreateIndex
CREATE INDEX "SubscriptionDismissal_userId_idx" ON "SubscriptionDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionDismissal_userId_pattern_key" ON "SubscriptionDismissal"("userId", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "QnaReport_userId_answerId_key" ON "QnaReport"("userId", "answerId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyChallengeProgress_challengeId_userId_key" ON "WeeklyChallengeProgress"("challengeId", "userId");

-- CreateIndex
CREATE INDEX "FoodFavorite_userId_idx" ON "FoodFavorite"("userId");

-- CreateIndex
CREATE INDEX "FoodRecommendationHistory_userId_createdAt_idx" ON "FoodRecommendationHistory"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "QnaVote" ADD CONSTRAINT "QnaVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaVote" ADD CONSTRAINT "QnaVote_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QnaAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoSubtask" ADD CONSTRAINT "TodoSubtask_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "PersonalTodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionDismissal" ADD CONSTRAINT "SubscriptionDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaReport" ADD CONSTRAINT "QnaReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaReport" ADD CONSTRAINT "QnaReport_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QnaAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyChallengeProgress" ADD CONSTRAINT "WeeklyChallengeProgress_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "WeeklyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyChallengeProgress" ADD CONSTRAINT "WeeklyChallengeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodFavorite" ADD CONSTRAINT "FoodFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodRecommendationHistory" ADD CONSTRAINT "FoodRecommendationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
