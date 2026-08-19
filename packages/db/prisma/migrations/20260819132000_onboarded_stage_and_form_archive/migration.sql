-- Add the "Onboarded" pipeline stage between Onboarding and Placed.
-- Postgres cannot add an enum value and use it in the same transaction, so this
-- migration only declares it; nothing here writes a row with the new value.
ALTER TYPE "InterestStatus" ADD VALUE IF NOT EXISTS 'ONBOARDED' BEFORE 'PLACED';

-- Per-form settings we keep on our side. Fillout's API has no notion of a
-- deadline or an archive, so a form that has outlived its event is retired here.
CREATE TABLE IF NOT EXISTS "FilloutForm" (
    "filloutFormId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilloutForm_pkey" PRIMARY KEY ("filloutFormId")
);
