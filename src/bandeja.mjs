// La bandeja: carpeta privada con las tareas (Backlog.md), adjuntos, conocimiento y la configuración
// de proyectos (asistente.json). Nunca va dentro de un repo que se suba.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backlog } from "./backlog.mjs";
import { barras } from "./rutas.mjs";

export const ESTADOS = ["Pendiente", "En análisis", "Esperando info", "Para revisar", "Resuelta"];
export const MOTORES = ["kiro", "claude"];

const CONFIG_INICIAL = { version: 1, proyectoPorDefecto: null, procesarPendientesAlIniciar: true, proyectos: {} };

const INSTRUCCIONES_INICIALES = `# Instrucciones propias

Este archivo es tuyo y no se sube a ningún repo. Lo que escribas acá se suma a las instrucciones
generales del asistente, para todos los proyectos. Por ejemplo:

- Mi rol y mi área.
- A quién se escala cada tipo de problema.
- Tono y formato preferido para los borradores de respuesta.
`;

export const rutaConfig = (bandeja) => join(bandeja, "asistente.json");
export const rutaInstrucciones = (bandeja) => barras(join(bandeja, "instrucciones.md"));

export function leerConfig(bandeja) {
  try { return { ...CONFIG_INICIAL, ...JSON.parse(readFileSync(rutaConfig(bandeja), "utf8")) }; }
  catch { return structuredClone(CONFIG_INICIAL); }
}

export function guardarConfig(bandeja, cfg) {
  writeFileSync(rutaConfig(bandeja), JSON.stringify(cfg, null, 2) + "\n");
  sincronizarProyectos(bandeja, Object.keys(cfg.proyectos));
}

/** Crea la bandeja si no existe. Devuelve true si la creó. */
export function crearBandeja(bandeja) {
  mkdirSync(bandeja, { recursive: true });
  let creada = false;
  if (!existsSync(join(bandeja, "backlog", "config.yml"))) {
    const r = backlog(
      ["init", "Bandeja de tareas", "--defaults", "--no-git", "--integration-mode", "none", "--auto-open-browser", "false"],
      { cwd: bandeja },
    );
    if (r.status !== 0) throw new Error(`backlog init falló:\n${r.stderr || r.stdout}`);
    creada = true;
  }
  for (const d of ["adjuntos", "conocimiento", "logs"]) mkdirSync(join(bandeja, d), { recursive: true });
  if (!existsSync(rutaInstrucciones(bandeja))) writeFileSync(rutaInstrucciones(bandeja), INSTRUCCIONES_INICIALES);
  const cfg = leerConfig(bandeja);
  editarConfigYml(bandeja, { default_status: JSON.stringify(ESTADOS[0]), statuses: lista(ESTADOS) });
  guardarConfig(bandeja, cfg);
  return creada;
}

// --- backlog/config.yml: se editan solo las líneas que nos importan, el resto queda como lo dejó Backlog.md
const lista = (xs) => `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;

function editarConfigYml(bandeja, claves) {
  const ruta = join(bandeja, "backlog", "config.yml");
  let texto = readFileSync(ruta, "utf8");
  for (const [clave, valor] of Object.entries(claves)) {
    const linea = `${clave}: ${valor}`;
    const re = new RegExp(`^${clave}:.*$`, "m");
    texto = re.test(texto) ? texto.replace(re, linea) : texto.replace(/\n?$/, `\n${linea}\n`);
  }
  writeFileSync(ruta, texto);
}

function sincronizarProyectos(bandeja, nombres) {
  editarConfigYml(bandeja, { projects: lista(nombres) });
  for (const n of nombres) mkdirSync(join(bandeja, "conocimiento", n), { recursive: true });
}

// --- Proyectos
export function validarNombre(nombre) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(nombre ?? "")) {
    throw new Error(`Nombre de proyecto inválido: "${nombre}" (letras, números, espacio, _ . -)`);
  }
}

export const PERMISOS_ARCHIVOS = ["lectura", "escritura"];

export function agregarProyecto(bandeja, { nombre, carpeta, motor = "kiro", modelo, conectores, archivos }) {
  validarNombre(nombre);
  if (!carpeta || !existsSync(carpeta)) throw new Error(`No existe la carpeta del proyecto: ${carpeta}`);
  if (!MOTORES.includes(motor)) throw new Error(`Motor inválido: ${motor} (opciones: ${MOTORES.join(", ")})`);
  if (archivos && !PERMISOS_ARCHIVOS.includes(archivos)) throw new Error(`Permiso de archivos inválido: ${archivos} (lectura o escritura)`);
  const cfg = leerConfig(bandeja);
  const antes = cfg.proyectos[nombre] ?? {};
  // Si no se indican conectores o permiso de archivos, se conservan los que tenía (reinstalar no los borra)
  const con = conectores ?? antes.conectores;
  const arch = archivos ?? antes.archivos;
  cfg.proyectos[nombre] = {
    carpeta: barras(carpeta), motor, ...(modelo ? { modelo } : {}),
    ...(arch === "escritura" ? { archivos: "escritura" } : {}),
    ...(con && Object.keys(con).length ? { conectores: con } : {}),
  };
  guardarConfig(bandeja, cfg);
  return cfg.proyectos[nombre];
}

/** Permiso de la IA sobre los archivos del proyecto: "lectura" (por defecto) o "escritura". */
export function definirArchivos(bandeja, nombre, permiso) {
  if (!PERMISOS_ARCHIVOS.includes(permiso)) throw new Error(`Permiso inválido: ${permiso} (lectura o escritura)`);
  const cfg = leerConfig(bandeja);
  const p = cfg.proyectos[nombre];
  if (!p) throw new Error(`No existe el proyecto ${nombre}`);
  if (permiso === "escritura") p.archivos = "escritura"; else delete p.archivos;
  guardarConfig(bandeja, cfg);
  return p;
}

/** Define los conectores de un proyecto: { servidor: "lectura" | "escritura" | ["herramienta", ...] }. */
export function definirConectores(bandeja, nombre, conectores) {
  const cfg = leerConfig(bandeja);
  const p = cfg.proyectos[nombre];
  if (!p) throw new Error(`No existe el proyecto ${nombre}`);
  for (const [s, permiso] of Object.entries(conectores)) {
    if (!Array.isArray(permiso) && !["lectura", "escritura"].includes(permiso)) {
      throw new Error(`Permiso inválido para ${s}: ${permiso} (lectura, escritura o una lista de herramientas)`);
    }
  }
  if (Object.keys(conectores).length) p.conectores = conectores; else delete p.conectores;
  guardarConfig(bandeja, cfg);
  return p;
}

export function quitarProyecto(bandeja, nombre) {
  const cfg = leerConfig(bandeja);
  if (!cfg.proyectos[nombre]) throw new Error(`No existe el proyecto ${nombre}`);
  delete cfg.proyectos[nombre];
  if (cfg.proyectoPorDefecto === nombre) cfg.proyectoPorDefecto = null;
  guardarConfig(bandeja, cfg);
}
