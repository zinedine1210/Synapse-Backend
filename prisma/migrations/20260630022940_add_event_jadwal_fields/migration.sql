-- AlterTable
ALTER TABLE "PersonalTodo" ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "eventType" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "reminderMinutes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "startTime" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'todo';

-- CreateIndex
CREATE INDEX "PersonalTodo_userId_type_idx" ON "PersonalTodo"("userId", "type");
