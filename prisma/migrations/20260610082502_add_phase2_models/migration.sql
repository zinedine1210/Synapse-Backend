-- CreateTable
CREATE TABLE "FoodPreference" (
    "userId" TEXT NOT NULL,
    "dislikedIngredients" TEXT[],
    "preferredCuisines" TEXT[],
    "spicyLevel" INTEGER NOT NULL DEFAULT 1,
    "dietType" TEXT NOT NULL DEFAULT 'none',
    "avgMealBudget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SplitBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventName" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "receiptImageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'settling',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitBillItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "assignedTo" TEXT[],

    CONSTRAINT "SplitBillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitParticipant" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalOwed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SplitParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SplitBill_userId_idx" ON "SplitBill"("userId");

-- CreateIndex
CREATE INDEX "SplitBillItem_billId_idx" ON "SplitBillItem"("billId");

-- CreateIndex
CREATE INDEX "SplitParticipant_billId_idx" ON "SplitParticipant"("billId");

-- AddForeignKey
ALTER TABLE "FoodPreference" ADD CONSTRAINT "FoodPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBill" ADD CONSTRAINT "SplitBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitBillItem" ADD CONSTRAINT "SplitBillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SplitBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitParticipant" ADD CONSTRAINT "SplitParticipant_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SplitBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
