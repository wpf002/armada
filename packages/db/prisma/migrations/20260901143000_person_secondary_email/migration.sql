-- A second address for people who give out both a work and a personal one.
-- Deliberately NOT unique: it is contact data, never an identity key.
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "secondaryEmail" TEXT;
