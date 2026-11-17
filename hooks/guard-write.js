// Blocks orch:reader and orch:planner from writing anywhere except ~/.claude/orch/.
// Every other agent and the main session pass through untouched.
const fs = require("fs");
const os = require("os");
const path = require("path");

const GUARDED = new Set(["orch:reader", "orch:planner"]);
const ALLOWED_ROOT = path.join(os.homedir(), ".claude", "orch");

// Follows junctions and symlinks so a link inside the allowed folder can't point outside it.
// Resolves the deepest part of the path that exists, then adds back the parts not created yet.
// Returns null for a link whose target is missing, so a write can't create it somewhere else.
function realPath(p) {
  const rest = [];
  let cur = p;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(cur), ...rest);
    } catch {
      try {
        fs.lstatSync(cur);
        return null;
      } catch {}
      const parent = path.dirname(cur);
      if (parent === cur) return p;
      rest.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  if (!GUARDED.has(input.agent_type)) process.exit(0);

  const target = (input.tool_input && input.tool_input.file_path) || "";
  const resolved = path.resolve(input.cwd || process.cwd(), target);
  const real = realPath(resolved);
  const root = realPath(ALLOWED_ROOT) || ALLOWED_ROOT;
  const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const rel = real && path.relative(norm(root), norm(real));

  if (target && rel && !rel.startsWith("..") && !path.isAbsolute(rel)) process.exit(0);

  process.stderr.write(
    `${input.agent_type} may only write inside ${ALLOWED_ROOT}. Blocked write to: ${resolved}\n`
  );
  process.exit(2);
});
