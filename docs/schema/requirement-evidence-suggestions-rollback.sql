START TRANSACTION;
ALTER TABLE public.requirement_evidence_events DROP CONSTRAINT "FK_requirement_evidence_events_requirements_other_requirement_~";

DROP TABLE public.requirement_evidence_suggestions;

DROP INDEX public."IX_requirement_evidence_events_other_requirement_id";

ALTER TABLE public.requirement_evidence_events DROP CONSTRAINT ck_requirement_evidence_events_action;

ALTER TABLE public.requirement_evidence_events DROP CONSTRAINT ck_requirement_evidence_events_move;

ALTER TABLE public.requirement_evidence_events DROP COLUMN other_requirement_id;

DELETE FROM public.requirement_evidence_events WHERE action = 'rejected';
UPDATE public.requirement_evidence_events SET action = 'added' WHERE action IN ('confirmed', 'moved_in');
UPDATE public.requirement_evidence_events SET action = 'removed' WHERE action = 'moved_out';

ALTER TABLE public.requirement_evidence_events ADD CONSTRAINT ck_requirement_evidence_events_action CHECK (action IN ('added', 'removed'));

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261106010723_RequirementEvidenceSuggestions';

COMMIT;

