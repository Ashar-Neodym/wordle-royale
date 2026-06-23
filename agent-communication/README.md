# Wordle Royale — Agent Communication Hub

This folder is the shared handoff area for Athena and the specialist agents.

## Structure

```text
agent-communication/
  README.md
  index.md
  tickets/      # Athena-created task tickets for agents to read
  responses/    # Agent responses/output files go here
  archive/      # Old/superseded tickets or responses
```

## How Ashar should use this

Tell an agent:

> Open `agent-communication/tickets/ticket-XX-...md`, complete that ticket, and put your response as a `.md` file in `agent-communication/responses/`.

Example:

> Luna, see `agent-communication/tickets/ticket-03-luna-ux-flow-wireframe-plan.md` and put your answer in `agent-communication/responses/`.

## Rules for agents

- Do not send long answers directly in chat.
- Write a Markdown response file in `agent-communication/responses/`.
- If you change project files later, list exact files changed and commands/tests run.
- If this is a planning/spec ticket, it is acceptable to write `None — planning/spec task only` under tests.
- Do not invent files, APIs, commands, test results, deployments, or verification evidence.
