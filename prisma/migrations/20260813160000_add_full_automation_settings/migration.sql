-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "standingDiscoveryBrief" TEXT;
ALTER TABLE "Settings" ADD COLUMN "autoRunDiscovery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "autoSelectDiscovered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "autoProspectSelected" BOOLEAN NOT NULL DEFAULT false;
