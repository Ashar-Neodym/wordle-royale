-- Ticket 187: additive, fail-closed mixed-version Speed lifecycle authority.
-- The canonical row is deliberately seeded v1-open. This migration never opens v2
-- and never rewrites legacy null lifecycle identities.
ALTER TABLE "MatchmakingTicket" ADD COLUMN "readyLifecycleVersion" TEXT;

CREATE TABLE "SpeedLifecycleActivation" (
  "key" TEXT NOT NULL,
  "controlProtocol" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "activeCreationVersion" TEXT,
  "generation" BIGINT NOT NULL,
  "targetReleaseId" TEXT,
  "expectedReplicaCount" INTEGER,
  "transitionReason" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpeedLifecycleActivation_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "SpeedLifecycleActivation_canonical_key_check" CHECK ("key"='speed_1v1'),
  CONSTRAINT "SpeedLifecycleActivation_protocol_check" CHECK ("controlProtocol"='speed_lifecycle_activation_gate_v1'),
  CONSTRAINT "SpeedLifecycleActivation_phase_check" CHECK ("phase" IN ('v1_open','closing_to_v2','v2_open','closing_to_v1','disabled')),
  CONSTRAINT "SpeedLifecycleActivation_phase_version_check" CHECK (
    ("phase"='v1_open' AND "activeCreationVersion"='speed_ready_v1_match_created_20s') OR
    ("phase"='v2_open' AND "activeCreationVersion"='speed_ready_v2_first_ack_90s') OR
    ("phase" IN ('closing_to_v2','closing_to_v1','disabled') AND "activeCreationVersion" IS NULL)
  ),
  CONSTRAINT "SpeedLifecycleActivation_generation_check" CHECK ("generation">=1),
  CONSTRAINT "SpeedLifecycleActivation_replica_count_check" CHECK ("expectedReplicaCount" IS NULL OR "expectedReplicaCount">0),
  CONSTRAINT "SpeedLifecycleActivation_target_pair_check" CHECK (
    ("targetReleaseId" IS NULL AND "expectedReplicaCount" IS NULL) OR
    ("targetReleaseId" IS NOT NULL AND btrim("targetReleaseId")<>'' AND "expectedReplicaCount" IS NOT NULL)
  )
);

CREATE TABLE "SpeedLifecycleCapabilityLease" (
  "instanceBootId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "controlProtocol" TEXT NOT NULL,
  "supportsV1" BOOLEAN NOT NULL,
  "supportsV2" BOOLEAN NOT NULL,
  "supportsLegacyReconcile" BOOLEAN NOT NULL,
  "observedGeneration" BIGINT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpeedLifecycleCapabilityLease_pkey" PRIMARY KEY ("instanceBootId"),
  CONSTRAINT "SpeedLifecycleCapabilityLease_identity_check" CHECK (
    btrim("instanceBootId")<>'' AND btrim("serviceId")<>'' AND btrim("releaseId")<>'' AND btrim("controlProtocol")<>''
  ),
  CONSTRAINT "SpeedLifecycleCapabilityLease_generation_check" CHECK ("observedGeneration" IS NULL OR "observedGeneration">=1),
  CONSTRAINT "SpeedLifecycleCapabilityLease_time_check" CHECK ("lastSeenAt">="startedAt" AND "expiresAt">"lastSeenAt")
);

CREATE INDEX "SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx"
  ON "SpeedLifecycleCapabilityLease" ("releaseId", "expiresAt");
CREATE INDEX "SpeedLifecycleCapabilityLease_controlProtocol_expiresAt_idx"
  ON "SpeedLifecycleCapabilityLease" ("controlProtocol", "expiresAt");

ALTER TABLE "MatchmakingTicket" ADD CONSTRAINT "MatchmakingTicket_ready_lifecycle_check" CHECK (
  ("mode"='speed_1v1' AND ("readyLifecycleVersion" IS NULL OR "readyLifecycleVersion" IN ('speed_ready_v1_match_created_20s','speed_ready_v2_first_ack_90s'))) OR
  ("mode"<>'speed_1v1' AND "readyLifecycleVersion" IS NULL)
);
ALTER TABLE "Match" ADD CONSTRAINT "Match_ready_lifecycle_check" CHECK (
  ("rankedMode"='speed_1v1' AND ("readyLifecycleVersion" IS NULL OR "readyLifecycleVersion" IN ('speed_ready_v1_match_created_20s','speed_ready_v2_first_ack_90s'))) OR
  ("rankedMode" IS DISTINCT FROM 'speed_1v1' AND "readyLifecycleVersion" IS NULL)
);

