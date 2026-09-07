-- Armada's discipleship path is five steps; this adds the missing fourth-from-
-- last one. Declared only — nothing here writes a row with the new value, which
-- Postgres forbids inside the same transaction.
ALTER TYPE "InterestStatus" ADD VALUE IF NOT EXISTS 'SIGNED_UP_ONBOARDING' BEFORE 'ONBOARDED';
