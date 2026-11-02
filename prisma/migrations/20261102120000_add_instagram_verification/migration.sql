-- Instagram link verification fields (see src/lib/verify-instagram.ts).
-- Additive and nullable; safe to apply to a live table with existing rows.
ALTER TABLE "Company" ADD COLUMN "instagramVerified" BOOLEAN;
ALTER TABLE "Company" ADD COLUMN "instagramCheckedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "instagramCheckNote" TEXT;
