param([string]$Schema = ('research_migration_' + (Get-Date -Format 'yyyyMMddHHmmss')))
$ErrorActionPreference = 'Stop'
if ($Schema -notmatch '^research_migration_[0-9]+$') { throw 'Only isolated research_migration_<digits> schemas are allowed.' }
$repo = Split-Path $PSScriptRoot -Parent
$container = 'content-center-test-postgres-1'
function Invoke-TestSql([string]$Sql) {
  $Sql | docker exec -i $container psql -X -q -v ON_ERROR_STOP=1 -U content_center_test -d content_center_test
  if ($LASTEXITCODE -ne 0) { throw 'Isolated migration validation failed.' }
}
Push-Location $repo
try {
  Invoke-TestSql ('CREATE SCHEMA "' + $Schema + '";')
  $prefix = 'SET search_path TO "' + $Schema + '";'
  $committed = @(git ls-tree -r --name-only HEAD packages/db/prisma/migrations | Where-Object { $_ -like '*/migration.sql' })
  if ($LASTEXITCODE -ne 0 -or $committed.Count -eq 0) { throw 'Cannot read committed migrations.' }
  foreach ($path in $committed) {
    $sql = (git show "HEAD:$path") -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "Cannot read $path" }
    Invoke-TestSql ($prefix + "`n" + $sql)
  }
  $candidates = @('20260923120000_benchmark_research_organization', '20260923153000_benchmark_input_evidence', '20260924100000_benchmark_collection_runs', '20260927120000_research_sessions', '20260927143000_research_object_preferences', '20260927150000_research_artifact_source', '20260927153000_research_legacy_artifact_source')
  foreach ($migration in $candidates) {
    Invoke-TestSql ($prefix + "`n" + (Get-Content -LiteralPath "packages/db/prisma/migrations/$migration/migration.sql" -Raw))
  }
  $checks = @'
BEGIN;
INSERT INTO "User" (id,name,email,"updatedAt") VALUES ('probe-user','probe','migration-probe@example.invalid',now());
INSERT INTO "Workspace" (id,name,slug,"updatedAt") VALUES ('probe-workspace','probe','migration-probe',now());
INSERT INTO "BenchmarkAccount" (id,"workspaceId",platform,"externalAccountId",name,"createdById","updatedAt") VALUES ('probe-account','probe-workspace','DOUYIN','probe','probe','probe-user',now());
INSERT INTO "BenchmarkCollectionRun" (id,"workspaceId","benchmarkAccountId","requestedById","rangeStart","rangeEnd","updatedAt") VALUES ('collection-one','probe-workspace','probe-account','probe-user',now(),now(),now());
DO $$ BEGIN
  BEGIN
    INSERT INTO "BenchmarkCollectionRun" (id,"workspaceId","benchmarkAccountId","requestedById","rangeStart","rangeEnd","updatedAt") VALUES ('collection-two','probe-workspace','probe-account','probe-user',now(),now(),now());
    RAISE EXCEPTION 'Missing collection active uniqueness';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
UPDATE "BenchmarkCollectionRun" SET status='COMPLETED' WHERE id='collection-one';
INSERT INTO "BenchmarkCollectionRun" (id,"workspaceId","benchmarkAccountId","requestedById","rangeStart","rangeEnd","updatedAt") VALUES ('collection-two','probe-workspace','probe-account','probe-user',now(),now(),now());
INSERT INTO "BenchmarkContentSnapshot" (id,"workspaceId","benchmarkAccountId",platform,"externalId",title,url,metadata) VALUES ('snapshot','probe-workspace','probe-account','DOUYIN','probe','probe','https://example.invalid','{}');
INSERT INTO "BenchmarkComment" (id,"snapshotId","externalId",text) VALUES ('comment','snapshot','external-comment','probe');
INSERT INTO "BenchmarkMetricObservation" (id,"snapshotId","collectionRunId",metrics) VALUES ('observation','snapshot','collection-one','{"likes":null}');
DO $$ BEGIN
  BEGIN
    INSERT INTO "BenchmarkMetricObservation" (id,"snapshotId","collectionRunId",metrics) VALUES ('duplicate','snapshot','collection-one','{}');
    RAISE EXCEPTION 'Missing observation uniqueness';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO "BenchmarkComment" (id,"snapshotId","externalId",text) VALUES ('orphan','missing','external','probe');
    RAISE EXCEPTION 'Missing comment foreign key';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
INSERT INTO "ResearchSession" (id,"workspaceId","createdById",title,"requestKey","updatedAt") VALUES ('session','probe-workspace','probe-user','probe','session-key',now());
INSERT INTO "ResearchRun" (id,"workspaceId","sessionId","requestedById","requestKey","requestHash",question,version,"inputScope","updatedAt") VALUES ('run-one','probe-workspace','session','probe-user','run-key-one','hash','probe',1,'{}',now());
DO $$ BEGIN
  BEGIN
    INSERT INTO "ResearchRun" (id,"workspaceId","sessionId","requestedById","requestKey","requestHash",question,version,"inputScope","updatedAt") VALUES ('run-two','probe-workspace','session','probe-user','run-key-two','hash','probe',2,'{}',now());
    RAISE EXCEPTION 'Missing research active uniqueness';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
UPDATE "ResearchRun" SET status='COMPLETED' WHERE id='run-one';
INSERT INTO "ResearchRun" (id,"workspaceId","sessionId","requestedById","requestKey","requestHash",question,version,"inputScope","updatedAt") VALUES ('run-two','probe-workspace','session','probe-user','run-key-two','hash','probe',2,'{}',now());
ROLLBACK;
'@
  Invoke-TestSql ($prefix + "`n" + $checks)
  Write-Output "PASS: $($committed.Count) committed migrations + $($candidates.Count) Research candidates; active uniqueness, terminal retry, observation uniqueness, comment FK. Isolated schema: $Schema (retained, probe rows rolled back)."
} finally { Pop-Location }
