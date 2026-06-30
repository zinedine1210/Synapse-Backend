-- CreateTable
CREATE TABLE "ChapterRevision" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "round" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterRevision_chapterId_idx" ON "ChapterRevision"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterRevision_thesisId_idx" ON "ChapterRevision"("thesisId");

-- AddForeignKey
ALTER TABLE "ChapterRevision" ADD CONSTRAINT "ChapterRevision_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ThesisChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRevision" ADD CONSTRAINT "ChapterRevision_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
