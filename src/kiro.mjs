// Integración con Kiro: agente de usuario `asistente-tareas` (para Kiro CLI) y MCP `backlog` a nivel
// de usuario (para crear y consultar tareas desde el chat de Kiro IDE o CLI en cualquier proyecto).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { comandoBacklog } from "./backlog.mjs";
import { ASISTENTE_MD, REPO } from "./rutas.mjs";
import { rutaInstrucciones } from "./bandeja.mjs";

export const AGENTE = "asistente-tareas";
const DIR_KIRO = join(homedir(), ".kiro");
export const RUTA_AGENTE = join(DIR_KIRO, "agents", `${AGENTE}.json`);
export const RUTA_MCP_USUARIO = join(DIR_KIRO, "settings", "mcp.json");
export const RUTA_STEERING = join(DIR_KIRO, "steering", "bandeja-tareas.md");

/** Ejecutable de Kiro CLI, o null si no está. */
export function buscarKiro() {
  const candidatos = [
    process.env.KIRO_BIN,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Kiro-Cli", "kiro-cli.exe"),
    join(homedir(), ".local", "bin", "kiro-cli"),
  ].filter(Boolean);
  const encontrado = candidatos.find(existsSync);
  if (encontrado) return encontrado;
  const r = spawnSync("kiro-cli", ["--version"], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? "kiro-cli" : null;
}

/** Usuario logueado en Kiro CLI, o null. */
export function sesionKiro(kiro) {
  const r = spawnSync(kiro, ["whoami"], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? (r.stdout.split(/\r?\n/).find(Boolean) ?? "logueado") : null;
}

const servidorBacklog = (bandeja) => {
  const { command, args } = comandoBacklog();
  return { command, args: [...args, "mcp", "start", "--cwd", bandeja] };
};

/** Genera el agente de Kiro CLI desde la plantilla, con las rutas de esta PC. */
export function instalarAgente(bandeja) {
  const plantilla = readFileSync(join(REPO, "asistente", "kiro-agent.json"), "utf8");
  const agente = JSON.parse(plantilla);
  agente.mcpServers = { backlog: servidorBacklog(bandeja) };
  agente.resources = agente.resources.map((r) =>
    r.replace("{{ASISTENTE_MD}}", ASISTENTE_MD.replace(/\\/g, "/")).replace("{{INSTRUCCIONES_MD}}", rutaInstrucciones(bandeja)),
  );
  mkdirSync(dirname(RUTA_AGENTE), { recursive: true });
  writeFileSync(RUTA_AGENTE, JSON.stringify(agente, null, 2) + "\n");
  return RUTA_AGENTE;
}

/** Estado del MCP `backlog` en la config de usuario de Kiro: "falta", "igual" o "distinto". */
export function estadoMcpUsuario(bandeja) {
  const actual = leerMcpUsuario().mcpServers?.backlog;
  if (!actual) return "falta";
  return JSON.stringify({ command: actual.command, args: actual.args }) === JSON.stringify(servidorBacklog(bandeja))
    ? "igual" : "distinto";
}

/** Agrega (o reemplaza) el MCP `backlog` en ~/.kiro/settings/mcp.json, sin tocar los demás servidores. */
export function registrarMcpUsuario(bandeja) {
  const cfg = leerMcpUsuario();
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), backlog: servidorBacklog(bandeja) };
  mkdirSync(dirname(RUTA_MCP_USUARIO), { recursive: true });
  writeFileSync(RUTA_MCP_USUARIO, JSON.stringify(cfg, null, 2) + "\n");
  return RUTA_MCP_USUARIO;
}

/**
 * Steering global de Kiro (~/.kiro/steering/bandeja-tareas.md): cómo crear tareas en la bandeja desde
 * el chat de cualquier proyecto, sin tocar los proyectos. Se regenera al cambiar los proyectos.
 */
export function instalarSteering(proyectos) {
  const plantilla = readFileSync(join(REPO, "asistente", "kiro-steering.md"), "utf8");
  const lista = proyectos.length ? proyectos.join(", ") : "(ninguno todavía)";
  mkdirSync(dirname(RUTA_STEERING), { recursive: true });
  writeFileSync(RUTA_STEERING, plantilla.replace("{{PROYECTOS}}", lista));
  return RUTA_STEERING;
}

function leerMcpUsuario() {
  try { return JSON.parse(readFileSync(RUTA_MCP_USUARIO, "utf8")); } catch { return {}; }
}
