# Orch

A Claude Code plugin that adds one command, `/orch:run`. You give it a task, and it passes the work between four agents, each running on the model that suits its job:

- **Haiku** reads your code and reports what is relevant.
- **Fable** writes a step-by-step plan, where every step has a check that proves it worked.
- **You** approve the plan. Nothing is built until you do.
- **Opus** builds the approved plan, one step at a time.
- **Haiku** reviews the result against the plan and re-runs the checks.

You can also have Codex review the plan before it is built, and review the code after.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
- [What happens](#what-happens)
- [The approval step](#the-approval-step)
- [Codex reviews](#codex-reviews)
- [The run folder](#the-run-folder)
- [Safeguards](#safeguards)
- [Updating](#updating)
- [Development](#development)
- [Known limits](#known-limits)

## Requirements

- **Claude Code** with access to the Fable, Opus and Haiku models. Tested on Claude Code 2.1.326 on Windows.
- **Node.js** on your PATH. The plugin's write guard is a small Node script.
- **The [Superpowers](https://github.com/obra/superpowers) plugin.** The builder starts with two of its skills loaded: `test-driven-development` and `verification-before-completion`.
- **Optional, for Codex reviews:** the openai-codex plugin and an OpenAI/Codex account. The code review after the build also needs the project to be a git repo. See [Codex reviews](#codex-reviews).

## Install

From GitHub:

```
claude plugin marketplace add tarff/Orch
claude plugin install orch@orchestrator-local
```

Or from a copy on your own machine, using the folder's full path:

```
claude plugin marketplace add "<path to this folder>"
claude plugin install orch@orchestrator-local
```

Then run `/reload-plugins` or restart Claude Code. The same commands work inside Claude Code as `/plugin marketplace add ...` and `/plugin install ...`.

## Usage

```
/orch:run <task>
```

For example:

```
/orch:run Add a --dry-run flag to the export command that prints what would be written without writing it
```

Plugin commands carry the plugin's name in front, so type `/orch:run`, not `/run`. Claude Code has its own built-in `/run`, which launches your app instead.

If you leave the task empty, the command asks what you want built and stops.

## What happens

| Step | What it does | Who runs it |
| --- | --- | --- |
| 0. Set up | Makes a folder for this run and, in a git repo, records where the code started. | The main session |
| 1. Read | Finds the files, functions and conventions relevant to the task, quoting the real code. Saves its report to the run folder. | Haiku (`orch:reader`) |
| 2. Plan | Writes a numbered plan. Each step names the files, the change, and a check that proves it worked. Saves it to the run folder. | Fable (`orch:planner`) |
| 3. Approve | Shows you the plan word for word, open questions first, and waits for your choice. | You |
| 4. Build | Carries out the approved plan in order and runs each step's check. | Opus (`orch:builder`) |
| 5. Review | Checks the changes against the plan, re-runs the checks, and quotes the code for every problem it reports. Never edits. | Haiku (`orch:reviewer`) |
| 6. Codex review (optional) | Asks whether you also want Codex to review the code. | Codex, through the openai-codex plugin |

The main session only passes work between the agents. It does not read, plan or edit code itself. The agents pass their reports and plans to each other by file path, so the main chat does not have to retype them.

If the reviewer finds problems, you are asked whether to send them back to the builder. If you say yes, the same builder fixes them and the same reviewer checks the fixes, each carrying on with what it already knows. This repeats for as long as problems remain and you want them fixed.

## The approval step

After the plan is written you get four choices:

- **Approve and build**: the builder starts.
- **Change the plan**: you say what to change, and the same planner rewrites the plan. You then see the new plan and choose again.
- **Review the plan with Codex**: Codex checks the plan against your code before anything is built. See below.
- **Cancel**: stops the run. Nothing has been changed in your project.

## Codex reviews

Both reviews use your OpenAI/Codex account, and you are asked before either one starts. Codex's reply is always shown word for word, and nothing is changed because of it unless you ask.

**Plan review, at the approval step.** Codex reads your code without changing anything, and checks the plan for:

- steps that rely on code that does not exist or works differently
- missing steps, steps in the wrong order, and checks that would not prove their step worked
- risks the plan does not mention

If you want changes, Codex's points go to the same planner, which rewrites the plan, and you are back at the approval step. The plan review does not need git.

**Code review, after the build.** This needs:

- **A git repo.** If the project is not one, the step is skipped and you are told why.
- **The openai-codex plugin.** The command looks for its script at `~/.claude/plugins/cache/openai-codex/codex/<version>/scripts/codex-companion.mjs`. If it is not there, you are told the plugin is not installed.

It reviews any commits made during the run and any uncommitted changes. If the project already had uncommitted changes before the run, you are told first that Codex will review those too. After any fixes you are offered another Codex review, until you choose to finish.

## The run folder

Each run gets its own folder at `~/.claude/orch/<project>/<date>-<task>/`. It is outside your project, so nothing from the run ends up in your repo. It stays there afterwards as a record of the run.

| File | What it holds |
| --- | --- |
| `reader.md` | The reader's full report on the relevant code |
| `plan.md` | The plan, rewritten in place if you ask for changes |
| `start-commit.txt`, `start-status.txt` | Where a git repo started, so the Codex review knows what the run changed |
| `codex-plan-review.md` | What was sent to Codex for a plan review, if you asked for one |
| `plan-before.txt` | A fingerprint of the plan, taken before a rewrite |

## Safeguards

- **Only the builder edits your code.** The reader and planner can read and search, and can write only inside `~/.claude/orch/`. A hook in this plugin blocks any write they try anywhere else, including writes through links that point outside that folder. The reviewer can also run commands, which it uses only to read git state and re-run checks.
- **Rewrites of the plan are checked.** The orchestrator records the plan file's fingerprint before asking for a rewrite and compares it afterwards. If the file has not changed, the planner is told to save it again, and if it still has not changed you are told. You never see the old plan presented as the new one. This exists because a planner was once seen reporting a save that had failed.
- **The builder sticks to the plan.** It does the steps in order and changes only the files the plan names. If a step cannot be done as written, it stops and reports rather than making up a different design.
- **The builder does not commit, push, delete files or install packages** unless the plan says to. When a plan step installs packages, the builder runs the install through `sfw` ([Socket Firewall](https://socket.dev/)). If you do not use `sfw`, see [Known limits](#known-limits).
- **The reviewer must quote the code** for every problem it reports, and may only give line numbers it has just read. A finding without a quote does not count.

## Updating

Claude Code runs an installed copy of the plugin, not the folder or repo itself. To pick up a new version:

```
claude plugin marketplace update orchestrator-local
claude plugin update orch@orchestrator-local
```

Then run `/reload-plugins` or restart Claude Code.

## Development

```
.claude-plugin/
  plugin.json         plugin name, version and description
  marketplace.json    the marketplace this repo provides
agents/
  reader.md           Haiku: reads the code
  planner.md          Fable: writes the plan
  builder.md          Opus: builds it
  reviewer.md         Haiku: reviews it
commands/
  run.md              /orch:run: the steps the main session follows
hooks/
  hooks.json          runs the write guard before every Write or Edit
  guard-write.js      blocks reader and planner writes outside ~/.claude/orch/
tests/
  guard-write.test.js
```

If you change the plugin, raise the version in both `plugin.json` and `marketplace.json`. Otherwise `claude plugin update` will not pick the change up.

### Tests

The write guard has a test. Run it from this folder:

```
node tests/guard-write.test.js
```

It runs the hook against 16 cases, including real links inside the allowed folder that point outside it, and prints `PASS` or `FAIL` for each. It exits with 0 if all pass and 1 if any fail. It needs only Node.

## Known limits

- **Tested on Windows only.** The test cases use Windows paths, so the test needs changes before it will pass on macOS or Linux.
- **`sfw` is assumed for package installs.** The builder puts `sfw` in front of any install command a plan includes. Without `sfw` installed, that install command fails.
- **Codex cannot review the first commits of a brand-new repo.** Its code review compares against the commit the run started from. If the repo had no commits when the run started, there is nothing to compare against, and you are told so. Uncommitted changes are still reviewed.
- **The run uses several agents,** so it costs more tokens than doing a small task directly. It is meant for changes big enough that a reviewed plan is worth having.
