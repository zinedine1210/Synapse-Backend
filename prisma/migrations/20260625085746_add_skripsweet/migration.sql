-- CreateTable
CREATE TABLE "ThesisProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "university" TEXT,
    "faculty" TEXT,
    "department" TEXT,
    "supervisor" TEXT,
    "supervisorTwo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "abstract" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisFormatTemplate" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "universityName" TEXT,
    "formatRules" TEXT NOT NULL,
    "chapterTemplate" TEXT,
    "citationStyle" TEXT NOT NULL DEFAULT 'apa7',
    "customCitation" TEXT,
    "language" TEXT NOT NULL DEFAULT 'id',
    "rawUploadText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisFormatTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisChapter" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chapterNum" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "content" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "targetWords" INTEGER,
    "notes" TEXT,
    "aiSuggestion" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisJournal" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "journalName" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "url" TEXT,
    "abstract" TEXT,
    "relevance" TEXT,
    "notes" TEXT,
    "isFromSearch" BOOLEAN NOT NULL DEFAULT false,
    "bibtex" TEXT,
    "citationKey" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisBimbingan" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supervisor" TEXT,
    "topic" TEXT NOT NULL,
    "feedback" TEXT,
    "actionItems" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attachment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisBimbingan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisChatMessage" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisBibliography" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "journalId" TEXT,
    "rawEntry" TEXT NOT NULL,
    "citationKey" TEXT NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'article',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisBibliography_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThesisProject_userId_idx" ON "ThesisProject"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ThesisFormatTemplate_thesisId_key" ON "ThesisFormatTemplate"("thesisId");

-- CreateIndex
CREATE INDEX "ThesisChapter_thesisId_idx" ON "ThesisChapter"("thesisId");

-- CreateIndex
CREATE UNIQUE INDEX "ThesisChapter_thesisId_chapterNum_key" ON "ThesisChapter"("thesisId", "chapterNum");

-- CreateIndex
CREATE INDEX "ThesisJournal_thesisId_idx" ON "ThesisJournal"("thesisId");

-- CreateIndex
CREATE INDEX "ThesisBimbingan_thesisId_idx" ON "ThesisBimbingan"("thesisId");

-- CreateIndex
CREATE INDEX "ThesisChatMessage_thesisId_idx" ON "ThesisChatMessage"("thesisId");

-- CreateIndex
CREATE INDEX "ThesisBibliography_thesisId_idx" ON "ThesisBibliography"("thesisId");

-- AddForeignKey
ALTER TABLE "ThesisProject" ADD CONSTRAINT "ThesisProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisFormatTemplate" ADD CONSTRAINT "ThesisFormatTemplate_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisChapter" ADD CONSTRAINT "ThesisChapter_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisJournal" ADD CONSTRAINT "ThesisJournal_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisBimbingan" ADD CONSTRAINT "ThesisBimbingan_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisChatMessage" ADD CONSTRAINT "ThesisChatMessage_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisBibliography" ADD CONSTRAINT "ThesisBibliography_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
