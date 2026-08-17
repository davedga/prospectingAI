-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "gmailThreadId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "firstMessageId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "repliedAt" TIMESTAMP(3);
