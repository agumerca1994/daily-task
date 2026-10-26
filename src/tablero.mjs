// Tablero propio (http://127.0.0.1:6420): interfaz en español sobre la misma bandeja de Backlog.md.
// - Lee las tareas de los archivos (rápido, sin abrir procesos) y la lista de `backlog task list --json`.
// - Escribe SIEMPRE con la CLI de Backlog.md (como la IA), nunca editando los archivos a mano.
// - Avisa a la página de cada cambio en vivo (Server-Sent Events sobre fs.watch de las tareas).
// - Solo escucha en 127.0.0.1; los POST exigen el encabezado x-asistente (no los puede hacer otra web).
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, normalize, sep } from "node:path";
import { PUERTO_ADJUNTOS } from "./adjuntos.mjs";
import { backlog } from "./backlog.mjs";
import { ESTADOS, leerConfig } from "./bandeja.mjs";
import { abrirLogin, estadoSesion } from "./sesion.mjs";
import { borrarProyecto, guardarGeneral, guardarInstrucciones, guardarProyecto, leerConfiguracion, modelosKiro } from "./configuracion.mjs";
import { REPO } from "./rutas.mjs";

export const PUERTO_TABLERO = 6420;
const ESTATICOS = join(REPO, "tablero");
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const PRIORIDADES = { alta: "high", media: "medium", baja: "low" };
const IMAGEN = /\.(png|jpe?g|gif|webp)$/i;

// ---------------------------------------------------------------- Lectura
const seccion = (texto, nombre) => {
  const m = texto.match(new RegExp(`<!-- SECTION:${nombre}:BEGIN -->\\r?\\n?([\\s\\S]*?)\\r?\\n?<!-- SECTION:${nombre}:END -->`));
  return m ? m[1].trim() : "";
};

/** Separa la descripción en mensaje, origen y el resto de las secciones propias. */
function partesDescripcion(desc) {
  const corte = desc.search(/^## /m);
  const mensaje = (corte < 0 ? desc : desc.slice(0, corte)).trim();
  const origen = desc.match(/^## Origen\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? "";
  const campo = (n) => origen.match(new RegExp(`^-\\s*${n}:\\s*(.+)$`, "mi"))?.[1].trim() ?? null;
  const nota = desc.match(/^## Nota mía\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1].trim() ?? "";
  return { mensaje, app: campo("App"), de: campo("De"), nota };
}

function archivoDe(bandeja, id) {
  const dir = join(bandeja, "backlog", "tasks");
  const prefijo = `${id.toLowerCase()} - `;
  const f = existsSync(dir) && readdirSync(dir).find((n) => n.toLowerCase().startsWith(prefijo));
  return f ? join(dir, f) : null;
}

function imagenesDe(bandeja, id) {
  const dir = join(bandeja, "adjuntos", id.toLowerCase());
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => IMAGEN.test(n)).map((n) => `/adjuntos/${id.toLowerCase()}/${encodeURIComponent(n)}`);
}

function listar(bandeja) {
  const r = backlog(["task", "list", "--json"], { cwd: bandeja });
  if (r.status !== 0) throw new Error(r.stderr || "backlog task list falló");
  return JSON.parse(r.stdout).tasks.map((t) => {
    const f = archivoDe(bandeja, t.id);
    const texto = f ? readFileSync(f, "utf8") : "";
    const p = partesDescripcion(seccion(texto, "DESCRIPTION"));
    return {
      id: t.id, titulo: t.title, estado: t.status, proyecto: t.project, prioridad: t.priority,
      etiquetas: t.labels ?? [], creada: t.createdAt, actualizada: t.updatedAt ?? t.createdAt,
      app: p.app, de: p.de, resumen: p.mensaje.slice(0, 160), conAnalisis: /### Análisis IA/.test(seccion(texto, "NOTES")),
    };
  });
}

function detalle(bandeja, id) {
  const r = backlog(["task", "view", id, "--json"], { cwd: bandeja });
  if (r.status !== 0) return null;
  const t = JSON.parse(r.stdout).task;
  const p = partesDescripcion(t.description ?? "");
  return {
    id: t.id, titulo: t.title, estado: t.status, proyecto: t.project, prioridad: t.priority,
    etiquetas: t.labels ?? [], links: t.references ?? [], creada: t.createdAt, actualizada: t.updatedAt ?? t.createdAt,
    ...p, notas: t.implementationNotes ?? "", imagenes: imagenesDe(bandeja, t.id),
  };
}

// ---------------------------------------------------------------- Escritura (siempre con la CLI)
function ejecutar(bandeja, args) {
  const r = backlog(args, { cwd: bandeja });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "backlog falló").trim().split("\n").slice(-3).join(" "));
  return r.stdout;
}

