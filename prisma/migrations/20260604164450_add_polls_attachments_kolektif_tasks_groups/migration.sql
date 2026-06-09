-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('ESSAY', 'MULTIPLE_CHOICE', 'MIXED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('SHARED', 'PRIVATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ForumCategory" ADD VALUE 'POLL';
ALTER TYPE "ForumCategory" ADD VALUE 'REMINDER';

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "uploaderId" TEXT,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'SHARED';

-- CreateTable
CREATE TABLE "ForumPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ForumPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPollVote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ForumPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumAttachment" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "replyId" TEXT,
    "uploaderName" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumReminder" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kolektif" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kolektif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KolektifTransaction" (
    "id" TEXT NOT NULL,
    "kolektifId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KolektifTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sessionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskType" "TaskType" NOT NULL DEFAULT 'MIXED',
    "deadline" TIMESTAMP(3),
    "visibility" "Visibility" NOT NULL DEFAULT 'SHARED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taskGroupId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT,
    "imageUrl" TEXT,
    "aiAnswer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskGroup" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumPoll_postId_key" ON "ForumPoll"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumPollVote_optionId_userId_key" ON "ForumPollVote"("optionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumReminder_postId_key" ON "ForumReminder"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskGroupMember_groupId_userId_key" ON "TaskGroupMember"("groupId", "userId");

-- AddForeignKey
ALTER TABLE "ForumPoll" ADD CONSTRAINT "ForumPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPollOption" ADD CONSTRAINT "ForumPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ForumPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPollVote" ADD CONSTRAINT "ForumPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ForumPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPollVote" ADD CONSTRAINT "ForumPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAttachment" ADD CONSTRAINT "ForumAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAttachment" ADD CONSTRAINT "ForumAttachment_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "ForumReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReminder" ADD CONSTRAINT "ForumReminder_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kolektif" ADD CONSTRAINT "Kolektif_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolektifTransaction" ADD CONSTRAINT "KolektifTransaction_kolektifId_fkey" FOREIGN KEY ("kolektifId") REFERENCES "Kolektif"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KolektifTransaction" ADD CONSTRAINT "KolektifTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_taskGroupId_fkey" FOREIGN KEY ("taskGroupId") REFERENCES "TaskGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGroup" ADD CONSTRAINT "TaskGroup_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGroupMember" ADD CONSTRAINT "TaskGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TaskGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGroupMember" ADD CONSTRAINT "TaskGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
