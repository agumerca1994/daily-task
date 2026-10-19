// `asistente proyecto ...`: qué proyectos atiende la bandeja, en qué carpeta y con qué motor.
import { existsSync } from "node:fs";
import { agregarProyecto, guardarConfig, leerConfig, MOTORES, quitarProyecto } from "./bandeja.mjs";
import { instalarSteering, RUTA_STEERING } from "./kiro.mjs";

// Si el steering global de Kiro está instalado, se actualiza con la lista de proyectos
function actualizarSteering(bandeja) {
  if (existsSync(RUTA_STEERING)) instalarSteering(Object.keys(leerConfig(bandeja).proyectos));
}

export function listarProyectos(bandeja) {
  const cfg = leerConfig(bandeja);
  const nombres = Object.keys(cfg.proyectos);
  if (!nombres.length) return console.log("No hay proyectos. Agregá uno con: asistente proyecto agregar <nombre> <carpeta>");
  for (const n of nombres) {
    const p = cfg.proyectos[n];
    const marca = cfg.proyectoPorDefecto === n ? " (por defecto)" : "";
    console.log(`- ${n}${marca}: ${p.motor}${p.modelo ? ` / ${p.modelo}` : ""} en ${p.carpeta}`);
  }
}

export function comandoProyecto(bandeja, [accion, nombre, carpeta], op) {
  switch (accion) {
    case "listar": case undefined:
      return listarProyectos(bandeja);
    case "agregar": {
      const p = agregarProyecto(bandeja, { nombre, carpeta, motor: op.motor ?? "kiro", modelo: op.modelo });
      actualizarSteering(bandeja);
      return console.log(`Proyecto ${nombre} -> ${p.motor} en ${p.carpeta}`);
    }
    case "quitar":
      quitarProyecto(bandeja, nombre);
      actualizarSteering(bandeja);
      return console.log(`Proyecto ${nombre} quitado (sus tareas quedan en la bandeja).`);
    case "por-defecto": {
      const cfg = leerConfig(bandeja);
      if (nombre !== "ninguno" && !cfg.proyectos[nombre]) throw new Error(`No existe el proyecto ${nombre}`);
      cfg.proyectoPorDefecto = nombre === "ninguno" ? null : nombre;
      guardarConfig(bandeja, cfg);
      return console.log(cfg.proyectoPorDefecto
        ? `Las tareas sin proyecto van a ${nombre}.` : "Las tareas sin proyecto no se procesan.");
    }
    default:
      throw new Error(`Acción desconocida: ${accion} (listar, agregar, quitar, por-defecto; motores: ${MOTORES.join(", ")})`);
  }
}
