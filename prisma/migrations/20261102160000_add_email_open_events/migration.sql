-- Per-open event log (every pixel hit), so reporting can show each open's
-- timestamp instead of only the first. Additive; existing emails have no
-- events and fall back to Email.openedAt in the report.
CREATE TABLE "EmailOpenEvent" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailOpenEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailOpenEvent_emailId_idx" ON "EmailOpenEvent"("emailId");
ALTER TABLE "EmailOpenEvent" ADD CONSTRAINT "EmailOpenEvent_emailId_fkey"
    FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE CASCADE ON UPDATE CASCADE;
