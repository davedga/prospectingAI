-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "autoDraftFirstEmails" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "autoGenerateFollowUps" BOOLEAN NOT NULL DEFAULT true;
