-- CreateTable
CREATE TABLE "ForumReadStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "discussionId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumReadStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumReadStatus_userId_classId_discussionId_key" ON "ForumReadStatus"("userId", "classId", "discussionId");

-- CreateIndex
CREATE INDEX "ExamPrediction_classId_idx" ON "ExamPrediction"("classId");

-- CreateIndex
CREATE INDEX "ForumDiscussion_classId_idx" ON "ForumDiscussion"("classId");

-- CreateIndex
CREATE INDEX "ForumPost_classId_idx" ON "ForumPost"("classId");

-- CreateIndex
CREATE INDEX "ForumPost_discussionId_idx" ON "ForumPost"("discussionId");

-- CreateIndex
CREATE INDEX "ForumReply_postId_idx" ON "ForumReply"("postId");

-- CreateIndex
CREATE INDEX "Material_sessionId_idx" ON "Material"("sessionId");

-- CreateIndex
CREATE INDEX "Material_status_idx" ON "Material"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Session_classId_idx" ON "Session"("classId");

-- CreateIndex
CREATE INDEX "Task_classId_idx" ON "Task"("classId");

-- CreateIndex
CREATE INDEX "Task_sessionId_idx" ON "Task"("sessionId");

-- CreateIndex
CREATE INDEX "Task_deadline_idx" ON "Task"("deadline");

-- CreateIndex
CREATE INDEX "TaskSubmission_taskId_idx" ON "TaskSubmission"("taskId");

-- CreateIndex
CREATE INDEX "TaskSubmission_userId_idx" ON "TaskSubmission"("userId");

-- AddForeignKey
ALTER TABLE "ForumReadStatus" ADD CONSTRAINT "ForumReadStatus_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReadStatus" ADD CONSTRAINT "ForumReadStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
