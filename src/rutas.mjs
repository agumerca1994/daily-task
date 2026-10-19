// Rutas de la herramienta y configuración de usuario (dónde está la bandeja).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Carpeta raíz del repo de la herramienta. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ASISTENTE_MD = join(REPO, "asistente", "asistente.md");

/** Rutas siempre con "/" (sirven en Windows y quedan legibles en JSON). */
export const barras = (p) => resolve(p).replace(/\\/g, "/");

const dirConfigUsuario =
  process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "asistente-tareas")
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "asistente-tareas");
export const CONFIG_USUARIO = join(dirConfigUsuario, "config.json");

export const BANDEJA_POR_DEFECTO = barras(join(homedir(), "asistente-bandeja"));

export function leerConfigUsuario() {
  try { return JSON.parse(readFileSync(CONFIG_USUARIO, "utf8")); } catch { return {}; }
}

export function guardarConfigUsuario(cfg) {
  mkdirSync(dirname(CONFIG_USUARIO), { recursive: true });
  writeFileSync(CONFIG_USUARIO, JSON.stringify(cfg, null, 2) + "\n");
}

/** Bandeja activa: --bandeja, variable ASISTENTE_BANDEJA o la guardada por `asistente instalar`. */
export function rutaBandeja(explicita) {
  const r = explicita ?? process.env.ASISTENTE_BANDEJA ?? leerConfigUsuario().bandeja;
  if (!r) throw new Error("No hay bandeja configurada. Ejecutá primero: asistente instalar");
  if (!existsSync(join(r, "backlog"))) throw new Error(`${r} no es una bandeja (falta backlog/). Ejecutá: asistente instalar`);
  return barras(r);
}
