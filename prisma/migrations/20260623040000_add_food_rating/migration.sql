-- CreateTable
CREATE TABLE "FoodRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodRating_userId_historyId_key" ON "FoodRating"("userId", "historyId");

-- CreateIndex
CREATE INDEX "FoodRating_userId_idx" ON "FoodRating"("userId");

-- AddForeignKey
ALTER TABLE "FoodRating" ADD CONSTRAINT "FoodRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodRating" ADD CONSTRAINT "FoodRating_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "FoodRecommendationHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
