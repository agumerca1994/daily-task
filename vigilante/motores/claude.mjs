// Motor Claude Code: procesa la tarea con `claude -p`, parado en la carpeta del proyecto (carga su
// CLAUDE.md y su contexto), con asistente.md + instrucciones.md como system prompt adicional y el MCP
// `backlog` de la bandeja. Pendiente de probar con un proyecto real (spike S8).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { comandoBacklog } from "../../src/backlog.mjs";
import { promptProcesar, terminar } from "./comun.mjs";

// claude: variable CLAUDE_BIN, el del PATH, o el de la extensión de VS Code más nueva
function buscarClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (spawnSync("claude", ["--version"]).status === 0) return "claude";
  const ext = join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".vscode", "extensions");
  const dirs = existsSync(ext) ? readdirSync(ext).filter((d) => d.startsWith("anthropic.claude-code-")).sort().reverse() : [];
  for (const d of dirs) {
    for (const exe of ["claude.exe", "claude"]) {
      const p = join(ext, d, "resources", "native-binary", exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const claude = buscarClaude();
if (!claude) terminar(1, "No encuentro Claude Code (claude). Instalalo o definí CLAUDE_BIN.");

const { BANDEJA: bandeja, ASISTENTE_MD, INSTRUCCIONES_MD } = process.env;
const leer = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const sistema = [leer(ASISTENTE_MD), leer(INSTRUCCIONES_MD)].filter(Boolean).join("\n\n---\n\n");
const { command, args: argsBacklog } = comandoBacklog();
const mcp = { mcpServers: { backlog: { command, args: [...argsBacklog, "mcp", "start", "--cwd", bandeja] } } };

const args = [
  "-p", promptProcesar(),
  "--append-system-prompt", sistema,
  "--mcp-config", JSON.stringify(mcp),
  "--add-dir", bandeja,
  "--allowedTools", "mcp__backlog", "Read", "Glob", "Grep", "Bash(backlog *)", "PowerShell(backlog *)",
  "--no-session-persistence",
];
if (process.env.PROJECT_MODEL) args.push("--model", process.env.PROJECT_MODEL);

const r = spawnSync(claude, args, { cwd: process.env.PROJECT_DIR, encoding: "utf8", timeout: 10 * 60 * 1000 });
if (r.error) terminar(1, r.error.message);
if (r.status !== 0) terminar(r.status ?? 1, `${r.stderr ?? ""}`.trim());
terminar(0, `${r.stdout ?? ""}`.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "(sin respuesta)");
