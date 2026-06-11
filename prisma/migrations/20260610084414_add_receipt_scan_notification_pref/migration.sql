-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "receiptBatchId" TEXT;

-- CreateTable
CREATE TABLE "ReceiptScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "storeName" TEXT,
    "scanDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "deadlineReminder" BOOLEAN NOT NULL DEFAULT true,
    "budgetAlert" BOOLEAN NOT NULL DEFAULT true,
    "streakReminder" BOOLEAN NOT NULL DEFAULT true,
    "idleReminder" BOOLEAN NOT NULL DEFAULT true,
    "weeklyRecap" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "ReceiptScan_userId_idx" ON "ReceiptScan"("userId");

-- AddForeignKey
ALTER TABLE "ReceiptScan" ADD CONSTRAINT "ReceiptScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
