// Runs hooks/guard-write.js against known inputs and checks its exit code (0 = allow, 2 = block).
// Run with: node tests/guard-write.test.js. Exits 1 if any case fails. The cases use Windows paths.
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const hook = path.join(__dirname, "..", "hooks", "guard-write.js");
const H = os.homedir();
const run = (input) =>
  spawnSync("node", [hook], { input: typeof input === "string" ? input : JSON.stringify(input) });
const mk = (agent, file, cwd = "C:\\proj\\x") => ({ agent_type: agent, cwd, tool_input: { file_path: file } });

const cases = [
  ["planner inside run folder", mk("orch:planner", path.join(H, ".claude", "orch", "p", "2026-11-18-x", "plan.md")), 0],
  ["planner forward slashes, odd case", mk("orch:planner", path.join(H, ".Claude", "ORCH", "p", "plan.md").toUpperCase().replace(/\\/g, "/")), 0],
  ["planner writing into repo", mk("orch:planner", "C:\\proj\\x\\README.md"), 2],
  ["planner writing C:\\x.md, no cwd", { agent_type: "orch:planner", tool_input: { file_path: "C:\\x.md" } }, 2],
  ["planner relative path", mk("orch:planner", "plan.md"), 2],
  ["reader ../ escape", mk("orch:reader", path.join(H, ".claude", "orch") + "\\..\\settings.json"), 2],
  ["reader look-alike folder", mk("orch:reader", path.join(H, ".claude", "orchestra", "x.md")), 2],
  ["reader writing the root itself", mk("orch:reader", path.join(H, ".claude", "orch")), 2],
  ["planner empty path", mk("orch:planner", ""), 2],
  ["builder writing into repo", mk("orch:builder", "C:\\proj\\x\\a.py"), 0],
  ["main session (no agent_type)", { cwd: "C:\\x", tool_input: { file_path: "C:\\x\\a.py" } }, 0],
  ["other plugin's planner", mk("planner", "C:\\proj\\x\\a.py"), 0],
  ["bad JSON input", "not json", 0],
];

// Real junctions inside the allowed folder: one pointing outside it, one pointing at a folder
// that does not exist. Writes through either must be blocked. Removed again at the end.
const linkDir = path.join(H, ".claude", "orch", `_guard-test-${process.pid}`);
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "guard-outside-"));
fs.mkdirSync(linkDir, { recursive: true });
fs.symlinkSync(outside, path.join(linkDir, "to-outside"), "junction");
fs.symlinkSync(path.join(outside, "missing"), path.join(linkDir, "dangling"), "junction");
cases.push(
  ["planner through junction to outside", mk("orch:planner", path.join(linkDir, "to-outside", "x.md")), 2],
  ["planner through dangling junction", mk("orch:planner", path.join(linkDir, "dangling", "x.md")), 2],
  ["planner in real subfolder beside junctions", mk("orch:planner", path.join(linkDir, "new", "plan.md")), 0]
);

let fails = 0;
for (const [name, input, want] of cases) {
  const r = run(input);
  const ok = r.status === want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(36)} want ${want} got ${r.status}  ${r.stderr.toString().trim()}`);
}
fs.rmSync(linkDir, { recursive: true, force: true });
fs.rmSync(outside, { recursive: true, force: true });
console.log(fails ? `${fails} FAILED` : "all passed");
if (fails) process.exitCode = 1;
