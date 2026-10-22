// Vigilante de la bandeja (al estilo de los webhooks/callbacks de kanban-lite).
//
// Escucha `backlog task list --json --watch`, compara cada lista con la anterior y emite:
//   task.created  -> apareció una tarea nueva
//   task.moved    -> cambió el status
//   task.updated  -> cambió otra cosa (título, etiquetas, cuerpo...)
//   task.deleted  -> la tarea desapareció de la lista
// Una tarea nueva en `Pendiente`, o una que vuelve a `Pendiente` (respuesta del usuario), se manda al
// motor de IA de su proyecto (asistente.json), que se ejecuta en la carpeta de ese proyecto.
// Se procesa una tarea a la vez por proyecto.

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backlog, backlogSpawn } from "../src/backlog.mjs";
import { leerConfig, rutaInstrucciones } from "../src/bandeja.mjs";
import { nombreAgente } from "../src/kiro.mjs";
import { notificar } from "../src/notificar.mjs";
import { estadoKiro } from "../src/sesion.mjs";
import { ASISTENTE_MD } from "../src/rutas.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const MOTORES = { kiro: join(aqui, "motores", "kiro.mjs"), claude: join(aqui, "motores", "claude.mjs") };
const PENDIENTE = "Pendiente";
const PARA_AVISAR = ["Para revisar", "Esperando info"];

