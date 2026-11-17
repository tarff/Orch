# orch

A Claude Code plugin that adds one command. You give it a task, and it passes the work between four agents: one reads the code, one writes a plan, one builds it, and one reviews the result. Nothing is built until you approve the plan.

## Usage

```
/orch:run <task>
```

Plugin commands carry the plugin name in front, so type `/orch:run`, not `/run`. Claude Code has its own built-in `/run`, which launches your app instead.

If you leave the task empty, the command asks what you want built and stops.

## What happens

| Step | What it does | Who runs it |
| --- | --- | --- |
| 1. Read | Finds the files, functions and conventions relevant to the task. Saves its report to the run folder. | Haiku (`orch:reader`) |
| 2. Plan | Writes a numbered plan where each step has a check that proves it worked. Saves it to the run folder. | Fable (`orch:planner`) |
| 3. Approve | Shows you the plan. You pick "Approve and build", "Change the plan" or "Cancel". | You |
| 4. Build | Carries out the approved plan step by step and runs each check. | Opus (`orch:builder`) |
| 5. Review | Checks the changes against the plan, re-runs the checks, and quotes the code for every problem it reports. Never edits. | Haiku (`orch:reviewer`) |
| 6. Codex review (optional) | Asks whether you also want a review from Codex. | Codex, through the openai-codex plugin |

Notes:

- Each run gets a folder at `~/.claude/orch/<project>/<date>-<task>/` holding `reader.md` and `plan.md`. Agents pass these by path instead of the main chat retyping them, and they stay there as a record.
- The builder is the only agent that edits your code. It has all tools. The reader and planner can read and search, and write only inside `~/.claude/orch/`. A hook in this plugin blocks any write they try anywhere else. The reviewer can also run commands, which it uses to read git state and re-run checks.
- The builder starts with the Superpowers skills `test-driven-development` and `verification-before-completion` loaded, and uses them only inside the plan's steps. This needs the Superpowers plugin.
- The builder does not commit, push, delete files or install packages unless the plan says to.
- If the reviewer finds issues, you are asked whether to send them back to the builder. If you say yes, the same builder and reviewer carry on with what they already know, instead of new ones starting from scratch.
- Codex findings are shown when the review finishes. Nothing is fixed unless you ask. After a fix you are offered another Codex review, until you choose to finish.

## Install

Add this folder as a local marketplace, then install the plugin from it. Replace the path with wherever this folder lives on your machine.

```
claude plugin marketplace add "C:\proj\claude-orchestrator"
claude plugin install orch@orchestrator-local
```

Then run `/reload-plugins` or restart Claude Code.

## Tests

The hook that blocks reader and planner writes has a test. Run it from this folder:

```
node tests/guard-write.test.js
```

It runs the hook against 16 cases, including real junctions inside the allowed folder, and prints `PASS` or `FAIL` for each. It exits with 0 if all pass and 1 if any fail. It needs only Node, and the cases use Windows paths.

## Codex review requirements

Step 6 is optional. It needs two things:

- **A git repo.** If the folder you are working in is not a git repo, the step is skipped and you are told that Codex review needs git.
- **The openai-codex plugin.** The command looks for its script at `~/.claude/plugins/cache/openai-codex/codex/<version>/scripts/codex-companion.mjs`. If it is not there, you are told the Codex plugin is not installed and the step stops.

It reviews any commits made during the run and any uncommitted changes. If the folder already had uncommitted changes before the run, you are told that Codex will review those too.

The review runs on your OpenAI/Codex account, and you are asked before it starts.
