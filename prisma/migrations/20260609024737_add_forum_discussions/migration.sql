/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Class` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "ForumPost" ADD COLUMN     "discussionId" TEXT;

-- CreateTable
CREATE TABLE "ForumDiscussion" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumDiscussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassCustomTab" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassCustomTab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Class_code_key" ON "Class"("code");

-- AddForeignKey
ALTER TABLE "ForumDiscussion" ADD CONSTRAINT "ForumDiscussion_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumDiscussion" ADD CONSTRAINT "ForumDiscussion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumDiscussion" ADD CONSTRAINT "ForumDiscussion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "ForumDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassCustomTab" ADD CONSTRAINT "ClassCustomTab_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
