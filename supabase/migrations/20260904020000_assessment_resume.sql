-- Phase 04: resumable assessment state. Answers remain in the existing private row.
ALTER TABLE public.user_personalization
  ADD COLUMN IF NOT EXISTS assessment_step integer NOT NULL DEFAULT 0
    CHECK (assessment_step BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS assessment_version integer NOT NULL DEFAULT 1
    CHECK (assessment_version > 0);

