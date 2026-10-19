// Vigilante de eventos para Backlog.md (al estilo de los webhooks/callbacks de kanban-lite).
//
// Escucha `backlog task list --json --watch`, compara cada lista con la anterior y emite:
//   task.created  -> apareció una tarea nueva
//   task.moved    -> cambió el status
//   task.updated  -> cambió otra cosa (título, etiquetas, cuerpo...)
//   task.deleted  -> la tarea desapareció de la lista
// Por cada evento ejecuta los handlers de eventos.json que coincidan.
//
// Uso: node vigilante.mjs <carpeta-bandeja> [eventos.json]

import { spawn } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const bandeja = resolve(process.argv[2] ?? ".");
// Configuración: eventos.json (local, no se versiona; copiar de eventos.example.json)
const config = JSON.parse(readFileSync(resolve(process.argv[3] ?? `${aqui}/eventos.json`), "utf8"));
const logFile = resolve(aqui, config.log ?? "vigilante.log");

function log(msg) {
  const linea = `${new Date().toISOString()} ${msg}`;
  console.log(linea);
  appendFileSync(logFile, linea + "\n");
}

// --- Lectura del stream: objetos JSON completos, uno detrás de otro (pueden venir en varias líneas)
function crearLector(onObjeto) {
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

// --- Diff entre dos listas -> eventos
const huella = (t) => JSON.stringify({ ...t, updatedDate: undefined, updated_date: undefined });

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

// --- Handlers
function coincide(h, ev) {
  if (h.on !== ev.type && h.on !== "*") return false;
  const w = h.when ?? {};
  if (w.status && w.status !== ev.task.status) return false;
  if (w.from && w.from !== ev.from) return false;
  if (w.to && w.to !== ev.to) return false;
  return true;
}

const enCurso = new Set(); // evita lanzar dos handlers a la vez sobre la misma tarea

// "run": "ia" -> el motor y la carpeta salen del proyecto de la tarea (config.proyectos)
function resolverComando(h, ev) {
  if (h.run !== "ia") return { comando: h.run, proyecto: null };
  const nombre = ev.task.project ?? config.proyectoPorDefecto;
  const proyecto = nombre && config.proyectos?.[nombre];
  if (!proyecto) {
    log(`  ! ${ev.task.id} sin proyecto configurado (${nombre ?? "vacío"}): no se procesa`);
    return null;
  }
  const comando = config.motores?.[proyecto.motor];
  if (!comando) { log(`  ! motor "${proyecto.motor}" no definido en motores`); return null; }
  return { comando, proyecto: { nombre, ...proyecto, carpeta: resolve(proyecto.carpeta) } };
}

function ejecutar(h, ev) {
  const id = ev.task.id;
  const r = resolverComando(h, ev);
  if (!r) return;
  const clave = `${h.name ?? h.run}|${id}`;
  if (enCurso.has(clave)) return log(`  - ${h.name}: ${id} ya en curso, se omite`);
  enCurso.add(clave);
  const donde = r.proyecto ? ` -> ${r.proyecto.motor} en ${r.proyecto.nombre}` : "";
  log(`  > ${h.name ?? h.run} (${ev.type} ${id})${donde}`);
  const p = spawn(r.comando, {
    cwd: bandeja,
    shell: true,
    env: {
      ...process.env,
      EVENT: ev.type,
      TASK_ID: id,
      TASK_TITLE: ev.task.title ?? "",
      TASK_STATUS: ev.task.status ?? "",
      FROM_STATUS: ev.from ?? "",
      TO_STATUS: ev.to ?? "",
      BANDEJA: bandeja,
      PROJECT_NAME: r.proyecto?.nombre ?? "",
      PROJECT_DIR: r.proyecto?.carpeta ?? "",
      PROJECT_MODEL: r.proyecto?.modelo ?? "",
    },
  });
  p.stdin.end(JSON.stringify(ev)); // el evento completo también llega por stdin
  p.stdout.on("data", (d) => log(`    [${h.name}] ${d.toString().trim()}`));
  p.stderr.on("data", (d) => log(`    [${h.name}!] ${d.toString().trim()}`));
  p.on("close", (code) => { enCurso.delete(clave); log(`  < ${h.name} terminó (código ${code})`); });
}

// --- Arranque
let anterior = null;
const lector = crearLector((obj) => {
  const actual = new Map((obj.tasks ?? []).map((t) => [t.id, t]));
  if (anterior === null) {
    log(`Vigilando ${bandeja} (${actual.size} tareas)`);
    // Tareas que quedaron pendientes mientras el vigilante estaba apagado
    if (config.procesarPendientesAlIniciar) {
      anterior = new Map();
      for (const t of actual.values()) if (t.status === config.procesarPendientesAlIniciar)
        despachar({ type: "task.created", task: t, inicial: true });
    }
    anterior = actual;
    return;
  }
  for (const ev of diff(anterior, actual)) despachar(ev);
  anterior = actual;
});

function despachar(ev) {
  const extra = ev.type === "task.moved" ? ` ${ev.from} -> ${ev.to}` : "";
  log(`EVENTO ${ev.type} ${ev.task.id} "${ev.task.title}"${extra}`);
  for (const h of config.handlers ?? []) if (coincide(h, ev)) ejecutar(h, ev);
}

const backlog = spawn("backlog task list --json --watch", { cwd: bandeja, shell: true });
backlog.stdout.setEncoding("utf8");
backlog.stdout.on("data", lector);
backlog.stderr.on("data", (d) => log(`backlog: ${d.toString().trim()}`));
backlog.on("close", (code) => { log(`backlog --watch terminó (código ${code})`); process.exit(code ?? 1); });
process.on("SIGINT", () => { backlog.kill(); process.exit(0); });
