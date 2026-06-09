-- AlterTable
ALTER TABLE "ForumDiscussion" ADD COLUMN     "sessionId" TEXT;

-- AddForeignKey
ALTER TABLE "ForumDiscussion" ADD CONSTRAINT "ForumDiscussion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
