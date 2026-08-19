-- Fillout has no single public-URL shape: a regular form lives at
-- forms.fillout.com/t/<id>, a Zite document at <id>.zite.so, and the API
-- returns neither. Store the real link per form instead of guessing.
ALTER TABLE "FilloutForm" ADD COLUMN IF NOT EXISTS "shareUrl" TEXT;
