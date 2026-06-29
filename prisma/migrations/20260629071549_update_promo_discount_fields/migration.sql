-- AlterTable
ALTER TABLE "PromoDiscount" ADD COLUMN     "autoApply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" TEXT NOT NULL DEFAULT 'percent',
ALTER COLUMN "discountPercent" SET DEFAULT 0;