INSERT INTO "SpeedLifecycleActivation" (
  "key","controlProtocol","phase","activeCreationVersion","generation","transitionReason"
) VALUES (
  'speed_1v1','speed_lifecycle_activation_gate_v1','v1_open','speed_ready_v1_match_created_20s',1,'migration_seed_v1_compatibility'
);

CREATE FUNCTION wr_speed_creation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  authority RECORD;
  effective_version TEXT;
BEGIN
  IF TG_TABLE_NAME='MatchmakingTicket' THEN
    IF NEW."mode"<>'speed_1v1' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='Match' THEN
    IF NEW."rankedMode" IS DISTINCT FROM 'speed_1v1' THEN RETURN NEW; END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='WR001', MESSAGE='WR_SPEED_ACTIVATION_MISSING';
  END IF;

  SELECT "controlProtocol","phase","activeCreationVersion" INTO authority
    FROM "SpeedLifecycleActivation" WHERE "key"='speed_1v1' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='WR001', MESSAGE='WR_SPEED_ACTIVATION_MISSING';
  END IF;
  IF authority."controlProtocol"<>'speed_lifecycle_activation_gate_v1' THEN
    RAISE EXCEPTION USING ERRCODE='WR004', MESSAGE='WR_SPEED_ACTIVATION_PROTOCOL_UNSUPPORTED';
  END IF;
  IF authority."phase" NOT IN ('v1_open','v2_open') THEN
    RAISE EXCEPTION USING ERRCODE='WR002', MESSAGE='WR_SPEED_CREATION_CLOSED';
  END IF;

  effective_version := COALESCE(NEW."readyLifecycleVersion", 'speed_ready_v1_match_created_20s');
  IF effective_version IS DISTINCT FROM authority."activeCreationVersion" THEN
    RAISE EXCEPTION USING ERRCODE='WR003', MESSAGE='WR_SPEED_LIFECYCLE_VERSION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "speed_ticket_creation_guard"
BEFORE INSERT ON "MatchmakingTicket" FOR EACH ROW EXECUTE FUNCTION wr_speed_creation_guard();
CREATE TRIGGER "speed_match_creation_guard"
BEFORE INSERT ON "Match" FOR EACH ROW EXECUTE FUNCTION wr_speed_creation_guard();

CREATE FUNCTION wr_speed_activation_transition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='WR006', MESSAGE='WR_SPEED_ACTIVATION_CANONICAL_ROW_PROTECTED';
  END IF;
  IF NEW."key"<>OLD."key" OR NEW."controlProtocol"<>OLD."controlProtocol" OR NEW."generation"<>OLD."generation"+1 THEN
    RAISE EXCEPTION USING ERRCODE='WR007', MESSAGE='WR_SPEED_ACTIVATION_TRANSITION_REJECTED';
  END IF;
  IF NOT (
    (OLD."phase"='v1_open' AND NEW."phase" IN ('closing_to_v2','disabled')) OR
    (OLD."phase"='closing_to_v2' AND NEW."phase"='v2_open') OR
    (OLD."phase"='v2_open' AND NEW."phase" IN ('closing_to_v1','disabled')) OR
    (OLD."phase"='closing_to_v1' AND NEW."phase"='v1_open')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='WR007', MESSAGE='WR_SPEED_ACTIVATION_TRANSITION_REJECTED';
  END IF;
  IF OLD."phase" IN ('closing_to_v2','closing_to_v1') AND
     (NEW."targetReleaseId" IS DISTINCT FROM OLD."targetReleaseId" OR NEW."expectedReplicaCount" IS DISTINCT FROM OLD."expectedReplicaCount") THEN
    RAISE EXCEPTION USING ERRCODE='WR007', MESSAGE='WR_SPEED_ACTIVATION_TRANSITION_REJECTED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "speed_activation_transition_guard"
BEFORE UPDATE OR DELETE ON "SpeedLifecycleActivation" FOR EACH ROW EXECUTE FUNCTION wr_speed_activation_transition_guard();

CREATE FUNCTION wr_speed_activation_truncate_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='WR006', MESSAGE='WR_SPEED_ACTIVATION_CANONICAL_ROW_PROTECTED';
END;
$$;
CREATE TRIGGER "speed_activation_truncate_guard"
BEFORE TRUNCATE ON "SpeedLifecycleActivation" FOR EACH STATEMENT EXECUTE FUNCTION wr_speed_activation_truncate_guard();
