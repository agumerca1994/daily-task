// Configuración editable desde el tablero (sección Configuración). Usa las mismas funciones que los
// comandos `asistente proyecto ...`, así ambos caminos quedan siempre iguales.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { agregarProyecto, definirArchivos, definirConectores, guardarConfig, leerConfig, MOTORES, quitarProyecto, rutaInstrucciones } from "./bandeja.mjs";
import { buscarKiro, conectoresDelProyecto, permitidas } from "./kiro.mjs";
import { actualizarKiro } from "./proyectos.mjs";

export function leerConfiguracion(bandeja) {
  const cfg = leerConfig(bandeja);
  return {
    motores: MOTORES,
    porDefecto: cfg.proyectoPorDefecto,
    notificaciones: cfg.notificaciones !== false,
    instrucciones: existsSync(rutaInstrucciones(bandeja)) ? readFileSync(rutaInstrucciones(bandeja), "utf8") : "",
    proyectos: Object.entries(cfg.proyectos).map(([nombre, p]) => ({
      nombre,
      carpeta: p.carpeta,
      existe: existsSync(p.carpeta),
      motor: p.motor,
      modelo: p.modelo ?? "",
      archivos: p.archivos === "escritura" ? "escritura" : "lectura",
      conectores: p.conectores ?? {},
      // Conectores del proyecto y si "lectura" se puede resolver solo
      disponibles: conectoresDelProyecto(p.carpeta).map((s) => ({ nombre: s, lecturaConocida: !!permitidas(s, "lectura") })),
    })),
  };
}

export function guardarProyecto(bandeja, { nombre, carpeta, motor, modelo, conectores, archivos, nuevo }) {
  const cfg = leerConfig(bandeja);
  if (nuevo && cfg.proyectos[nombre]) throw new Error(`Ya existe un proyecto llamado ${nombre}.`);
  if (!nuevo && !cfg.proyectos[nombre]) throw new Error(`No existe el proyecto ${nombre}.`);
  agregarProyecto(bandeja, { nombre: (nombre ?? "").trim(), carpeta: (carpeta ?? "").trim().replace(/^"|"$/g, ""), motor, modelo: (modelo ?? "").trim() || undefined });
  if (archivos) definirArchivos(bandeja, nombre, archivos);
  if (conectores) {
    const disponibles = conectoresDelProyecto(leerConfig(bandeja).proyectos[nombre].carpeta);
    for (const [s, permiso] of Object.entries(conectores)) {
      if (!disponibles.includes(s)) throw new Error(`${nombre} no tiene el conector ${s}.`);
      if (!permitidas(s, permiso)) throw new Error(`No sé cuáles herramientas de ${s} son de lectura: configuralo por comando con la lista de herramientas.`);
    }
    definirConectores(bandeja, nombre, conectores);
  }
  return actualizarKiro(bandeja);
}

export function borrarProyecto(bandeja, nombre) {
  quitarProyecto(bandeja, nombre);
  return actualizarKiro(bandeja);
}

export function guardarGeneral(bandeja, { porDefecto, notificaciones }) {
  const cfg = leerConfig(bandeja);
  if (porDefecto !== undefined) {
    if (porDefecto && !cfg.proyectos[porDefecto]) throw new Error(`No existe el proyecto ${porDefecto}.`);
    cfg.proyectoPorDefecto = porDefecto || null;
  }
  if (notificaciones !== undefined) cfg.notificaciones = !!notificaciones;
  guardarConfig(bandeja, cfg);
}

export function guardarInstrucciones(bandeja, texto) {
  writeFileSync(rutaInstrucciones(bandeja), String(texto ?? ""));
}

// Modelos de Kiro: se consultan una vez cada 10 minutos (kiro-cli tarda en responder)
let modelos = { lista: null, cuando: 0 };
export function modelosKiro() {
  if (modelos.lista && Date.now() - modelos.cuando < 10 * 60 * 1000) return modelos.lista;
  const kiro = buscarKiro();
  let lista = [];
  if (kiro) {
    const r = spawnSync(kiro, ["chat", "--list-models", "--format", "json"], { encoding: "utf8", windowsHide: true, timeout: 30000 });
    try {
      const datos = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
      lista = (datos.models ?? []).map((m) => ({ id: m.model_id, costo: m.rate_multiplier ?? null, descripcion: m.description ?? "" })).filter((m) => m.id);
    } catch { lista = []; }
  }
  modelos = { lista, cuando: Date.now() };
  return lista;
}
