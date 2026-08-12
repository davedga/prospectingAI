-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "autoApproveFirstEmails" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "emailSignature" TEXT;
