-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "sendWindowStartHour" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "Settings" ADD COLUMN "sendWindowEndHour" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "Settings" ADD COLUMN "sendTimezone" TEXT NOT NULL DEFAULT 'America/New_York';
ALTER TABLE "Settings" ADD COLUMN "dailyDiscoveryLimit" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Settings" ADD COLUMN "dailyProspectLimit" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Settings" ADD COLUMN "dailyEmailLimit" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Settings" ADD COLUMN "abTestingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "abVariantAHint" TEXT;
ALTER TABLE "Settings" ADD COLUMN "abVariantBHint" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "variant" TEXT;

-- AlterTable
ALTER TABLE "Email" ADD COLUMN "variant" TEXT;