const ahora = () => new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

function nombreSeguro(n, i) {
  const ext = (extname(n || "").toLowerCase().match(/^\.(png|jpe?g|gif|webp)$/) ? extname(n).toLowerCase() : ".png");
  const base = basename(n || "", extname(n || "")).normalize("NFD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${base || "imagen"}-${i + 1}${ext}`;
}

function crear(bandeja, d) {
  const titulo = (d.titulo ?? "").trim();
  const mensaje = (d.mensaje ?? "").trim();
  if (!titulo) throw new Error("Falta el título.");
  if (!mensaje) throw new Error("Falta el mensaje.");
  const cfg = leerConfig(bandeja);
  if (d.proyecto && !cfg.proyectos[d.proyecto]) throw new Error(`El proyecto ${d.proyecto} no está configurado.`);

  const origen = [d.origen && `- App: ${d.origen}`, d.de && `- De: ${d.de}`].filter(Boolean);
  let descripcion = mensaje;
  if (origen.length) descripcion += `\n\n## Origen\n${origen.join("\n")}`;
  if ((d.nota ?? "").trim()) descripcion += `\n\n## Nota mía\n${d.nota.trim()}`;

  // Se crea "En análisis" para que el vigilante no la tome antes de guardar las imágenes; al final
  // pasa a Pendiente y ahí la procesa.
  const args = ["task", "create", titulo, "-d", descripcion, "-s", "En análisis", "--plain"];
  if (d.proyecto) args.push("--project", d.proyecto);
  if (PRIORIDADES[d.prioridad]) args.push("--priority", PRIORIDADES[d.prioridad]);
  const etiquetas = (d.etiquetas ?? []).map((e) => e.trim()).filter(Boolean);
  if (etiquetas.length) args.push("-l", etiquetas.join(","));
  if ((d.link ?? "").trim()) args.push("--ref", d.link.trim());
  const id = ejecutar(bandeja, args).match(/TASK-\d+/i)?.[0]?.toUpperCase();
  if (!id) throw new Error("No pude leer el id de la tarea creada.");

  try {
    const imagenes = (d.imagenes ?? []).slice(0, 20);
    if (imagenes.length) {
      const dir = join(bandeja, "adjuntos", id.toLowerCase());
      mkdirSync(dir, { recursive: true });
      const links = imagenes.map((img, i) => {
        const nombre = nombreSeguro(img.nombre, i);
        writeFileSync(join(dir, nombre), Buffer.from(String(img.datos).replace(/^data:[^,]+,/, ""), "base64"));
        return `- ![${nombre}](http://127.0.0.1:${PUERTO_ADJUNTOS}/${id.toLowerCase()}/${nombre})`;
      });
      ejecutar(bandeja, ["task", "edit", id, "-d", `${descripcion}\n\n## Adjuntos\n${links.join("\n")}`]);
    }
  } finally {
    ejecutar(bandeja, ["task", "edit", id, "-s", "Pendiente"]);
  }
  return id;
}

function responder(bandeja, id, texto) {
  if (!(texto ?? "").trim()) throw new Error("Escribí la respuesta.");
  ejecutar(bandeja, ["task", "edit", id, "--append-notes", `### Respuestas (${ahora()})\n${texto.trim()}`, "-s", "Pendiente"]);
}

function mover(bandeja, id, estado) {
  if (!ESTADOS.includes(estado)) throw new Error(`Estado desconocido: ${estado}`);
  ejecutar(bandeja, ["task", "edit", id, "-s", estado]);
}

// ---------------------------------------------------------------- Servidor
function leerCuerpo(req, limite = 30 * 1024 * 1024) {
  return new Promise((ok, mal) => {
    let tam = 0;
    const partes = [];
    req.on("data", (c) => { tam += c.length; if (tam > limite) { mal(new Error("Demasiado grande (máximo 30 MB).")); req.destroy(); } else partes.push(c); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(partes).toString("utf8") || "{}")); } catch { mal(new Error("JSON inválido")); } });
    req.on("error", mal);
  });
}

