-- M1 uses the existing ingest job table and content-ingest queue for analysis.
ALTER TYPE "IngestJobType" ADD VALUE 'ANALYZE_MATERIAL';
