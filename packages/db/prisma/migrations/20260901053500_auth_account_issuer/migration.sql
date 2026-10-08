-- Better Auth 1.7 identifies accounts by issuer and provider account id.
ALTER TABLE "Account" ADD COLUMN "issuer" TEXT NOT NULL;

CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");