export function servirTablero(bandeja, { puerto = PUERTO_TABLERO } = {}) {
  const clientes = new Set();
  let espera;
  const avisar = () => {
    clearTimeout(espera);
    espera = setTimeout(() => { for (const c of clientes) c.write("data: cambio\n\n"); }, 250);
  };
  const dirTareas = join(bandeja, "backlog", "tasks");
  mkdirSync(dirTareas, { recursive: true });
  const vigia = watch(dirTareas, avisar);
  const latido = setInterval(() => { for (const c of clientes) c.write(": ping\n\n"); }, 25000);

  const json = (res, codigo, datos) => res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(datos));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const ruta = url.pathname;
    try {
      if (req.method === "POST" && req.headers["x-asistente"] !== "1") return json(res, 403, { error: "Pedido no permitido" });

      if (req.method === "GET" && ruta === "/api/estado") {
        const cfg = leerConfig(bandeja);
        const motores = Object.fromEntries(Object.entries(cfg.proyectos).map(([n, p]) => [n, p.motor]));
        return json(res, 200, { estados: ESTADOS, proyectos: Object.keys(cfg.proyectos), motores, porDefecto: cfg.proyectoPorDefecto, bandeja });
      }
      if (req.method === "GET" && ruta === "/api/tareas") return json(res, 200, listar(bandeja));

      // Sesión de cada IA que usan los proyectos
      if (req.method === "GET" && ruta === "/api/sesiones") {
        const usados = [...new Set(Object.values(leerConfig(bandeja).proyectos).map((p) => p.motor))];
        const forzar = url.searchParams.has("ahora");
        const sesiones = await Promise.all(usados.map(async (m) => ({ motor: m, ...(await estadoSesion(m, { forzar })) })));
        return json(res, 200, sesiones);
      }
      const login = ruta.match(/^\/api\/sesiones\/(kiro|claude)\/login$/);
      if (req.method === "POST" && login) return json(res, 200, { mensaje: abrirLogin(login[1]) });

      // Configuración
      if (req.method === "GET" && ruta === "/api/config") return json(res, 200, leerConfiguracion(bandeja));
      if (req.method === "GET" && ruta === "/api/modelos") return json(res, 200, modelosKiro());
      if (req.method === "POST" && ruta === "/api/config/proyecto") {
        const avisos = guardarProyecto(bandeja, await leerCuerpo(req, 1024 * 1024));
        return json(res, 200, { ok: true, avisos });
      }
      if (req.method === "POST" && ruta === "/api/config/quitar") {
        const { nombre } = await leerCuerpo(req, 1024 * 1024);
        return json(res, 200, { ok: true, avisos: borrarProyecto(bandeja, nombre) });
      }
      if (req.method === "POST" && ruta === "/api/config/general") {
        guardarGeneral(bandeja, await leerCuerpo(req, 1024 * 1024));
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && ruta === "/api/config/instrucciones") {
        guardarInstrucciones(bandeja, (await leerCuerpo(req, 1024 * 1024)).texto);
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET" && ruta === "/api/eventos") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write("retry: 2000\n\n");
        clientes.add(res);
        return req.on("close", () => clientes.delete(res));
      }
      let m = ruta.match(/^\/api\/tareas\/(TASK-\d+)$/i);
      if (req.method === "GET" && m) {
        const d = detalle(bandeja, m[1].toUpperCase());
        return d ? json(res, 200, d) : json(res, 404, { error: "No existe esa tarea" });
      }
      if (req.method === "POST" && ruta === "/api/tareas") return json(res, 201, { id: crear(bandeja, await leerCuerpo(req)) });
      m = ruta.match(/^\/api\/tareas\/(TASK-\d+)\/(responder|estado|archivar)$/i);
      if (req.method === "POST" && m) {
        const id = m[1].toUpperCase();
        const cuerpo = await leerCuerpo(req, 1024 * 1024);
        if (m[2] === "responder") responder(bandeja, id, cuerpo.texto);
        else if (m[2] === "estado") mover(bandeja, id, cuerpo.estado);
        else ejecutar(bandeja, ["task", "archive", id]);
        return json(res, 200, { ok: true });
      }

      if (req.method !== "GET") return json(res, 405, { error: "Método no permitido" });

      // Imágenes adjuntas de esta bandeja (solo imágenes, solo dentro de adjuntos/)
      if (ruta.startsWith("/adjuntos/")) {
        const raiz = normalize(join(bandeja, "adjuntos"));
        const f = normalize(join(raiz, decodeURIComponent(ruta.slice("/adjuntos/".length))));
        if (!f.startsWith(raiz + sep) || !IMAGEN.test(f) || !existsSync(f)) return res.writeHead(404).end();
        res.writeHead(200, { "Content-Type": `image/${extname(f).slice(1).replace("jpg", "jpeg")}`, "X-Content-Type-Options": "nosniff" });
        return createReadStream(f).pipe(res);
      }

      // Archivos de la interfaz
      const archivo = normalize(join(ESTATICOS, ruta === "/" ? "index.html" : decodeURIComponent(ruta)));
      if (!archivo.startsWith(ESTATICOS + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) {
        return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
      }
      res.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      createReadStream(archivo).pipe(res);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  });
  server.on("close", () => { vigia.close(); clearInterval(latido); });
  return new Promise((ok, mal) => {
    server.once("error", mal);
    server.listen(puerto, "127.0.0.1", () => ok(server));
  });
}
