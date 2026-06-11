-- DropIndex
DROP INDEX "CategoryBudget_userId_idx";

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "inputMethod" SET DEFAULT 'manual';

-- CreateIndex
CREATE INDEX "CategoryBudget_userId_month_year_idx" ON "CategoryBudget"("userId", "month", "year");

-- CreateIndex
CREATE INDEX "Transaction_userId_type_idx" ON "Transaction"("userId", "type");
