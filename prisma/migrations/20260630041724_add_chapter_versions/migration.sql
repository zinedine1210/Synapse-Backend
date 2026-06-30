-- CreateTable
CREATE TABLE "ChapterVersion" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterVersion_chapterId_idx" ON "ChapterVersion"("chapterId");

-- AddForeignKey
ALTER TABLE "ChapterVersion" ADD CONSTRAINT "ChapterVersion_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "ThesisChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
