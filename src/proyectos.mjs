// `asistente proyecto ...`: qué proyectos atiende la bandeja, en qué carpeta, con qué motor y con qué
// conectores (Jira, Confluence...) del propio proyecto.
import { existsSync } from "node:fs";
import { agregarProyecto, definirArchivos, definirConectores, guardarConfig, leerConfig, MOTORES, quitarProyecto } from "./bandeja.mjs";
import { conectoresDelProyecto, instalarAgente, instalarSteering, permitidas, RUTA_AGENTE, RUTA_STEERING } from "./kiro.mjs";
import { barras, leerConfigUsuario } from "./rutas.mjs";

// Lo instalado en Kiro (steering y agentes) se actualiza cuando cambian los proyectos
export function actualizarKiro(bandeja) {
  // Solo la bandeja instalada actualiza Kiro (una bandeja de prueba no debe pisar tus agentes)
  const instalada = leerConfigUsuario().bandeja;
  if (!instalada || barras(instalada) !== barras(bandeja)) return [];
  const proyectos = leerConfig(bandeja).proyectos;
  if (existsSync(RUTA_STEERING)) instalarSteering(Object.keys(proyectos));
  if (!existsSync(RUTA_AGENTE)) return [];
  const { avisos } = instalarAgente(bandeja, proyectos);
  for (const a of avisos) console.log(`Aviso: ${a}`);
  return avisos;
}

const textoPermiso = (p) => (Array.isArray(p) ? p.join(", ") : p);

export function listarProyectos(bandeja) {
  const cfg = leerConfig(bandeja);
  const nombres = Object.keys(cfg.proyectos);
  if (!nombres.length) return console.log("No hay proyectos. Agregá uno con: asistente proyecto agregar <nombre> <carpeta>");
  for (const n of nombres) {
    const p = cfg.proyectos[n];
    const marca = cfg.proyectoPorDefecto === n ? " (por defecto)" : "";
    const con = Object.entries(p.conectores ?? {}).map(([s, x]) => `${s}: ${textoPermiso(x)}`).join(", ");
    const arch = p.archivos === "escritura" ? "lectura y escritura" : "solo lectura";
    console.log(`- ${n}${marca}: ${p.motor}${p.modelo ? ` / ${p.modelo}` : ""} en ${p.carpeta} — archivos: ${arch}${con ? ` — conectores: ${con}` : ""}`);
  }
}

/** Muestra los conectores disponibles en el proyecto y los habilitados. */
function mostrarConectores(bandeja, nombre) {
  const p = leerConfig(bandeja).proyectos[nombre];
  if (!p) throw new Error(`No existe el proyecto ${nombre}`);
  const disponibles = conectoresDelProyecto(p.carpeta);
  console.log(`Conectores de ${nombre} (${p.carpeta}\\.kiro\\settings\\mcp.json):`);
  if (!disponibles.length) console.log("  (el proyecto no tiene conectores configurados en Kiro)");
  for (const s of disponibles) {
    const permiso = p.conectores?.[s];
    console.log(`  - ${s}: ${permiso ? textoPermiso(permiso) : "no habilitado"}`);
  }
  console.log(`\nPara cambiarlos: asistente proyecto conectores ${nombre} jira=lectura confluence=lectura
  lectura   solo consultar (Jira: jira_get, Confluence: conf_get)
  escritura todas las herramientas del conector (crear/editar); la IA igual pide tu aprobación
            en la tarea antes de crear o modificar algo
  a+b+c     exactamente esas herramientas, por ejemplo jira=jira_get+jira_post
  ninguno   quita todos los conectores del proyecto`);
}

export function comandoProyecto(bandeja, [accion, nombre, carpeta, ...resto], op) {
  switch (accion) {
    case "listar": case undefined:
      return listarProyectos(bandeja);
    case "agregar": {
      const p = agregarProyecto(bandeja, { nombre, carpeta, motor: op.motor ?? "kiro", modelo: op.modelo });
      actualizarKiro(bandeja);
      return console.log(`Proyecto ${nombre} -> ${p.motor} en ${p.carpeta}`);
    }
    case "quitar":
      quitarProyecto(bandeja, nombre);
      actualizarKiro(bandeja);
      return console.log(`Proyecto ${nombre} quitado (sus tareas quedan en la bandeja).`);
    case "por-defecto": {
      const cfg = leerConfig(bandeja);
      if (nombre !== "ninguno" && !cfg.proyectos[nombre]) throw new Error(`No existe el proyecto ${nombre}`);
      cfg.proyectoPorDefecto = nombre === "ninguno" ? null : nombre;
      guardarConfig(bandeja, cfg);
      return console.log(cfg.proyectoPorDefecto
        ? `Las tareas sin proyecto van a ${nombre}.` : "Las tareas sin proyecto no se procesan.");
    }
    case "archivos": {
      // asistente proyecto archivos <nombre> lectura|escritura
      const p = definirArchivos(bandeja, nombre, carpeta);
      actualizarKiro(bandeja);
      return console.log(p.archivos === "escritura"
        ? `${nombre}: la IA puede modificar archivos dentro de ${p.carpeta} (siempre te propone los cambios y espera tu aprobación).`
        : `${nombre}: la IA solo lee los archivos del proyecto.`);
    }
    case "conectores": {
      // asistente proyecto conectores <nombre> [servidor=permiso ...] | ninguno
      const pares = [carpeta, ...resto].filter(Boolean);
      if (!pares.length) return mostrarConectores(bandeja, nombre);
      const cfg = leerConfig(bandeja).proyectos[nombre];
      if (!cfg) throw new Error(`No existe el proyecto ${nombre}`);
      const disponibles = conectoresDelProyecto(cfg.carpeta);
      const conectores = {};
      if (pares[0] !== "ninguno") {
        for (const par of pares) {
          const [s, v] = par.split("=");
          if (!s || !v) throw new Error(`Formato: servidor=permiso (recibí "${par}")`);
          if (!disponibles.includes(s)) throw new Error(`${nombre} no tiene el conector "${s}". Disponibles: ${disponibles.join(", ") || "ninguno"}`);
          const permiso = ["lectura", "escritura"].includes(v) ? v : v.split("+");
          if (!permitidas(s, permiso)) throw new Error(`No sé cuáles herramientas de "${s}" son de lectura: indicalas, por ejemplo ${s}=herramienta1+herramienta2`);
          conectores[s] = permiso;
        }
      }
      definirConectores(bandeja, nombre, conectores);
      actualizarKiro(bandeja);
      return mostrarConectores(bandeja, nombre);
    }
    default:
      throw new Error(`Acción desconocida: ${accion} (listar, agregar, quitar, por-defecto, archivos, conectores; motores: ${MOTORES.join(", ")})`);
  }
}
