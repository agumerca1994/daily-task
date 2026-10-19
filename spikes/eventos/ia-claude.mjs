// Handler real: le pide a Claude Code (modo no interactivo) que procese la tarea del evento.
// Las instrucciones del asistente están en asistente.md (importado desde el CLAUDE.md de la bandeja).
// Usa el MCP de backlog (.mcp.json de la bandeja) y, como alternativa, la CLI `backlog` por bash o PowerShell.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// claude.exe: variable CLAUDE_BIN, o el de la extensión de VS Code más nueva
function buscarClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const ext = join(process.env.USERPROFILE, ".vscode", "extensions");
  const dirs = existsSync(ext) ? readdirSync(ext).filter((d) => d.startsWith("anthropic.claude-code-")).sort() : [];
  for (const d of dirs.reverse()) {
    const p = join(ext, d, "resources", "native-binary", "claude.exe");
    if (existsSync(p)) return p;
  }
  return "claude";
}

const id = process.env.TASK_ID;
const prompt =
  `Procesá la tarea ${id} de la bandeja siguiendo las instrucciones de asistente.md. ` +
  `Evento: ${process.env.EVENT}. Al terminar respondé solo con una línea: "<id> -> <status final>".`;

const r = spawnSync(
  buscarClaude(),
  ["-p", prompt, "--mcp-config", ".mcp.json", "--allowedTools", "mcp__backlog", "Bash(backlog *)", "PowerShell(backlog *)", "Read", "Glob", "Grep", "--no-session-persistence"],
  { encoding: "utf8", timeout: 5 * 60 * 1000 }
);
if (r.error) { console.error(r.error.message); process.exit(1); }
if (r.stderr?.trim()) console.error(r.stderr.trim());
console.log((r.stdout ?? "").trim());
process.exit(r.status ?? 1);
