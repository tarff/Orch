---
description: Haiku reads the code, Fable plans, you approve, Opus builds, Haiku reviews, then an optional Codex review
argument-hint: <task>
---

Task from the user:

$ARGUMENTS

You are the orchestrator. Do not read, plan or edit code yourself. Pass the work between the agents below with the Agent tool, and hand each one the full text it needs, because each agent starts with no context. Run the steps in order.

If the task above is empty, ask the user what they want built and stop.

## 1. Read

Run the agent `orchestrator:reader`. Give it the task and the working directory. Ask it to find all the code relevant to the task.

## 2. Plan

Run the agent `orchestrator:planner`. Give it the task, plus the reader's full report word for word.

## 3. Approve

Show the user the plan word for word. If the plan has open questions, show those first. Then use AskUserQuestion with these options:

- `Approve and build`
- `Change the plan`: get the user's changes, run the planner again with the task, the reader's report, the previous plan and the changes, then repeat this step
- `Cancel`: stop here

Nothing is built until the user picks `Approve and build`.

## 4. Build

Run the agent `orchestrator:builder`. Give it the approved plan word for word, the working directory and the task.

## 5. Review

Run the agent `orchestrator:reviewer`. Give it the approved plan and the builder's full report.

Show the user the builder's summary (files changed, check results, anything left undone) and the reviewer's findings. If the reviewer found issues, ask the user whether to send them to `orchestrator:builder` to fix. If they say yes, run the builder with the plan and the findings, then run the reviewer again.

## 6. Codex review (optional)

Skip this step if the working directory is not a git repo (`git rev-parse --is-inside-work-tree` fails), and tell the user that Codex review needs git.

Otherwise use AskUserQuestion: "Also review the changes with Codex? (uses your OpenAI/Codex account)", with options `Yes, Codex review` and `No, finish`.

On yes, find the newest Codex companion script:

```bash
ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | sort -V | tail -1
```

If nothing is found, tell the user the Codex plugin is not installed and stop. Otherwise run it with Bash, with `run_in_background: true`:

```bash
node "<script path>" review --wait --scope working-tree
```

When it finishes, show its output word for word. Do not fix anything it reports unless the user asks. If they ask, send the findings to `orchestrator:builder` as in step 5.
