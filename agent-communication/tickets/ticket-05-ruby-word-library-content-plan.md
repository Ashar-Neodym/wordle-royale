# Ticket 5 — Dictionary, Word Library, and Content Moderation Plan

**Assigned agent:** Ruby  
**Priority:** P0  
**Depends on:** Elisa PRD and Architecture/API Contract; Freya scoring spec helpful but not required

## Context

Ashar specifically emphasized that Wordle Royale must have a **very extensive library of words**.

The word system is product-critical. Bad, obscure, offensive, incorrectly categorized, or poorly balanced words can damage trust quickly.

Architecture direction includes:

- `word_entries`
- `word_lists`
- `word_list_entries`
- answer lists
- valid guess lists
- banned/excluded lists
- difficulty metadata
- dictionary versioning
- admin activation/deactivation

## Objective

Design the word-library/content system and tooling plan.

## Scope

Cover:

- Word list sourcing.
- Licensing considerations.
- Answer words vs accepted guess words.
- Banned/excluded words.
- Difficulty classification.
- Frequency/commonness scoring.
- Offensive/profane/slur filtering.
- Proper noun filtering.
- Plural/inflection policy.
- Regional spelling policy.
- Versioned dictionaries.
- Admin review workflow.
- Import/update tooling.
- Validation scripts.
- Data model refinements if needed.
- Future language/category expansion.

## Acceptance criteria

Your `.md` response must include:

1. Recommended word-list sources.
2. Licensing notes and risks.
3. Proposed answer-list size target.
4. Proposed valid-guess-list size target.
5. Difficulty tiering model.
6. Metadata fields for each word.
7. Offensive/sensitive word filtering approach.
8. Review workflow for activating/deactivating words.
9. Versioning strategy.
10. Import pipeline design.
11. Validation rules.
12. Admin tooling requirements.
13. Analytics loop for improving difficulty using gameplay data.
14. Follow-up implementation tickets.

## Deliverable back to Athena

Return a Markdown file named similar to:

`wordle-royale-word-library-content-plan.md`

---

---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use this filename pattern:

`ticket-XX-agentname-short-title-response.md`

Use this response format:

```markdown
# [Ticket Title] — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

Do not invent files, commands, tests, outputs, deployments, or verification evidence.
