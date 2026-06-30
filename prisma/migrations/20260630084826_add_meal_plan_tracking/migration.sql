-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "billReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "debtReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "materialNotif" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mealReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scheduleReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "splitBillReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "todoReminder" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "planData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanEntry" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "actualCost" DOUBLE PRECISION,

    CONSTRAINT "MealPlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMealCatalog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "calories" INTEGER,
    "protein" INTEGER,
    "tags" TEXT[],
    "source" TEXT,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMealCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealPlan_userId_weekStart_idx" ON "MealPlan"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_userId_weekStart_key" ON "MealPlan"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "MealPlanEntry_planId_idx" ON "MealPlanEntry"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanEntry_planId_day_mealType_key" ON "MealPlanEntry"("planId", "day", "mealType");

-- CreateIndex
CREATE INDEX "UserMealCatalog_userId_idx" ON "UserMealCatalog"("userId");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMealCatalog" ADD CONSTRAINT "UserMealCatalog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
