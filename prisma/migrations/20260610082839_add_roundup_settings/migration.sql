-- AlterTable
ALTER TABLE "BawelSetting" ADD COLUMN     "roundUpAmount" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "roundUpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roundUpTreeId" TEXT;
