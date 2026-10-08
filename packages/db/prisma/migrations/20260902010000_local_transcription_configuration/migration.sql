ALTER TYPE "IntegrationProvider" ADD VALUE 'TRANSCRIPTION';

ALTER TABLE "Transcript" ADD COLUMN "metadata" JSONB;
