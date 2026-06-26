-- AlterTable
ALTER TABLE "ThesisChapter" ADD COLUMN     "pageEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paragraphCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "targetPages" INTEGER,
ADD COLUMN     "targetParagraphs" INTEGER;
