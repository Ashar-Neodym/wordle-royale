-- Ticket 195: operator-bound Railway inventory proof and activation audit.
-- Additive only: this migration does not change the canonical activation row or activate v2.
ALTER TABLE "SpeedLifecycleCapabilityLease"
  ADD COLUMN "providerProjectId" TEXT,
  ADD COLUMN "providerEnvironmentId" TEXT,
  ADD COLUMN "providerServiceId" TEXT,
  ADD COLUMN "providerDeploymentId" TEXT,
  ADD COLUMN "providerReplicaId" TEXT,
  ADD COLUMN "providerRegion" TEXT,
  ADD COLUMN "providerArtifact" TEXT;

ALTER TABLE "SpeedLifecycleCapabilityLease"
  ADD CONSTRAINT "SpeedLifecycleCapabilityLease_provider_identity_check" CHECK (
    ("providerProjectId" IS NULL AND "providerEnvironmentId" IS NULL AND
     "providerServiceId" IS NULL AND "providerDeploymentId" IS NULL AND
     "providerReplicaId" IS NULL AND "providerRegion" IS NULL AND "providerArtifact" IS NULL)
    OR
    ("providerProjectId" IS NOT NULL AND "providerEnvironmentId" IS NOT NULL AND
     "providerServiceId" IS NOT NULL AND "providerDeploymentId" IS NOT NULL AND
     "providerReplicaId" IS NOT NULL AND "providerArtifact" IS NOT NULL AND
     btrim("providerProjectId") <> '' AND btrim("providerEnvironmentId") <> '' AND
     btrim("providerServiceId") <> '' AND btrim("providerDeploymentId") <> '' AND
     btrim("providerReplicaId") <> '' AND
     ("providerRegion" IS NULL OR btrim("providerRegion") <> '') AND
     btrim("providerArtifact") <> '')
  );

CREATE INDEX "SpeedLifecycleCapabilityLease_release_replica_expiry_idx"
  ON "SpeedLifecycleCapabilityLease" ("releaseId", "providerReplicaId", "expiresAt");
CREATE INDEX "SpeedLifecycleCapabilityLease_provider_deployment_expiry_idx"
  ON "SpeedLifecycleCapabilityLease" (
    "providerProjectId", "providerEnvironmentId", "providerServiceId",
    "providerDeploymentId", "expiresAt"
  );

CREATE TABLE "SpeedLifecycleActivationAudit" (
  "id" UUID NOT NULL,
  "proofProtocol" TEXT NOT NULL,
  "proofId" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "approvalRef" TEXT NOT NULL,
  "operatorPrincipalHash" TEXT NOT NULL,
  "providerProjectId" TEXT NOT NULL,
  "providerEnvironmentId" TEXT NOT NULL,
  "providerServiceId" TEXT NOT NULL,
  "providerDeploymentId" TEXT NOT NULL,
  "artifactIdentity" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "expectedReplicaCount" INTEGER NOT NULL,
  "inventoryDigest" TEXT NOT NULL,
  "leaseSetDigest" TEXT NOT NULL,
  "providerObservedBeforeAt" TIMESTAMPTZ NOT NULL,
  "providerObservedAfterAt" TIMESTAMPTZ NOT NULL,
  "fromPhase" TEXT NOT NULL,
  "fromGeneration" BIGINT NOT NULL,
  "toPhase" TEXT NOT NULL,
  "toGeneration" BIGINT NOT NULL,
  "result" TEXT NOT NULL,
  "failureCode" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "SpeedLifecycleActivationAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpeedLifecycleActivationAudit_proofId_key" UNIQUE ("proofId"),
  CONSTRAINT "SpeedLifecycleActivationAudit_protocol_check" CHECK ("proofProtocol" = 'speed_provider_inventory_proof_v2'),
  CONSTRAINT "SpeedLifecycleActivationAudit_result_check" CHECK ("result" IN ('applied','rejected')),
  CONSTRAINT "SpeedLifecycleActivationAudit_identity_check" CHECK (
    btrim("operation") <> '' AND btrim("approvalRef") <> '' AND
    "operatorPrincipalHash" ~ '^[0-9a-f]{64}$' AND
    btrim("providerProjectId") <> '' AND btrim("providerEnvironmentId") <> '' AND
    btrim("providerServiceId") <> '' AND btrim("providerDeploymentId") <> '' AND
    btrim("artifactIdentity") <> '' AND btrim("releaseId") <> '' AND
    "expectedReplicaCount" > 0 AND
    "inventoryDigest" ~ '^[0-9a-f]{64}$' AND "leaseSetDigest" ~ '^[0-9a-f]{64}$' AND
    "providerObservedAfterAt" >= "providerObservedBeforeAt" AND
    "toGeneration" = "fromGeneration" + 1
  )
);

CREATE INDEX "SpeedLifecycleActivationAudit_createdAt_idx"
  ON "SpeedLifecycleActivationAudit" ("createdAt");

CREATE FUNCTION wr_speed_activation_audit_row_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='WR008', MESSAGE='WR_SPEED_ACTIVATION_AUDIT_APPEND_ONLY';
END;
$$;
CREATE TRIGGER "speed_activation_audit_row_guard"
BEFORE UPDATE OR DELETE ON "SpeedLifecycleActivationAudit"
FOR EACH ROW EXECUTE FUNCTION wr_speed_activation_audit_row_guard();

CREATE FUNCTION wr_speed_activation_audit_truncate_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='WR008', MESSAGE='WR_SPEED_ACTIVATION_AUDIT_APPEND_ONLY';
END;
$$;
CREATE TRIGGER "speed_activation_audit_truncate_guard"
BEFORE TRUNCATE ON "SpeedLifecycleActivationAudit"
FOR EACH STATEMENT EXECUTE FUNCTION wr_speed_activation_audit_truncate_guard();
