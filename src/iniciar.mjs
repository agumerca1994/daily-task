// `asistente iniciar | detener | actividad`.
//
// iniciar (doble clic): arranca el asistente EN SEGUNDO PLANO (sin ventana), espera a que esté listo,
//   abre el tablero, avisa con una notificación y termina. Si ya estaba corriendo, solo abre el tablero.
// iniciar --ventana: todo en esta ventana, con la actividad a la vista (Ctrl+C o cerrar la ventana lo
//   detiene). Útil para seguimiento.
// iniciar --servicio: el proceso de segundo plano (lo lanza `iniciar`; no hace falta usarlo a mano).
// detener: cierra el asistente que está corriendo en segundo plano.
// actividad: muestra el registro en vivo (cerrar esa ventana NO detiene el asistente).
import { spawn, spawnSync } from "node:child_process";
import { hayIcono, lanzarIcono, RUTA_EXE } from "./icono.mjs";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, watchFile } from "node:fs";
import { join } from "node:path";
import { abrirNavegador } from "./accesos.mjs";
import { pedirDetener, servirAdjuntos, PUERTO_ADJUNTOS, yaCorriendo } from "./adjuntos.mjs";
import { backlogSpawn } from "./backlog.mjs";
import { notificar } from "./notificar.mjs";
import { REPO } from "./rutas.mjs";
import { vigilar } from "../vigilante/vigilante.mjs";

export const PUERTO_TABLERO = 6420;
const CLI = join(REPO, "bin", "asistente.mjs");
const urlTablero = (op) => `http://127.0.0.1:${op.puerto ?? PUERTO_TABLERO}`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const responde = async (url) => { try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } };
const avisar = (titulo, texto) => notificar(titulo, texto).catch(() => {});

export async function iniciar(bandeja, op = {}) {
  const url = urlTablero(op);
  if (await yaCorriendo()) {
    console.log(`El asistente ya está corriendo. Tablero: ${url}`);
    if (!op["no-abrir"]) abrirNavegador(url);
    return;
  }
  if (op.ventana || op.servicio) return correr(bandeja, op);

  // Windows con el ícono compilado: el ícono levanta el asistente sin ventana y abre el tablero
  if (hayIcono()) {
    lanzarIcono({ abrir: !op["no-abrir"] });
    return console.log("Iniciando: el asistente queda en el ícono junto al reloj.");
  }

  // Lanzador: proceso oculto e independiente de esta ventana
  console.log("Iniciando el asistente en segundo plano...");
  const args = [CLI, "iniciar", "--servicio", "--bandeja", bandeja];
  if (op.puerto) args.push("--puerto", String(op.puerto));
  spawn(process.execPath, args, { detached: true, windowsHide: true, stdio: "ignore" }).unref();

  for (let i = 0; i < 60 && !((await yaCorriendo()) && (await responde(url))); i++) await esperar(500);
  if (!(await responde(url))) {
    console.error(`No arrancó. Mirá el registro: ${join(bandeja, "logs", "asistente.log")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Listo. Tablero: ${url}`);
  if (!op["no-abrir"]) abrirNavegador(url);
  await avisar("Asistente de tareas iniciado", "Trabaja en segundo plano. Para cerrarlo: menú Inicio > Detener asistente de tareas");
}

export async function detener() {
  if (hayIcono()) spawnSync(RUTA_EXE, ["--detener"]); // cierra también el ícono junto al reloj
  if (!(await yaCorriendo())) return console.log("El asistente está detenido.");
  console.log((await pedirDetener()) ? "Asistente detenido." : "No respondió al pedido de cierre.");
}

/** Muestra el final del registro y lo sigue en vivo. */
export function actividad(bandeja) {
  const log = join(bandeja, "logs", "vigilante.log");
  mkdirSync(join(bandeja, "logs"), { recursive: true });
  if (!existsSync(log)) appendFileSync(log, "");
  process.title = "Asistente de tareas - actividad";
  yaCorriendo().then((b) => console.log(b
    ? "El asistente está corriendo. Cerrar esta ventana NO lo detiene.\n"
    : "El asistente NO está corriendo (menú Inicio > Asistente de tareas para iniciarlo).\n"));
  let leido = Math.max(0, statSync(log).size - 4000);
  const mostrar = () => {
    const tam = statSync(log).size;
    if (tam < leido) leido = 0;
    if (tam > leido) process.stdout.write(readFileSync(log).subarray(leido, tam).toString("utf8"));
    leido = tam;
  };
  mostrar();
  watchFile(log, { interval: 500 }, mostrar);
}

// --- El asistente propiamente dicho: tablero + adjuntos + vigilante
async function correr(bandeja, op) {
  process.title = "Asistente de tareas";
  const logs = join(bandeja, "logs");
  mkdirSync(logs, { recursive: true });
  if (op.servicio) {
    // Sin ventana: lo que se imprimiría va al registro
    const archivo = join(logs, "asistente.log");
    const escribir = (...a) => appendFileSync(archivo, `${new Date().toISOString()} ${a.join(" ")}\n`);
    console.log = escribir;
    console.error = escribir;
  }
  const url = urlTablero(op);
  console.log(`Asistente de tareas — bandeja ${bandeja}`);
  if (op.ventana) console.log("Cerrar esta ventana (o Ctrl+C) detiene el asistente.\n");

  const procesos = [];
  let cerrando = false;
  const cerrar = (codigo = 0) => {
    if (cerrando) return;
    cerrando = true;
    for (const p of procesos) try { p(); } catch { /* ya cerrado */ }
    const fin = () => process.exit(codigo);
    if (op.servicio && codigo === 0) avisar("Asistente de tareas detenido", "").finally(fin); else fin();
  };

  // Tablero (Backlog.md no abre el navegador solo: lo abre el lanzador o, con --ventana, esta función)
  const tablero = backlogSpawn(["browser", "--port", String(op.puerto ?? PUERTO_TABLERO), "--no-open"], { cwd: bandeja });
  let abierto = false;
  tablero.stdout.on("data", (d) => {
    if (abierto || !/https?:\/\//.test(d.toString())) return;
    abierto = true;
    console.log(`Tablero:   ${url}`);
    if (op.ventana && !op["no-abrir"]) abrirNavegador(url);
  });
  tablero.stderr.on("data", (d) => console.error(`tablero: ${d.toString().trim()}`));
  tablero.on("close", (code) => { if (!cerrando) { console.error(`El tablero se cerró (código ${code})`); cerrar(1); } });
  procesos.push(() => tablero.kill());

  // Adjuntos (y pedido de cierre de `asistente detener`)
  try {
    const server = await servirAdjuntos(bandeja, { alDetener: () => cerrar(0) });
    console.log(`Adjuntos:  http://127.0.0.1:${PUERTO_ADJUNTOS}/  (${bandeja}/adjuntos)`);
    procesos.push(() => server.close());
  } catch (e) {
    console.error(`No se pudo levantar el servidor de adjuntos (${e.code ?? e.message}); sigo sin él.`);
  }

  // Vigilante
  const v = vigilar(bandeja, { alTerminar: () => { console.error("El vigilante se cortó"); cerrar(1); } });
  procesos.push(() => v.detener());

  process.on("SIGINT", () => cerrar(0));
  process.on("SIGTERM", () => cerrar(0));
}
