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
mkdir -p "$HOME/.claude/orch/<project>/<YYYY-MM-DD>-<task-slug>"
```

`<project>` is the working directory's folder name. `<task-slug>` is three to five lowercase words from the task, joined with hyphens. If the folder already exists, add `-2`, `-3` and so on. Use the folder's full absolute path everywhere below, written out as `<run>`. Folder names can contain spaces, so always put `<run>` in double quotes in shell commands.

If the working directory is a git repo, record where it started, for the Codex step:

```bash
git rev-parse HEAD > "<run>/start-commit.txt" 2>/dev/null || echo none > "<run>/start-commit.txt"
git status --porcelain > "<run>/start-status.txt"
```

## 1. Read

Run the agent `orch:reader`. Give it the task, the working directory and the path `<run>/reader.md`. Ask it to find all the code relevant to the task, save its full report to that file, and reply with a short summary only.

## 2. Plan

Run the agent `orch:planner`. Give it the task, the working directory, the path `<run>/reader.md` to read, and the path `<run>/plan.md` to write.

## 3. Approve

Read `<run>/plan.md` and show the user the plan word for word, with any open questions first. Give the folder path too. Then use AskUserQuestion with these options:

- `Approve and build`
- `Change the plan`: get the user's changes, send them to the same planner with SendMessage (it keeps its context) so it rewrites `<run>/plan.md`, check the rewrite (see below), then repeat this step
- `Review the plan with Codex` (uses your OpenAI/Codex account): see below, then repeat this step
- `Cancel`: stop here

Nothing is built until the user picks `Approve and build`.

### Codex plan review

Find the Codex script with the `ls` command in step 6. If nothing is found, tell the user the Codex plugin is not installed and repeat this step.

Write `<run>/codex-plan-review.md` with exactly this text, with the task and working directory filled in:

    Review this build plan before anything is built. Do not edit any files.

    Task: <task>
    Working directory: <working directory>

    Check the plan against the real code in the working directory. Report:
    - steps that rely on files, functions or behaviour that do not exist or work differently
    - missing steps, steps in the wrong order, or checks that would not prove their step worked
    - risks the plan does not mention

    For each point, give the plan step number and, where it applies, path:line with a quote of the code. If the plan is sound, say so.

    The plan follows.

Then add the plan to it and run the review with Bash, with `run_in_background: true`:

```bash
cat "<run>/plan.md" >> "<run>/codex-plan-review.md"
node "<script path>" task --fresh --prompt-file "<run>/codex-plan-review.md"
```

There is no `--write`, so Codex runs read-only. When it finishes, show its output word for word. Do not change the plan unless the user asks. If they ask, send Codex's points, plus any of their own, to the same planner with SendMessage so it rewrites `<run>/plan.md`. Check the rewrite (see below), then repeat this step.

### Checking a rewrite

Before each SendMessage that asks the planner to rewrite the plan, record the plan's fingerprint:

```bash
cksum "<run>/plan.md" > "<run>/plan-before.txt"
```

When the planner replies, run `cksum "<run>/plan.md"` and compare it with `<run>/plan-before.txt`. If they match, the plan file did not change, whatever the planner says. Tell the planner with SendMessage that its rewrite did not reach the file, and to Read the file and then save it again. Check again when it replies. If the file still has not changed, tell the user, and do not show the old plan as if it were the new one.

## 4. Build, one step at a time

Each step of the plan gets its own new `orch:builder`, so no builder carries the whole build in its context. For each step N, in order:

1. **Ask first if needed.** If the plan marks step N "Needs your decision", ask the user with AskUserQuestion before starting it. Show the plan's question and any measurements that earlier step reports recorded for it.
2. **Build.** Run a new `orch:builder`. Give it the task, the working directory, `<run>/plan.md`, the step number N, the paths of the earlier step reports (`<run>/build-step-1.md` and so on), the path `<run>/build-step-N.md` to save its report to, and the user's answer if there was one. Tell it the plan is approved and to do step N only. Keep its agent ID.
3. **Check the report was saved.** If `<run>/build-step-N.md` does not exist, tell the builder with SendMessage to save it. If it is still missing, tell the user.
4. **If the builder stopped:**
   - for a choice the plan left to the user: ask the user, then send the answer to the same builder with SendMessage so it carries on with that step, and check its report was updated (see below)
   - because the step can't be done as written: show the user its report and ask `Change the plan` (to the planner, as in step 3, then restart this step with a new builder) or `Stop the build`
5. **Review the step.** Run a new `orch:reviewer` with the task, the working directory, the plan path, the step number and `<run>/build-step-N.md`. Show the user the builder's summary and the reviewer's findings. If there are findings, ask whether to send them to the builder. If yes, send them to the same builder with SendMessage, check its report was updated (see below), then send its reply to the same reviewer with SendMessage to check the fixes. Repeat while issues remain and the user wants fixes.

Then go on to step N+1.

If SendMessage to a builder or reviewer fails, start a new one and give it the plan path, the step number, the step reports and the findings.

### Checking a report was updated

Later builders rely on these reports. Before each SendMessage that asks a builder for more work, record its report's fingerprint:

```bash
cksum "<run>/build-step-N.md" > "<run>/build-step-N-before.txt"
```

When the builder replies, run `cksum "<run>/build-step-N.md"` and compare it with that file. If they match, the report did not change, whatever the builder says. Tell the builder with SendMessage that its report did not reach the file, and to Read the file and then save it again. Check again when it replies. If the file still has not changed, tell the user, and put the builder's reply in the prompts of the builders and reviewers that need it.

## 5. Final review

When every step is done, run one new `orch:reviewer` for the whole build, with the task, the working directory, the plan path and all the step reports. Ask it to re-run every step's check and to look for problems between steps. Keep its agent ID. Show the user its findings.

If the user wants fixes, run a new `orch:builder` with the task, the working directory, the plan path, the step reports and the findings. Tell it to fix only those and to save its report to `<run>/build-fixes.md`. Then send that report to the same final reviewer with SendMessage to check the fixes. Further rounds go to the same fix builder and final reviewer with SendMessage, and `<run>/build-fixes.md` is checked the same way as a step report (step 4). Repeat while issues remain and the user wants fixes.

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
  If the file is `none` but `git rev-parse HEAD` now succeeds, the repo had no commits when the run started and the run made the first ones. The Codex script needs a starting commit to compare against, so it cannot review those. Tell the user that plainly, and still review uncommitted changes below if there are any.
- **Uncommitted changes**: if `git status --porcelain` prints anything, review them:
  ```bash
  node "<script path>" review --wait --scope working-tree
  ```
  If `<run>/start-status.txt` is not empty, tell the user first that the folder already had uncommitted changes before this run, and Codex will review those too.

Run each review that applies with Bash, with `run_in_background: true`, one after the other. If neither applies, and you have not already told the user about a repo with no starting commit, tell the user there is nothing for Codex to review.

When each finishes, show its output word for word. Do not fix anything it reports unless the user asks. If they ask, send the findings to the fix builder (starting one as in step 5 if there is none yet) and then the final reviewer, as in step 5. After those fixes, ask again with the same two options. Repeat until the user picks `No, finish`.
