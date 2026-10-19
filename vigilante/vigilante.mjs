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
import { backlogSpawn } from "../src/backlog.mjs";
import { leerConfig, rutaInstrucciones } from "../src/bandeja.mjs";
import { ASISTENTE_MD } from "../src/rutas.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const MOTORES = { kiro: join(aqui, "motores", "kiro.mjs"), claude: join(aqui, "motores", "claude.mjs") };
const PENDIENTE = "Pendiente";

export function vigilar(bandeja) {
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
    const nombre = ev.task.project ?? cfg.proyectoPorDefecto;
    const proyecto = nombre && cfg.proyectos[nombre];
    if (!proyecto) {
      return log(`  ! ${ev.task.id} sin proyecto configurado (${nombre ?? "vacío"}): queda en Pendiente. ` +
        `Asignale un proyecto o agregalo con: asistente proyecto agregar`);
    }
    const script = MOTORES[proyecto.motor];
    if (!script) return log(`  ! motor desconocido "${proyecto.motor}" en el proyecto ${nombre}`);

    encolar(nombre, ev.task.id, () => new Promise((fin) => {
      const inicio = Date.now();
      log(`  > ${ev.task.id} -> ${proyecto.motor} en ${nombre}`);
      const p = spawn(process.execPath, [script], {
        cwd: proyecto.carpeta,
        env: {
          ...process.env,
          EVENT: ev.type,
          TASK_ID: ev.task.id,
          TASK_TITLE: ev.task.title ?? "",
          BANDEJA: bandeja,
          PROJECT_NAME: nombre,
          PROJECT_DIR: proyecto.carpeta,
          PROJECT_MODEL: proyecto.modelo ?? "",
          ASISTENTE_MD: ASISTENTE_MD,
          INSTRUCCIONES_MD: rutaInstrucciones(bandeja),
        },
      });
      p.stdin.end(JSON.stringify(ev));
      p.stdout.on("data", (d) => log(`    [${ev.task.id}] ${d.toString().trim()}`));
      p.stderr.on("data", (d) => log(`    [${ev.task.id}!] ${d.toString().trim()}`));
      p.on("error", (e) => { log(`  ! ${ev.task.id}: ${e.message}`); fin(); });
      p.on("close", (code) => {
        log(`  < ${ev.task.id} terminó (código ${code}, ${Math.round((Date.now() - inicio) / 1000)} s)`);
        fin();
      });
    }));
  }

  function despachar(ev) {
    const extra = ev.type === "task.moved" ? ` ${ev.from} -> ${ev.to}` : "";
    log(`EVENTO ${ev.type} ${ev.task.id} [${ev.task.project ?? "sin proyecto"}] "${ev.task.title}"${extra}`);
    const nueva = ev.type === "task.created" && ev.task.status === PENDIENTE;
    const respondida = ev.type === "task.moved" && ev.to === PENDIENTE;
    if (nueva || respondida) procesar(ev);
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
  watch.on("close", (code) => { log(`backlog --watch terminó (código ${code})`); process.exit(code ?? 1); });
  const salir = () => { watch.kill(); process.exit(0); };
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);
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
    else if (huella(antes) !== huella(t)) eventos.push({ type: "task.updated", task: t });
  }
  for (const [id, t] of prev) if (!curr.has(id)) eventos.push({ type: "task.deleted", task: t });
  return eventos;
}
