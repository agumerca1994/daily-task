// Motor Claude Code: procesa la tarea con `claude -p`, parado en la carpeta del proyecto (carga su
// CLAUDE.md y su contexto), con asistente.md + instrucciones.md como system prompt adicional, el MCP
// `backlog` de la bandeja y, si el proyecto los habilita, sus conectores (<proyecto>/.mcp.json, que se
// pasa como archivo: las credenciales no se copian). En modo -p, Claude rechaza cualquier herramienta
// que no esté en --allowedTools.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { buscarClaude, mcpBandeja, rutaMcpProyecto } from "../../src/claude.mjs";
import { permitidas } from "../../src/kiro.mjs";
import { promptProcesar, terminar } from "./comun.mjs";

const claude = buscarClaude();
if (!claude) terminar(1, "No encuentro Claude Code (claude). Instalalo o definí CLAUDE_BIN.");

const { BANDEJA: bandeja, ASISTENTE_MD, INSTRUCCIONES_MD, PROJECT_DIR: carpeta } = process.env;
const leer = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const sistema = [leer(ASISTENTE_MD), leer(INSTRUCCIONES_MD)].filter(Boolean).join("\n\n---\n\n");

const herramientas = ["mcp__backlog", "Read", "Glob", "Grep"];
// Archivos del proyecto: con escritura, Claude solo edita dentro de la carpeta de trabajo y las
// carpetas agregadas (la bandeja, que igual se modifica solo por MCP según asistente.md)
if (process.env.PROJECT_ARCHIVOS === "escritura") herramientas.push("Edit", "Write");

const mcp = [JSON.stringify(mcpBandeja(bandeja))];
let conectores = {};
try { conectores = JSON.parse(process.env.PROJECT_CONECTORES_JSON || "{}"); } catch { /* sin conectores */ }
if (Object.keys(conectores).length && existsSync(rutaMcpProyecto(carpeta))) {
  mcp.push(rutaMcpProyecto(carpeta));
  for (const [servidor, permiso] of Object.entries(conectores)) herramientas.push(...(permitidas(servidor, permiso, "claude") ?? []));
}

const args = [
  "-p", promptProcesar(),
  "--append-system-prompt", sistema,
  "--mcp-config", ...mcp,
  "--add-dir", bandeja,
  "--allowedTools", ...herramientas,
  "--no-session-persistence",
];
if (process.env.PROJECT_MODEL) args.push("--model", process.env.PROJECT_MODEL);

const r = spawnSync(claude, args, { cwd: carpeta, encoding: "utf8", timeout: 10 * 60 * 1000, windowsHide: true });
if (r.error) terminar(1, r.error.message);
if (r.status !== 0) {
  const err = `${r.stderr || r.stdout || ""}`.trim().split(/\r?\n/).slice(-5).join("\n");
  terminar(r.status ?? 1, /not logged in|log in|login|authenticat/i.test(err) ? `Claude Code sin sesión: iniciá sesión\n${err}` : err);
}
terminar(0, `${r.stdout ?? ""}`.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "(sin respuesta)");
