# @wordle-royale/word-tools

Dictionary fixture/import/validation tooling for Wordle Royale. Ticket 20 implements only safe, hand-curated fixture generation. Production dictionary imports remain blocked until source licensing is approved.

## Commands

```bash
pnpm --filter @wordle-royale/word-tools test
pnpm word:fixture:build
pnpm --filter @wordle-royale/word-tools word:validate -- --input packages/word-tools/data/fixtures/manifest.fixture.json
```

Generated fixture artifacts:

- `data/fixtures/en-5-test-answer-vfixture.001.json`
- `data/fixtures/en-5-test-guess-vfixture.001.json`
- `data/fixtures/en-5-test-banned-vfixture.001.json`
- `data/fixtures/manifest.fixture.json`
- `data/reports/en-5-test-vfixture.001.validation-report.json`

Validation catches invalid word length/format, duplicates, missing answer/guess separation, and banned-list conflicts.
