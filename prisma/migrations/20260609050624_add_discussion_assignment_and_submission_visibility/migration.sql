-- AlterTable
ALTER TABLE "ForumDiscussion" ADD COLUMN     "assignType" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "assignedGroupId" TEXT,
ADD COLUMN     "assignedUserIds" TEXT[];

-- AlterTable
ALTER TABLE "TaskSubmission" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';
