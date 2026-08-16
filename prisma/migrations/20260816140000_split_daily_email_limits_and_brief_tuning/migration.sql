-- AlterTable
ALTER TABLE "Settings" RENAME COLUMN "dailyEmailLimit" TO "dailyFirstEmailLimit";
ALTER TABLE "Settings" ALTER COLUMN "dailyFirstEmailLimit" SET DEFAULT 55;
ALTER TABLE "Settings" ADD COLUMN "dailyFollowUpLimit" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Settings" ADD COLUMN "standingBriefAutoTunedAt" TIMESTAMP(3);
