# MathSystem Step 64.2 — Conditional Report Feedback (Phase 1)

Copy the three files in `src/` into the same paths in your current project, replacing the corresponding files. Back up the current versions first.

Changes:
- Adds optional teacher-configured report feedback rules to the existing Rubric tab.
- Each rule supports one or more conditions (AND/OR), overall percentage, saved practice scaled score, and correct/incorrect/unanswered counts.
- Rules include a title, feedback, and next-step recommendation.
- Enabled matching rules render on the student report and demo preview. Disabled rules do not.
- Rules are stored in the existing report template configuration. No schema migration or grading changes.
- Missing scaled scores never match scaled-score conditions.

Testing: Open Report Design > Score bands & study advice. Add a rule, enter feedback, enable it, preview and verify matching/nonmatching conditions, then save. Test global and assessment-specific scopes. Existing rubric tiers should remain unchanged.

Caveats:
- This is Phase 1. SAT/EST vs ACT scale-specific validation and a separate rule priority/default fallback are not yet implemented.
- Existing PDF export may use a separate rendering implementation and is not guaranteed to include these new feedback blocks. Unified PDF export is Step 64.3.
- Full TypeScript build and browser regression tests could not be completed in this environment.
