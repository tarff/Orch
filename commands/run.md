---
description: Haiku reads the code, Fable plans, you approve, Opus builds, Haiku reviews, then an optional Codex review
argument-hint: <task>
---

Task from the user:

$ARGUMENTS

You are the orchestrator. Do not read, plan or edit code yourself. Pass the work between the agents below. Each new agent starts with no context, so tell it everything it needs, but pass reports and plans by file path, not by retyping them. Run the steps in order.

If the task above is empty, ask the user what they want built and stop.

## 0. Run folder

Make a folder for this run with Bash:

```bash
mkdir -p ~/.claude/orch/<project>/<YYYY-MM-DD>-<task-slug>
```

`<project>` is the working directory's folder name. `<task-slug>` is three to five lowercase words from the task, joined with hyphens. If the folder already exists, add `-2`, `-3` and so on. Use the folder's full absolute path everywhere below, written out as `<run>`.

If the working directory is a git repo, record where it started, for the Codex step:

```bash
git rev-parse HEAD > <run>/start-commit.txt 2>/dev/null || echo none > <run>/start-commit.txt
git status --porcelain > <run>/start-status.txt
```

## 1. Read

Run the agent `orch:reader`. Give it the task, the working directory and the path `<run>/reader.md`. Ask it to find all the code relevant to the task, save its full report to that file, and reply with a short summary only.

## 2. Plan

Run the agent `orch:planner`. Give it the task, the working directory, the path `<run>/reader.md` to read, and the path `<run>/plan.md` to write.

## 3. Approve

Read `<run>/plan.md` and show the user the plan word for word, with any open questions first. Give the folder path too. Then use AskUserQuestion with these options:

- `Approve and build`
- `Change the plan`: get the user's changes, send them to the same planner with SendMessage (it keeps its context) so it rewrites `<run>/plan.md`, then repeat this step
- `Cancel`: stop here

Nothing is built until the user picks `Approve and build`.

## 4. Build

Run the agent `orch:builder`. Give it the task, the working directory and the path `<run>/plan.md`. Tell it the plan is approved. Keep its agent ID.

## 5. Review

Run the agent `orch:reviewer`. Give it the task, the working directory, the path `<run>/plan.md` and the builder's full report. Keep its agent ID.

Show the user the builder's summary (files changed, check results, anything left undone) and the reviewer's findings. If the reviewer found issues, ask the user whether to send them to the builder to fix.

If they say yes, send the findings to the same builder with SendMessage (it keeps its context). When it reports back, send its report to the same reviewer with SendMessage and ask it to check the fixes. Repeat while issues remain and the user wants fixes. Start a new agent only if SendMessage fails, and pass it the plan path, the findings and the earlier reports.

## 6. Codex review (optional)

Skip this step if the working directory is not a git repo (`git rev-parse --is-inside-work-tree` fails), and tell the user that Codex review needs git.

Otherwise use AskUserQuestion: "Also review the changes with Codex? (uses your OpenAI/Codex account)", with options `Yes, Codex review` and `No, finish`.

On yes, find the newest Codex companion script:

```bash
ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | sort -V | tail -1
```

If nothing is found, tell the user the Codex plugin is not installed and stop.

The Codex script reviews either commits or uncommitted changes, not both at once, so pick what this run left behind:

- **New commits**: if `git rev-parse HEAD` differs from `<run>/start-commit.txt`, and that file isn't `none`, review them:
  ```bash
  node "<script path>" review --wait --base <start commit>
  ```
- **Uncommitted changes**: if `git status --porcelain` prints anything, review them:
  ```bash
  node "<script path>" review --wait --scope working-tree
  ```
  If `<run>/start-status.txt` is not empty, tell the user first that the folder already had uncommitted changes before this run, and Codex will review those too.

Run each review that applies with Bash, with `run_in_background: true`, one after the other. If neither applies, tell the user there is nothing for Codex to review.

When each finishes, show its output word for word. Do not fix anything it reports unless the user asks. If they ask, send the findings to the builder and then the reviewer, as in step 5. After those fixes, ask again with the same two options. Repeat until the user picks `No, finish`.
