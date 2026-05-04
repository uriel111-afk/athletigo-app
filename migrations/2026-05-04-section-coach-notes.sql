-- Coach-authored notes attached to a single training_section row.
-- Surfaced in SectionCard's expanded edit-mode panel as a textarea
-- under the exercise list; saved on blur via supabase.update.

ALTER TABLE public.training_sections
  ADD COLUMN IF NOT EXISTS coach_notes TEXT;

COMMENT ON COLUMN public.training_sections.coach_notes IS
  'Free-text coach notes attached to this section (e.g. "Focus on form, not weight"). Editable inline from the SectionCard expanded panel when canEdit is true.';
