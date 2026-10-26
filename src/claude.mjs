// Integración con Claude Code (CLI), equivalente a la de Kiro:
// - buscarClaude(): el ejecutable (winget, instalador nativo, npm o el de la extensión de VS Code).
// - MCP `backlog` a nivel de usuario (`claude mcp add --scope user`) para crear y consultar tareas
//   desde el chat de Claude en cualquier proyecto.
// - Instrucciones globales: un bloque marcado dentro de ~/.claude/CLAUDE.md (el resto del archivo
//   del usuario no se toca).
// - Conectores del proyecto: los servidores de <proyecto>/.mcp.json (se le pasan a Claude como
//   archivo con --mcp-config: las credenciales no se copian ni aparecen en la línea de comandos).
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { comandoBacklog } from "./backlog.mjs";
import { REPO } from "./rutas.mjs";

export const RUTA_CLAUDE_MD = join(homedir(), ".claude", "CLAUDE.md");
const INICIO = "<!-- asistente-tareas:inicio (lo mantiene `asistente instalar`; no editar a mano) -->";
const FIN = "<!-- asistente-tareas:fin -->";

/** Ejecutable de Claude Code, o null. */
export function buscarClaude() {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const local = process.env.LOCALAPPDATA ?? "";
  const candidatos = [
    join(local, "Microsoft", "WinGet", "Packages", "Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe", "claude.exe"),
    join(homedir(), ".local", "bin", "claude.exe"),
    join(homedir(), ".local", "bin", "claude"),
    join(process.env.APPDATA ?? "", "npm", "claude.cmd"),
  ];
  const encontrado = candidatos.find(existsSync);
  if (encontrado) return encontrado;
  if (spawnSync("claude", ["--version"], { windowsHide: true }).status === 0) return "claude";
  // Último recurso: el que trae la extensión de VS Code
  const ext = join(homedir(), ".vscode", "extensions");
  const dirs = existsSync(ext) ? readdirSync(ext).filter((d) => d.startsWith("anthropic.claude-code-")).sort().reverse() : [];
  for (const d of dirs) {
    for (const exe of ["claude.exe", "claude"]) {
      const p = join(ext, d, "resources", "native-binary", exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** { instalado, conectado, usuario } usando `claude auth status`. */
export function sesionClaude() {
  const claude = buscarClaude();
  if (!claude) return Promise.resolve({ instalado: false, conectado: false });
  return new Promise((ok) => {
    execFile(claude, ["auth", "status"], { encoding: "utf8", windowsHide: true, timeout: 20000 }, (err, stdout = "") => {
      try {
        const s = JSON.parse(stdout.slice(stdout.indexOf("{")));
        ok({ instalado: true, conectado: !!s.loggedIn, usuario: s.email ?? s.account?.email ?? null });
      } catch { ok({ instalado: true, conectado: !err && /logged in/i.test(stdout), usuario: null }); }
    });
  });
}

const servidorBacklog = (bandeja) => {
  const { command, args } = comandoBacklog();
  return { command, args: [...args, "mcp", "start", "--cwd", bandeja] };
};

/** Configuración MCP de la bandeja, para pasarle a Claude en cada tarea. */
export const mcpBandeja = (bandeja) => ({ mcpServers: { backlog: servidorBacklog(bandeja) } });

/** Registra (o reemplaza) el MCP `backlog` en la configuración de usuario de Claude Code. */
export function registrarMcpClaude(bandeja) {
  const claude = buscarClaude();
  if (!claude) throw new Error("No encuentro Claude Code.");
  const { command, args } = servidorBacklog(bandeja);
  spawnSync(claude, ["mcp", "remove", "backlog", "--scope", "user"], { encoding: "utf8", windowsHide: true });
  const r = spawnSync(claude, ["mcp", "add", "backlog", "--scope", "user", "--", command, ...args], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`claude mcp add falló: ${(r.stderr || r.stdout).trim()}`);
}

export function quitarMcpClaude() {
  const claude = buscarClaude();
  if (claude) spawnSync(claude, ["mcp", "remove", "backlog", "--scope", "user"], { encoding: "utf8", windowsHide: true });
}

/** Escribe las instrucciones de la bandeja en ~/.claude/CLAUDE.md (bloque marcado). */
export function instalarInstruccionesClaude(proyectos) {
  const plantilla = readFileSync(join(REPO, "asistente", "kiro-steering.md"), "utf8")
    .replace(/^---[\s\S]*?---\s*/, "") // sin el encabezado de Kiro
    .replace("{{PROYECTOS}}", proyectos.length ? proyectos.join(", ") : "(ninguno todavía)");
  const actual = existsSync(RUTA_CLAUDE_MD) ? readFileSync(RUTA_CLAUDE_MD, "utf8") : "";
  const bloque = `${INICIO}\n${plantilla.trim()}\n${FIN}`;
  const re = new RegExp(`${INICIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${FIN}`);
  const nuevo = re.test(actual) ? actual.replace(re, bloque) : `${actual.trimEnd()}${actual.trim() ? "\n\n" : ""}${bloque}\n`;
  mkdirSync(dirname(RUTA_CLAUDE_MD), { recursive: true });
  writeFileSync(RUTA_CLAUDE_MD, nuevo);
  return RUTA_CLAUDE_MD;
}

export function quitarInstruccionesClaude() {
  if (!existsSync(RUTA_CLAUDE_MD)) return;
  const actual = readFileSync(RUTA_CLAUDE_MD, "utf8");
  const re = new RegExp(`\\n*${INICIO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${FIN}\\n?`);
  writeFileSync(RUTA_CLAUDE_MD, actual.replace(re, "\n").trimEnd() + "\n");
}

export const hayInstruccionesClaude = () => existsSync(RUTA_CLAUDE_MD) && readFileSync(RUTA_CLAUDE_MD, "utf8").includes(INICIO);

// ---------------------------------------------------------------- Conectores del proyecto
export const rutaMcpProyecto = (carpeta) => join(carpeta, ".mcp.json");

export function conectoresClaude(carpeta) {
  try {
    const cfg = JSON.parse(readFileSync(rutaMcpProyecto(carpeta), "utf8"));
    return Object.entries(cfg.mcpServers ?? {}).filter(([, v]) => !v.disabled).map(([k]) => k);
  } catch { return []; }
}

/** Herramientas permitidas de Claude para un conector, según el permiso (mismo criterio que Kiro). */
export function permitidasClaude(servidor, permiso, lectura) {
  if (Array.isArray(permiso)) return permiso.map((h) => `mcp__${servidor}__${h}`);
  if (permiso === "escritura") return [`mcp__${servidor}`];
  return lectura ? lectura.map((h) => `mcp__${servidor}__${h}`) : null;
}
