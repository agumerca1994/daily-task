// `asistente instalar`: crea o actualiza la bandeja, los proyectos y la integración con Kiro.
// Se puede ejecutar de nuevo cuando se quiera: no borra tareas ni proyectos.
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { backlogCli } from "./backlog.mjs";
import { agregarProyecto, crearBandeja, leerConfig, MOTORES } from "./bandeja.mjs";
import {
  buscarKiro, estadoMcpUsuario, instalarAgente, registrarMcpUsuario, RUTA_AGENTE, RUTA_MCP_USUARIO, sesionKiro,
} from "./kiro.mjs";
import { listarProyectos } from "./proyectos.mjs";
import { BANDEJA_POR_DEFECTO, barras, CONFIG_USUARIO, guardarConfigUsuario, leerConfigUsuario } from "./rutas.mjs";

export async function instalar(op) {
  const rl = op.si ? null : createInterface({ input: process.stdin, output: process.stdout });
  const preguntar = async (texto, porDefecto = "") => {
    if (!rl) return porDefecto;
    const r = (await rl.question(porDefecto ? `${texto} [${porDefecto}]: ` : `${texto}: `)).trim();
    return r || porDefecto;
  };
  const confirmar = async (texto, si = true) => {
    const r = (await preguntar(`${texto} (s/n)`, si ? "s" : "n")).toLowerCase();
    return r.startsWith("s") || r.startsWith("y");
  };

  try {
    // 1. Requisitos
    console.log("== Requisitos");
    console.log(`- Node ${process.version}`);
    console.log(`- Backlog.md: ${backlogCli()}`);
    const kiro = buscarKiro();
    const sesion = kiro && sesionKiro(kiro);
    console.log(`- Kiro CLI: ${kiro ? `${kiro}${sesion ? ` (${sesion})` : " (sin sesión: ejecutá kiro-cli login)"}` : "no encontrado"}`);

    // 2. Bandeja
    console.log("\n== Bandeja (carpeta privada con las tareas; no la pongas dentro de un repo que se suba)");
    const anterior = leerConfigUsuario().bandeja;
    const bandeja = barras(op.bandeja ?? (await preguntar("Ruta de la bandeja", anterior ?? BANDEJA_POR_DEFECTO)));
    const nueva = crearBandeja(bandeja);
    guardarConfigUsuario({ ...leerConfigUsuario(), bandeja });
    console.log(`${nueva ? "Creada" : "Actualizada"}: ${bandeja}`);

    // 3. Proyectos
    console.log("\n== Proyectos (la IA procesa cada tarea en la carpeta de su proyecto)");
    listarProyectos(bandeja);
    while (rl && (await confirmar("¿Agregar un proyecto?", Object.keys(leerConfig(bandeja).proyectos).length === 0))) {
      try {
        const nombre = await preguntar("  Nombre (como aparecerá en el tablero)");
        const carpeta = await preguntar("  Carpeta del proyecto");
        const motor = await preguntar(`  Motor (${MOTORES.join("/")})`, "kiro");
        const p = agregarProyecto(bandeja, { nombre, carpeta: carpeta.replace(/^"|"$/g, ""), motor });
        console.log(`  OK: ${nombre} -> ${p.motor} en ${p.carpeta}`);
      } catch (e) { console.log(`  No se agregó: ${e.message}`); }
    }

    // 4. Kiro
    if (kiro) {
      console.log("\n== Kiro");
      if (await confirmar(`¿Instalar/actualizar el agente asistente-tareas (${RUTA_AGENTE})?`)) {
        console.log(`OK: ${instalarAgente(bandeja)}`);
      }
      const estado = estadoMcpUsuario(bandeja);
      if (estado === "igual") console.log(`MCP backlog de usuario: ya configurado (${RUTA_MCP_USUARIO})`);
      else if (await confirmar(
        estado === "falta"
          ? "¿Agregar el MCP backlog a tu configuración de usuario de Kiro (para crear y consultar tareas desde el chat en cualquier proyecto)?"
          : "Ya hay un MCP backlog de usuario distinto. ¿Reemplazarlo para que apunte a esta bandeja?",
        estado === "falta",
      )) console.log(`OK: ${registrarMcpUsuario(bandeja)}`);
    }

    // 5. Resumen
    console.log(`\n== Listo
Configuración de usuario: ${CONFIG_USUARIO}
Bandeja: ${bandeja}
  - instrucciones.md: tus instrucciones propias para el asistente (rol, área, a quién escalar)
  - conocimiento/<proyecto>/: procedimientos que no están en el repo del proyecto

Para usarlo:
  1. Tablero:   cd "${bandeja}" && backlog browser
  2. Vigilante: node "${barras(process.argv[1])}" vigilante
  3. Creá una tarea en el tablero (con proyecto) o pedíselo a Kiro en el chat.`);
    if (!existsSync(bandeja)) process.exitCode = 1;
  } finally {
    rl?.close();
  }
}