/** Empieza a vigilar la bandeja. Devuelve { detener }. `alTerminar` se llama si --watch se corta. */
export function vigilar(bandeja, { alTerminar = (code) => process.exit(code ?? 1) } = {}) {
  mkdirSync(join(bandeja, "logs"), { recursive: true });
  const logFile = join(bandeja, "logs", "vigilante.log");
  const log = (msg) => {
    const linea = `${new Date().toISOString()} ${msg}`;
    console.log(linea);
    appendFileSync(logFile, linea + "\n");
  };

  // --- Cola por proyecto y tareas ya encoladas
  const colas = new Map();
  const encoladas = new Set();
  const encolar = (proyecto, id, trabajo) => {
    if (encoladas.has(id)) return log(`  - ${id} ya está en cola o en curso`);
    encoladas.add(id);
    const anterior = colas.get(proyecto) ?? Promise.resolve();
    colas.set(proyecto, anterior.then(trabajo).catch((e) => log(`  ! ${id}: ${e.message}`)).finally(() => encoladas.delete(id)));
  };

  function procesar(ev) {
    const cfg = leerConfig(bandeja); // se relee en cada evento: los cambios de proyectos aplican sin reiniciar
    const nombres = Object.keys(cfg.proyectos);
    // Sin proyecto: el por defecto, o el único configurado
    const nombre = ev.task.project ?? cfg.proyectoPorDefecto ?? (nombres.length === 1 ? nombres[0] : null);
    const proyecto = nombre && cfg.proyectos[nombre];
    if (!proyecto) {
      const motivo = nombre ? `el proyecto "${nombre}" no está configurado` : "no tiene proyecto";
      log(`  ! ${ev.task.id} ${motivo}: queda en Pendiente hasta que tenga uno (${nombres.join(", ") || "no hay proyectos"})`);
      return avisar(`${ev.task.id}: falta el proyecto`,
        nombres.length ? `Elegilo en el tablero (Project): ${nombres.join(", ")}` : "No hay proyectos configurados: ejecutá el instalador");
    }
    const script = MOTORES[proyecto.motor];
    if (!script) return log(`  ! motor desconocido "${proyecto.motor}" en el proyecto ${nombre}`);
    if (!ev.task.project) {
      // Se eligió el proyecto por defecto: queda escrito en la tarea para verlo y filtrarlo en el tablero
      const r = backlog(["task", "edit", ev.task.id, "--project", nombre], { cwd: bandeja });
      log(r.status === 0 ? `  · ${ev.task.id} sin proyecto: se asigna ${nombre}` : `  ! no se pudo asignar ${nombre} a ${ev.task.id}`);
    }

    encolar(nombre, ev.task.id, async () => {
      // Sin sesión de Kiro la tarea queda en Pendiente (no se gasta un intento) y se retoma al reconectar
      if (proyecto.motor === "kiro") {
        const s = await estadoKiro();
        if (!s.conectado) {
          esperandoSesion = true;
          log(`  ~ ${ev.task.id} espera: Kiro ${s.instalado ? "sin sesión" : "no está instalado"}`);
          if (Date.now() - ultimoAvisoSesion > 60 * 60 * 1000) {
            ultimoAvisoSesion = Date.now();
            avisar("Kiro sin sesión", "Las tareas esperan. Reconectá desde el tablero (arriba a la derecha).");
          }
          return;
        }
      }
      await ejecutarMotor();
    });

    const ejecutarMotor = () => new Promise((fin) => {
      const inicio = Date.now();
      log(`  > ${ev.task.id} -> ${proyecto.motor} en ${nombre}`);
      const p = spawn(process.execPath, [script], {
        cwd: proyecto.carpeta,
        windowsHide: true,
        env: {
          ...process.env,
          EVENT: ev.type,
          TASK_ID: ev.task.id,
          TASK_TITLE: ev.task.title ?? "",
          BANDEJA: bandeja,
          PROJECT_NAME: nombre,
          PROJECT_DIR: proyecto.carpeta,
          PROJECT_MODEL: proyecto.modelo ?? "",
          PROJECT_AGENT: nombreAgente(nombre, proyecto),
          PROJECT_ARCHIVOS: proyecto.archivos === "escritura" ? "escritura" : "lectura",
          PROJECT_CONECTORES: Object.entries(proyecto.conectores ?? {}).map(([s, x]) => `${s} (${Array.isArray(x) ? x.join("+") : x})`).join(", "),
          ASISTENTE_MD: ASISTENTE_MD,
          INSTRUCCIONES_MD: rutaInstrucciones(bandeja),
        },
      });
      p.stdin.end(JSON.stringify(ev));
      p.stdout.on("data", (d) => log(`    [${ev.task.id}] ${d.toString().trim()}`));
      p.stderr.on("data", (d) => log(`    [${ev.task.id}!] ${d.toString().trim()}`));
      p.on("error", (e) => { log(`  ! ${ev.task.id}: ${e.message}`); fin(); });
      let error = "";
      p.stderr.on("data", (d) => { error += d; });
      p.on("close", (code) => {
        log(`  < ${ev.task.id} terminó (código ${code}, ${Math.round((Date.now() - inicio) / 1000)} s)`);
        if (code !== 0) {
          // Si se cortó a mitad de camino (por ejemplo, venció la sesión), vuelve a Pendiente para reintentar
          const t = backlog(["task", "view", ev.task.id, "--json"], { cwd: bandeja });
          let estadoActual = null;
          try { estadoActual = JSON.parse(t.stdout).task.status; } catch { /* sin datos */ }
          if (estadoActual === "En análisis") {
            backlog(["task", "edit", ev.task.id, "-s", PENDIENTE], { cwd: bandeja });
            log(`  · ${ev.task.id} vuelve a Pendiente para reintentar`);
          }
          if (/sesión|login/i.test(error)) { esperandoSesion = true; estadoKiro({ forzar: true }); }
          avisar(`${ev.task.id}: falló ${proyecto.motor}`, error.trim().split(/\r?\n/).at(-1) || `código ${code}`);
        }
        fin();
      });
    });
  }

  // --- Sesión de Kiro: cuando vuelve, se procesa lo que quedó esperando
  let esperandoSesion = false;
  let ultimoAvisoSesion = 0;
  const revisarSesion = setInterval(async () => {
    if (!esperandoSesion) return;
    const s = await estadoKiro({ forzar: true });
    if (!s.conectado || !anterior) return;
    esperandoSesion = false;
    const pendientes = [...anterior.values()].filter((t) => t.status === PENDIENTE);
    log(`Kiro reconectado: ${pendientes.length} tarea(s) pendiente(s)`);
    if (pendientes.length) avisar("Kiro reconectado", `Procesando ${pendientes.length} tarea(s) pendiente(s).`);
    for (const t of pendientes) despachar({ type: "task.created", task: t, inicial: true });
  }, 30 * 1000);

  function despachar(ev) {
    const extra = ev.type === "task.moved" ? ` ${ev.from} -> ${ev.to}` : "";
    log(`EVENTO ${ev.type} ${ev.task.id} [${ev.task.project ?? "sin proyecto"}] "${ev.task.title}"${extra}`);
    const nueva = ev.type === "task.created" && ev.task.status === PENDIENTE;
    const respondida = ev.type === "task.moved" && ev.to === PENDIENTE;
    // Tarea que esperaba proyecto y se lo asignaron en el tablero
    const conProyecto = ev.type === "task.updated" && ev.task.status === PENDIENTE && ev.antes?.project !== ev.task.project;
    if (nueva || respondida || conProyecto) procesar(ev);
    if (ev.type === "task.moved" && PARA_AVISAR.includes(ev.to)) avisar(`${ev.task.id}: ${ev.to}`, ev.task.title);
  }

  function avisar(titulo, texto) {
    if (leerConfig(bandeja).notificaciones === false) return;
    notificar(titulo, texto).catch((e) => log(`  ! no se pudo notificar: ${e.message}`));
  }

  // --- Lectura del --watch
  let anterior = null;
  const lector = crearLector((obj) => {
    const actual = new Map((obj.tasks ?? []).map((t) => [t.id, t]));
    if (anterior === null) {
      log(`Vigilando ${bandeja} (${actual.size} tareas)`);
      if (leerConfig(bandeja).procesarPendientesAlIniciar) {
        for (const t of actual.values()) if (t.status === PENDIENTE) despachar({ type: "task.created", task: t, inicial: true });
      }
    } else {
      for (const ev of diff(anterior, actual)) despachar(ev);
    }
    anterior = actual;
  }, log);

  const watch = backlogSpawn(["task", "list", "--json", "--watch"], { cwd: bandeja });
  watch.stdout.setEncoding("utf8");
  watch.stdout.on("data", lector);
  watch.stderr.on("data", (d) => log(`backlog: ${d.toString().trim()}`));
  let deteniendo = false;
  watch.on("close", (code) => {
    if (deteniendo) return;
    log(`backlog --watch terminó (código ${code})`);
    alTerminar(code);
  });
  return { detener: () => { deteniendo = true; clearInterval(revisarSesion); watch.kill(); } };
}

// Objetos JSON completos, uno detrás de otro (pueden venir partidos en varios chunks)
function crearLector(onObjeto, log) {
  let buf = "", depth = 0, inStr = false, esc = false, start = -1;
  return (chunk) => {
    for (const ch of chunk) {
      buf += ch;
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") { if (depth++ === 0) start = buf.length - 1; }
      else if (ch === "}" && --depth === 0) {
        const texto = buf.slice(start);
        buf = "";
        try { onObjeto(JSON.parse(texto)); } catch (e) { log(`JSON inválido: ${e.message}`); }
      }
    }
  };
}

const huella = (t) => JSON.stringify({ ...t, updatedAt: undefined });

function diff(prev, curr) {
  const eventos = [];
  for (const [id, t] of curr) {
    const antes = prev.get(id);
    if (!antes) eventos.push({ type: "task.created", task: t });
    else if (antes.status !== t.status) eventos.push({ type: "task.moved", task: t, from: antes.status, to: t.status });
    else if (huella(antes) !== huella(t)) eventos.push({ type: "task.updated", task: t, antes });
  }
  for (const [id, t] of prev) if (!curr.has(id)) eventos.push({ type: "task.deleted", task: t });
  return eventos;
}
