// `asistente instalar`: crea o actualiza la bandeja, los proyectos y la integración con Kiro.
// Se puede ejecutar de nuevo cuando se quiera: no borra tareas ni proyectos.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { crearAccesos, quitarAccesos } from "./accesos.mjs";
import { autoinicio } from "./autoinicio.mjs";
import { compilarIcono, hayIcono, lanzarIcono, RUTA_EXE } from "./icono.mjs";
import { backlogCli } from "./backlog.mjs";
import { agregarProyecto, crearBandeja, leerConfig, MOTORES, quitarProyecto } from "./bandeja.mjs";
import {
  buscarKiro, estadoMcpUsuario, instalarAgente, instalarSteering, registrarMcpUsuario, RUTA_AGENTE, RUTA_MCP_USUARIO,
  RUTA_STEERING, sesionKiro,
} from "./kiro.mjs";
import { listarProyectos } from "./proyectos.mjs";
import { BANDEJA_POR_DEFECTO, barras, CONFIG_USUARIO, guardarConfigUsuario, leerConfigUsuario, REPO } from "./rutas.mjs";

const CLI = join(REPO, "bin", "asistente.mjs");

/**
 * Instalación sin preguntas, con las respuestas en un JSON (lo usa el instalador gráfico de Windows):
 * { bandeja, proyectos: [{ nombre, carpeta, motor }], instalarBacklog, kiro, menu, escritorio,
 *   autoinicio, iniciar }. La lista de proyectos reemplaza a la actual (las tareas no se tocan).
 * Imprime una línea por paso; termina con "LISTO" o con "ERROR: ..." y código 1.
 */
