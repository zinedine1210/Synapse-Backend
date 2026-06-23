-- AlterTable: Add upvotes and aiAnswer to QnaQuestion
ALTER TABLE "QnaQuestion" ADD COLUMN "upvotes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QnaQuestion" ADD COLUMN "aiAnswer" TEXT;

-- CreateTable: QnaBookmark
CREATE TABLE "QnaBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QnaBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QnaQuestionVote
CREATE TABLE "QnaQuestionVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QnaQuestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QnaBookmark_userId_questionId_key" ON "QnaBookmark"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QnaQuestionVote_userId_questionId_key" ON "QnaQuestionVote"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "QnaBookmark" ADD CONSTRAINT "QnaBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaBookmark" ADD CONSTRAINT "QnaBookmark_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QnaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaQuestionVote" ADD CONSTRAINT "QnaQuestionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QnaQuestionVote" ADD CONSTRAINT "QnaQuestionVote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QnaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
