-- AlterEnum
ALTER TYPE "IntegrationStatus" ADD VALUE 'DISABLED';

-- AlterTable
ALTER TABLE "IntegrationConfig" ADD COLUMN     "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastFour" TEXT,
ADD COLUMN     "publicConfig" JSONB;
