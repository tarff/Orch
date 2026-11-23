# Orch

A Claude Code plugin that adds one command, `/orch:run`. You give it a task, and it passes the work between four agents, each running on the model that suits its job:

- **Haiku** reads your code and reports what is relevant.
- **Fable** writes a step-by-step plan, where every step has a check that proves it worked.
- **You** approve the plan. Nothing is built until you do.
- **Opus** builds the approved plan, with a fresh builder for each step.
- **Haiku** reviews each step, then the whole build, against the plan and re-runs the checks.

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
- [License](#license)

## Requirements

- **Claude Code** with access to the Fable, Opus and Haiku models. Tested on Claude Code 2.1.326 on Windows.
- **Node.js** on your PATH. The plugin's write guard is a small Node script.
- **The [Superpowers](https://github.com/obra/superpowers) plugin.** The builder starts with two of its skills loaded: `test-driven-development` and `verification-before-completion`. Installing Orch does not install it or warn that it is missing. See [Install](#install).
- **Optional, for Codex reviews:** the [openai-codex](https://github.com/openai/codex-plugin-cc) plugin and an OpenAI/Codex account. The code review after the build also needs the project to be a git repo. See [Codex reviews](#codex-reviews).

## Install

Install Superpowers first, if you do not have it:

```
claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace
```

Then Orch, from GitHub:

```
claude plugin marketplace add tarff/Orch
claude plugin install orch@orch
```

Or from a copy on your own machine, using the folder's full path:

```
claude plugin marketplace add "<path to this folder>"
claude plugin install orch@orch
```

For Codex reviews, also install the Codex plugin:

```
claude plugin marketplace add openai/codex-plugin-cc
claude plugin install codex@openai-codex
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

If you are not yet sure what to build, settle that first. The Superpowers `brainstorming` skill works through the design with you, one question at a time, and writes a design document. Then give `/orch:run` the design document as the task, for example:

```
/orch:run Build the design in docs/plans/2026-01-01-export-dry-run-design.md
```

The plugin does not brainstorm itself. Its planner runs in the background and cannot ask you questions, so the design should be settled before the run starts.

## What happens

| Step | What it does | Who runs it |
| --- | --- | --- |
| 0. Set up | Makes a folder for this run and, in a git repo, records where the code started. | The main session |
| 1. Read | Finds the files, functions and conventions relevant to the task, quoting the real code. Saves its report to the run folder. | Haiku (`orch:reader`) |
| 2. Plan | Writes a numbered plan. Each step names the files, the change, and a check that proves it worked. Saves it to the run folder. | Fable (`orch:planner`) |
| 3. Approve | Shows you the plan word for word, open questions first, and waits for your choice. | You |
| 4. Build | Builds the plan one step at a time. Each step gets a new builder, which runs that step's check, and then a reviewer for that step. If a step needs your decision, you are asked before or during it. | Opus (`orch:builder`), Haiku (`orch:reviewer`) |
| 5. Final review | Checks the whole build against the plan, re-runs every check, and looks for problems between steps. Quotes the code for every problem it reports. Never edits. | Haiku (`orch:reviewer`) |
| 6. Codex review (optional) | Asks whether you also want Codex to review the code. | Codex, through the openai-codex plugin |

The main session only passes work between the agents. It does not read, plan or edit code itself. The agents pass their reports and plans to each other by file path, so the main chat does not have to retype them.

Each builder holds only its own step, the plan and the earlier steps' reports, so no builder's context grows to cover the whole build. A single step can still use a lot of context: see [Known limits](#known-limits). Each builder saves a report to the run folder, and later builders read those reports to know what is already done.

If a step needs a choice from you, such as a time limit that has to be measured first or wording you must approve, the planner marks it "Needs your decision" and you are asked before that step starts. If a builder hits a choice the plan did not foresee, it stops and you are asked. Your answer goes back to the same builder, which carries on with that step.

If a reviewer finds problems, you are asked whether to send them back. If you say yes, the same builder fixes them and the same reviewer checks the fixes, each carrying on with what it already knows. After the final review, fixes go to one new builder, and the final reviewer checks them. This repeats for as long as problems remain and you want them fixed.

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
| `build-step-1.md`, `build-step-2.md` and so on | Each step's builder report: files changed, check output, and notes for later steps |
| `build-fixes.md` | The report from fixes after the final review, if any |
| `build-step-1-before.txt` and so on | A fingerprint of a builder's report, taken before it is asked for more work |

## Safeguards

- **Only the builder edits your code.** The reader and planner can read and search, and can write only inside `~/.claude/orch/`. A hook in this plugin blocks any write they try anywhere else, including writes through links that point outside that folder. The reviewer can also run commands, which it uses only to read git state and re-run checks.
- **Rewrites of the plan are checked.** The orchestrator records the plan file's fingerprint before asking for a rewrite and compares it afterwards. If the file has not changed, the planner is told to save it again, and if it still has not changed you are told. You never see the old plan presented as the new one. This exists because a planner was once seen reporting a save that had failed.
- **Builder reports are checked the same way** whenever a builder is sent back to do more work, because builders were seen doing the same thing. Later builders rely on those reports.
- **Each builder sticks to its step.** It does only that step and changes only the files the plan names. If the step cannot be done as written, it stops and reports rather than making up a different design. It never makes a choice the plan leaves to you.
- **The builder does not commit, push, delete files or install packages** unless the plan says to. When a plan step installs packages, the builder follows any rules your CLAUDE.md files give for installs. If they give none, it runs the install through `sfw` ([Socket Firewall](https://socket.dev/)) when you have it, and as the plan has it when you do not.
- **The builder is told never to load your machine heavily,** for example with load generators or stress tests, even if the plan asks for it. It stops and asks instead. This is an instruction and nothing enforces it. It exists because a measurement of that kind once froze a PC.
- **The reviewer must quote the code** for every problem it reports, and may only give line numbers it has just read. A finding without a quote does not count.

## Updating

Claude Code runs an installed copy of the plugin, not the folder or repo itself. To pick up a new version:

```
claude plugin marketplace update orch
claude plugin update orch@orch
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

- **Full runs have only been done on Windows.** The write guard has also been checked on Ubuntu 24.04 and works there. Nothing has been tested on macOS. The test's cases use Windows paths, and one of the 16 fails on Linux because it expects file names to ignore upper and lower case.
- **Reviews miss things.** The per-step reviews often find real bugs. But after one 31-step build passed every step review and the final review, an outside review found six more real problems, one of them serious. Have someone or something else review the result too, such as Codex.
- **Agents can use a lot of context.** On two builds of a large project, most builders went past 200,000 tokens (31 of 36, and 14 of 18 with the second build still running), and the planner reached 654,000. It has not been tested with models limited to 200,000.
- **Long plans may not be shown in full.** The command asks for the plan word for word, but with an 850-line plan the main session showed only the questions and a list of steps. Read `plan.md` in the run folder before approving.
- **Some questions may come late.** A planner can mark a question as needing an answer later in the build, and it may not be asked when you approve. Look for these in `plan.md`.
- **A step's check may be too narrow.** It usually runs only that step's tests, so one step can break another's and not be noticed until later. Run the full tests at the end.
- **Codex cannot review the first commits of a brand-new repo.** Its code review compares against the commit the run started from. If the repo had no commits when the run started, there is nothing to compare against, and you are told so. Uncommitted changes are still reviewed.
- **The run uses many agents,** so it costs more tokens than doing a small task directly. A plan with 12 steps starts about 25: a builder and a reviewer per step, plus the final reviewer. Each one reads the plan and the files it needs before it starts. It is meant for changes big enough that a reviewed plan is worth having.

## License

[MIT](LICENSE)
