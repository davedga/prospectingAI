-- CreateTable
CREATE TABLE "CmoLead" (
    "id" TEXT NOT NULL,
    "seq" INTEGER,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "fit" INTEGER,
    "consumerSignals" TEXT,
    "linkedin" TEXT,
    "email" TEXT,
    "emailStatus" TEXT,
    "location" TEXT,
    "apolloTitle" TEXT,
    "headline" TEXT,
    "firm" TEXT,
    "firmIndustry" TEXT,
    "currentRoles" TEXT,
    "currentClients" TEXT,
    "clientsContacted" TEXT,
    "notes" TEXT,
    "inBroadSearch" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'cmo-master-import',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "CmoLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmoClientBrand" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "website" TEXT,
    "category" TEXT,
    "relationship" TEXT,
    "ttsStatus" TEXT,
    "alreadyContacted" TEXT,
    "cmoName" TEXT,
    "cmoFit" INTEGER,
    "cmoLinkedin" TEXT,
    "cmoEmail" TEXT,
    "fromList" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cmo-master-import',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "CmoClientBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgDmLead" (
    "id" TEXT NOT NULL,
    "seq" INTEGER,
    "batchDate" TEXT,
    "brand" TEXT NOT NULL,
    "category" TEXT,
    "website" TEXT,
    "igHandle" TEXT,
    "igUrl" TEXT,
    "tiktokHandle" TEXT,
    "ttsStatus" TEXT,
    "ttsEvidence" TEXT,
    "revenueBasis" TEXT,
    "revenueConfidence" TEXT,
    "usHq" TEXT,
    "camDmStatus" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ig-master-import',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "IgDmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmoLead_dedupeKey_key" ON "CmoLead"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "CmoClientBrand_dedupeKey_key" ON "CmoClientBrand"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "IgDmLead_dedupeKey_key" ON "IgDmLead"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_date_key" ON "MetricSnapshot"("date");
