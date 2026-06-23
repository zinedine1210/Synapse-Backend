-- CreateTable
CREATE TABLE "BudgetChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'daily_limit',
    "targetAmount" DOUBLE PRECISION,
    "targetDays" INTEGER NOT NULL DEFAULT 7,
    "category" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "completedDays" INTEGER NOT NULL DEFAULT 0,
    "failedDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '📦',
    "type" TEXT NOT NULL DEFAULT 'expense',
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetChallenge_userId_idx" ON "BudgetChallenge"("userId");
CREATE INDEX "BudgetChallenge_userId_isActive_idx" ON "BudgetChallenge"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomCategory_userId_name_type_key" ON "CustomCategory"("userId", "name", "type");
CREATE INDEX "CustomCategory_userId_idx" ON "CustomCategory"("userId");

-- AddForeignKey
ALTER TABLE "BudgetChallenge" ADD CONSTRAINT "BudgetChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomCategory" ADD CONSTRAINT "CustomCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
