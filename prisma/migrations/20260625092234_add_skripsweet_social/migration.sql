-- AlterTable
ALTER TABLE "ThesisProject" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ThesisLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThesisLike_thesisId_idx" ON "ThesisLike"("thesisId");

-- CreateIndex
CREATE UNIQUE INDEX "ThesisLike_userId_thesisId_key" ON "ThesisLike"("userId", "thesisId");

-- CreateIndex
CREATE INDEX "ThesisBookmark_userId_idx" ON "ThesisBookmark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ThesisBookmark_userId_thesisId_key" ON "ThesisBookmark"("userId", "thesisId");

-- CreateIndex
CREATE INDEX "ThesisComment_thesisId_idx" ON "ThesisComment"("thesisId");

-- CreateIndex
CREATE INDEX "ThesisProject_isPublished_updatedAt_idx" ON "ThesisProject"("isPublished", "updatedAt");

-- AddForeignKey
ALTER TABLE "ThesisLike" ADD CONSTRAINT "ThesisLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisLike" ADD CONSTRAINT "ThesisLike_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisBookmark" ADD CONSTRAINT "ThesisBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisBookmark" ADD CONSTRAINT "ThesisBookmark_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisComment" ADD CONSTRAINT "ThesisComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisComment" ADD CONSTRAINT "ThesisComment_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "ThesisProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
