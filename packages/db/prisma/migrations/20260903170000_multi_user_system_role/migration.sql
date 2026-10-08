CREATE TYPE "SystemRole" AS ENUM ('SYSTEM_ADMIN', 'USER');

ALTER TABLE "User"
ADD COLUMN "systemRole" "SystemRole" NOT NULL DEFAULT 'USER';

CREATE INDEX "User_systemRole_idx" ON "User"("systemRole");
