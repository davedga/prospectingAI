-- Distinguish re-outreach-eligible prior prospects from hard do-not-contact
-- brands, and keep an optional Instagram link on the list. Additive + safe
-- on the live table (new columns have a default / are nullable).
ALTER TABLE "ExcludedBrand" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'do-not-contact';
ALTER TABLE "ExcludedBrand" ADD COLUMN "instagramUrl" TEXT;

-- Backfill: anything imported as a prior prospect stays re-outreach-eligible,
-- so existing rows aren't silently turned into hard exclusions.
UPDATE "ExcludedBrand" SET "category" = 'prior-prospect'
WHERE "source" = 'prior-prospects-import';
