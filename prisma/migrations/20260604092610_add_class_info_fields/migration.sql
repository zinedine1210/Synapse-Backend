/*
  Warnings:

  - The `plan` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `PlanConfig` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `plan` on the `Payment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "day" TEXT,
ADD COLUMN     "lecturer" TEXT,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "time" TEXT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "plan",
ADD COLUMN     "plan" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "plan",
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'FREE';

-- DropTable
DROP TABLE "PlanConfig";

-- DropEnum
DROP TYPE "Plan";

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxUploadPerMonth" INTEGER NOT NULL DEFAULT 5,
    "maxFileSizeMb" INTEGER NOT NULL DEFAULT 10,
    "aiRequestLimit" INTEGER NOT NULL DEFAULT 10,
    "features" TEXT[],
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingPlan_name_key" ON "PricingPlan"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_plan_fkey" FOREIGN KEY ("plan") REFERENCES "PricingPlan"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
