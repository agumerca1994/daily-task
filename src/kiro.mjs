// Integración con Kiro: agente de usuario `asistente-tareas` (para Kiro CLI) y MCP `backlog` a nivel
// de usuario (para crear y consultar tareas desde el chat de Kiro IDE o CLI en cualquier proyecto).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function agenteBase(bandeja) {
  const agente = JSON.parse(readFileSync(join(REPO, "asistente", "kiro-agent.json"), "utf8"));
  agente.mcpServers = { backlog: servidorBacklog(bandeja) };
  agente.resources = agente.resources.map((r) =>
    r.replace("{{ASISTENTE_MD}}", ASISTENTE_MD.replace(/\\/g, "/")).replace("{{INSTRUCCIONES_MD}}", rutaInstrucciones(bandeja)),
  );
  return agente;
}

// ---------------------------------------------------------------- Conectores por proyecto
// Cada proyecto puede habilitar conectores (servidores MCP) de su propia configuración de Kiro
// (<proyecto>/.kiro/settings/mcp.json), con permiso:
//   "lectura"    -> solo las herramientas de consulta conocidas (Jira: jira_get, Confluence: conf_get)
//   "escritura"  -> todas las herramientas del conector
//   ["a", "b"]   -> exactamente esas herramientas
// Para esos proyectos se genera un agente propio (asistente-tareas-<proyecto>) que usa la
// configuración MCP del proyecto (includeMcpJson): las credenciales no se copian a ningún lado.
// Kiro bloquea en modo no interactivo cualquier herramienta que no esté permitida (probado).
const LECTURA = [
  { patron: /jira/i, herramientas: ["jira_get"] },
  { patron: /confluence|conf/i, herramientas: ["conf_get"] },
];

export const slug = (nombre) => nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Un proyecto con conectores o con escritura en sus archivos usa un agente propio. */
export const necesitaAgentePropio = (cfg) =>
  !!((cfg?.conectores && Object.keys(cfg.conectores).length) || cfg?.archivos === "escritura");
export const nombreAgente = (proyecto, cfg) => (necesitaAgentePropio(cfg) ? `${AGENTE}-${slug(proyecto)}` : AGENTE);

/** Conectores (servidores MCP) definidos en la configuración de Kiro del proyecto. */
export function conectoresDelProyecto(carpeta) {
  try {
    const cfg = JSON.parse(readFileSync(join(carpeta, ".kiro", "settings", "mcp.json"), "utf8"));
    return Object.entries(cfg.mcpServers ?? {}).filter(([, v]) => !v.disabled).map(([k]) => k);
  } catch { return []; }
}

/** Herramientas permitidas para un conector según el permiso; null si "lectura" no se sabe resolver. */
export function permitidas(servidor, permiso) {
  if (Array.isArray(permiso)) return permiso.map((h) => `@${servidor}/${h}`);
  if (permiso === "escritura") return [`@${servidor}`];
  const conocido = LECTURA.find((l) => l.patron.test(servidor));
  return conocido ? conocido.herramientas.map((h) => `@${servidor}/${h}`) : null;
}

/** Genera el agente base y uno por cada proyecto con conectores; borra los que ya no corresponden. */
export function instalarAgente(bandeja, proyectos = {}) {
  const dir = dirname(RUTA_AGENTE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(RUTA_AGENTE, JSON.stringify(agenteBase(bandeja), null, 2) + "\n");
  const vigentes = new Set([`${AGENTE}.json`]);
  const avisos = [];
  for (const [nombre, p] of Object.entries(proyectos)) {
    if (!necesitaAgentePropio(p)) continue;
    const conectores = Object.entries(p.conectores ?? {});
    const agente = agenteBase(bandeja);
    agente.name = nombreAgente(nombre, p);
    const partes = [
      p.archivos === "escritura" ? "archivos: lectura y escritura" : "archivos: solo lectura",
      ...conectores.map(([s, x]) => `${s}: ${Array.isArray(x) ? x.join("+") : x}`),
    ];
    agente.description = `Asistente de tareas del proyecto ${nombre} (${partes.join(", ")})`;
    if (p.archivos === "escritura") {
      // Escritura SOLO dentro de la carpeta del proyecto: `write` no va en allowedTools (eso la
      // habilitaría en cualquier ruta); allowedPaths la aprueba ahí y Kiro bloquea el resto (probado).
      agente.tools.push("write");
      agente.toolsSettings = { ...(agente.toolsSettings ?? {}), write: { allowedPaths: [`${p.carpeta.replace(/\\/g, "/")}/**`] } };
      agente.prompt = agente.prompt.replace("solo leés sus archivos", "podés modificar sus archivos solo como indica asistente.md");
    }
    if (conectores.length) agente.includeMcpJson = true;
    for (const [servidor, permiso] of conectores) {
      const lista = permitidas(servidor, permiso);
      if (!lista) { avisos.push(`${nombre}/${servidor}: no sé qué herramientas son de lectura; indicalas a mano`); continue; }
      agente.tools.push(`@${servidor}`);
      agente.allowedTools.push(...lista);
    }
    writeFileSync(join(dir, `${agente.name}.json`), JSON.stringify(agente, null, 2) + "\n");
    vigentes.add(`${agente.name}.json`);
  }
  for (const f of readdirSync(dir)) {
    if (f.startsWith(`${AGENTE}-`) && f.endsWith(".json") && !vigentes.has(f)) rmSync(join(dir, f), { force: true });
  }
  return { ruta: RUTA_AGENTE, avisos };
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
