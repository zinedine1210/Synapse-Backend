-- AlterTable
ALTER TABLE "PersonalTodo" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TodoCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📁',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TodoCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TodoCategory_userId_idx" ON "TodoCategory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TodoCategory_userId_name_key" ON "TodoCategory"("userId", "name");

-- CreateIndex
CREATE INDEX "PersonalTodo_userId_sortOrder_idx" ON "PersonalTodo"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "TodoCategory" ADD CONSTRAINT "TodoCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
