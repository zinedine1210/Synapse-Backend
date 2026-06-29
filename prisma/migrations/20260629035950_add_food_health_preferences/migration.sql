-- AlterTable
ALTER TABLE "FoodPreference" ADD COLUMN     "allergies" TEXT[],
ADD COLUMN     "breakfastHabit" TEXT,
ADD COLUMN     "calorieLimit" INTEGER,
ADD COLUMN     "dinnerHabit" TEXT,
ADD COLUMN     "healthGoals" TEXT[],
ADD COLUMN     "lunchHabit" TEXT,
ADD COLUMN     "proteinTarget" INTEGER,
ADD COLUMN     "snackHabit" TEXT;

-- AlterTable
ALTER TABLE "PricingPlan" ADD COLUMN     "aiFoodLimit" INTEGER NOT NULL DEFAULT 5;