export async function instalarDesdeArchivo(ruta) {
  const c = JSON.parse(readFileSync(ruta, "utf8"));
  const paso = (m) => console.log(m);
  try {
    let cli;
    try { cli = backlogCli(); } catch {
      if (!c.instalarBacklog) throw new Error("Falta Backlog.md (npm i -g backlog.md)");
      paso("Instalando Backlog.md (npm i -g backlog.md)...");
      const r = spawnSync("npm", ["i", "-g", "backlog.md"], { encoding: "utf8", shell: true, windowsHide: true });
      if (r.status !== 0) throw new Error(`No se pudo instalar Backlog.md:\n${r.stderr || r.stdout}`);
      cli = backlogCli();
    }
    paso(`OK: Backlog.md (${cli})`);

    const bandeja = barras(c.bandeja || BANDEJA_POR_DEFECTO);
    const nueva = crearBandeja(bandeja);
    guardarConfigUsuario({ ...leerConfigUsuario(), bandeja });
    paso(`OK: bandeja ${nueva ? "creada" : "existente (se conservan sus tareas)"} en ${bandeja}`);

    const pedidos = c.proyectos ?? [];
    for (const n of Object.keys(leerConfig(bandeja).proyectos)) {
      if (!pedidos.some((p) => p.nombre === n)) { quitarProyecto(bandeja, n); paso(`OK: proyecto ${n} quitado`); }
    }
    for (const p of pedidos) {
      agregarProyecto(bandeja, { nombre: p.nombre, carpeta: p.carpeta, motor: p.motor || "kiro" });
      paso(`OK: proyecto ${p.nombre} (${p.motor || "kiro"}) en ${barras(p.carpeta)}`);
    }

    if (c.kiro) {
      if (!buscarKiro()) paso("AVISO: no encontré Kiro CLI; instalalo y volvé a ejecutar el instalador");
      else {
        instalarAgente(bandeja);
        registrarMcpUsuario(bandeja);
        instalarSteering(Object.keys(leerConfig(bandeja).proyectos));
        paso("OK: conectado con Kiro (agente, acceso a la bandeja desde el chat e instrucciones)");
      }
    }

    if (process.platform === "win32") {
      if (hayIcono()) spawnSync(RUTA_EXE, ["--detener"], { windowsHide: true });
      try { compilarIcono(); paso("OK: ícono junto al reloj"); }
      catch (e) { paso(`AVISO: sin ícono junto al reloj (${e.message.split("\n")[0]})`); }
    }
    if (c.menu) { crearAccesos({ escritorio: !!c.escritorio }); paso(`OK: "Asistente de tareas" en el menú Inicio${c.escritorio ? " y en el escritorio" : ""}`); }
    else quitarAccesos();
    try {
      autoinicio(c.autoinicio ? "activar" : "desactivar", bandeja);
    } catch (e) { paso(`AVISO: ${e.message}`); }

    if (c.iniciar) {
      if (hayIcono()) lanzarIcono({ abrir: true });
      else spawn(process.execPath, [CLI, "iniciar"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      paso("OK: asistente iniciado");
    }
    paso("LISTO");
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    process.exitCode = 1;
  }
}

export async function instalar(op) {
  if (op.config) return instalarDesdeArchivo(op.config);
  const rl = op.si ? null : createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  // El iterador guarda las líneas en orden (sirve también si las respuestas llegan pegadas o por pipe);
  // si se termina la entrada, se usa el valor por defecto.
  const lineas = rl?.[Symbol.asyncIterator]();
  const preguntar = async (texto, porDefecto = "") => {
    if (!rl) return porDefecto;
    process.stdout.write(porDefecto ? `${texto} [${porDefecto}]: ` : `${texto}: `);
    const { value, done } = await lineas.next();
    if (!process.stdin.isTTY) process.stdout.write(`${done ? "" : value}\n`);
    return (done ? "" : value).trim() || porDefecto;
  };
  const confirmar = async (texto, si = true) => {
    const r = (await preguntar(`${texto} (s/n)`, si ? "s" : "n")).toLowerCase();
    return r.startsWith("s") || r.startsWith("y");
  };

  try {
    console.log(`Instalador del Asistente de tareas

Una bandeja de tareas con tablero web. Cada tarea que cargues (en el tablero o pidiéndosela a Kiro)
la toma una IA, la investiga con el contexto del proyecto al que pertenece y te deja un análisis con
una solución propuesta y un borrador de respuesta.

Te voy a preguntar: dónde guardar las tareas, con qué proyectos trabajar y cómo querés iniciarlo.
Enter acepta lo que está entre [corchetes]. Podés volver a ejecutar este instalador cuando quieras.
`);
    // 1. Requisitos
    console.log("== 1. Requisitos");
    console.log(`- Node ${process.version}`);
    let cli;
    try { cli = backlogCli(); } catch {
      if (!(await confirmar("- Falta Backlog.md. ¿Instalarlo ahora con npm (npm i -g backlog.md)?"))) {
        throw new Error("Backlog.md es necesario. Instalalo con: npm i -g backlog.md");
      }
      // npm es un .cmd en Windows: necesita shell
      const r = spawnSync("npm", ["i", "-g", "backlog.md"], { stdio: "inherit", shell: true });
      if (r.status !== 0) throw new Error("No se pudo instalar Backlog.md");
      cli = backlogCli();
    }
    console.log(`- Backlog.md: ${cli}`);
    const kiro = buscarKiro();
    const sesion = kiro && sesionKiro(kiro);
    console.log(`- Kiro CLI: ${kiro ? `${kiro}${sesion ? ` (${sesion})` : " (sin sesión: ejecutá kiro-cli login)"}` : "no encontrado"}`);

    // 2. Bandeja
    console.log(`\n== 2. Dónde guardar las tareas
Es una carpeta privada (puede tener datos de clientes): no la pongas dentro de un repo que se suba.`);
    const anterior = leerConfigUsuario().bandeja;
    const bandeja = barras(op.bandeja ?? (await preguntar("Ruta de la bandeja", anterior ?? BANDEJA_POR_DEFECTO)));
    const nueva = crearBandeja(bandeja);
    guardarConfigUsuario({ ...leerConfigUsuario(), bandeja });
    console.log(`${nueva ? "Creada" : "Ya existía (se conservan sus tareas)"}: ${bandeja}`);

    // 3. Proyectos
    console.log(`\n== 3. Proyectos
Un proyecto es la carpeta donde la IA busca contexto para resolver las tareas (por ejemplo, el repo
o la carpeta de documentación de tu equipo). La IA solo LEE esa carpeta; nunca la modifica.
Si cargás un solo proyecto, todas las tareas van a ese.`);
    if (Object.keys(leerConfig(bandeja).proyectos).length) { console.log("Proyectos actuales:"); listarProyectos(bandeja); }
    while (rl && (await confirmar("¿Agregar un proyecto?", Object.keys(leerConfig(bandeja).proyectos).length === 0))) {
      try {
        const nombre = await preguntar("  Nombre corto (así aparece en el tablero, por ejemplo SmartHome)");
        const carpeta = await preguntar("  Carpeta del proyecto (podés pegar la ruta)");
        const motor = await preguntar(`  IA que lo atiende (${MOTORES.join("/")})`, "kiro");
        const p = agregarProyecto(bandeja, { nombre, carpeta: carpeta.replace(/^"|"$/g, ""), motor });
        console.log(`  OK: ${nombre} -> ${p.motor} en ${p.carpeta}`);
      } catch (e) { console.log(`  No se agregó: ${e.message}`); }
    }

    // 4. Kiro
    console.log("\n== 4. Conexión con Kiro");
    if (!kiro) {
      console.log("No encontré Kiro CLI. Instalalo, iniciá sesión (kiro-cli login) y volvé a ejecutar el instalador.");
    } else {
      if (!sesion) console.log("Kiro CLI no tiene sesión iniciada: ejecutá kiro-cli login (sin eso la IA no puede trabajar).");
      console.log(`Se agrega a tu usuario de Kiro (no a tus proyectos):
  - el agente que procesa las tareas,
  - el acceso a la bandeja desde el chat de Kiro, para que le puedas decir "creá una tarea en la bandeja: ..."`);
      if (await confirmar("¿Conectar con Kiro?")) {
        instalarAgente(bandeja);
        if (estadoMcpUsuario(bandeja) !== "distinto" || (await confirmar(
          "  Kiro ya apuntaba a otra bandeja. ¿Cambiarlo a esta?", true))) registrarMcpUsuario(bandeja);
        instalarSteering(Object.keys(leerConfig(bandeja).proyectos));
        console.log(`OK (${RUTA_AGENTE}, ${RUTA_MCP_USUARIO}, ${RUTA_STEERING})`);
      }
    }

    // 5. Accesos directos y arranque
    console.log("\n== 5. Cómo iniciarlo");
    if (process.platform === "win32") {
      try {
        if (hayIcono()) spawnSync(RUTA_EXE, ["--detener"]); // si estaba abierto, se cierra para reemplazarlo
        console.log(`Ícono junto al reloj: ${compilarIcono()}`);
      } catch (e) {
        console.log(`No se pudo crear el ícono junto al reloj (${e.message.split("\n")[0]}); se usa una consola minimizada.`);
      }
    }
    let conAcceso = false;
    if (await confirmar(`¿Crear "Asistente de tareas" en el menú Inicio (doble clic para iniciarlo)?`)) {
      try {
        for (const r of crearAccesos({ escritorio: await confirmar("  ¿También en el escritorio?", false) })) console.log(`OK: ${r}`);
        conAcceso = true;
      } catch (e) { console.log(`No se pudo crear: ${e.message}`); }
    }
    if (await confirmar("¿Que arranque solo cada vez que prendés la PC?", false)) {
      try { autoinicio("activar", bandeja); } catch (e) { console.log(`No se pudo activar: ${e.message}`); }
    }

    // 6. Resumen
    console.log(`\n== Listo
Configuración de usuario: ${CONFIG_USUARIO}
Bandeja: ${bandeja}
  - instrucciones.md: tus instrucciones propias para el asistente (rol, área, a quién escalar)
  - conocimiento/<proyecto>/: procedimientos que no están en el repo del proyecto

Para usarlo: ${conAcceso ? `doble clic en "Asistente de tareas" (menú Inicio) o ` : ""}node "${CLI}" iniciar
Creá tareas en el tablero (con proyecto) o pedíselas a Kiro en el chat de cualquier proyecto.`);

    if (rl && (await confirmar("\n¿Iniciar el asistente ahora?"))) {
      rl.close();
      spawn(process.execPath, [CLI, "iniciar"], { stdio: "inherit" }).on("close", (c) => process.exit(c ?? 0));
      return;
    }
  } finally {
    rl?.close();
  }
}
