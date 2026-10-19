// Servidor local de adjuntos: el tablero de Backlog.md no entrega archivos locales, así que las
// imágenes de las tareas se enlazan como http://127.0.0.1:6421/<task-id>/<archivo>.
// Solo escucha en 127.0.0.1 y solo sirve lo que está dentro de <bandeja>/adjuntos.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

export const PUERTO_ADJUNTOS = 6421;
const MARCA = "/__asistente"; // responde la ruta de la bandeja: sirve para saber si ya está corriendo

const DETENER = "/__detener";
// Encabezado propio: obliga a un preflight CORS que este servidor no responde, así una página web
// cualquiera no puede detener el asistente desde el navegador.
const ENCABEZADO = "x-asistente";

/** Si ya hay un `asistente iniciar` corriendo, devuelve su bandeja; si no, null. */
export async function yaCorriendo(puerto = PUERTO_ADJUNTOS) {
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}${MARCA}`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

/** Le pide al asistente que está corriendo que se cierre. Devuelve true si respondió. */
export async function pedirDetener(puerto = PUERTO_ADJUNTOS) {
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}${DETENER}`, {
      method: "POST", headers: { [ENCABEZADO]: "1" }, signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch { return false; }
}

const TIPOS = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
  ".html": "text/plain; charset=utf-8", // se muestra como texto: nunca se ejecuta HTML capturado
  ".json": "application/json; charset=utf-8",
};

export function servirAdjuntos(bandeja, { puerto = PUERTO_ADJUNTOS, alDetener } = {}) {
  const raiz = normalize(join(bandeja, "adjuntos"));
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === DETENER && req.headers[ENCABEZADO] === "1" && alDetener) {
      res.writeHead(200).end("ok");
      return setTimeout(alDetener, 100);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
    if (req.url === MARCA) return res.writeHead(200, { "Content-Type": "text/plain" }).end(bandeja);
    let ruta;
    try { ruta = normalize(join(raiz, decodeURIComponent(new URL(req.url, "http://x").pathname))); }
    catch { return res.writeHead(400).end(); }
    if (ruta !== raiz && !ruta.startsWith(raiz + sep)) return res.writeHead(403).end();
    let info;
    try { info = statSync(ruta); } catch { return res.writeHead(404).end("No encontrado"); }
    if (!info.isFile()) return res.writeHead(404).end("No encontrado");
    res.writeHead(200, {
      "Content-Type": TIPOS[extname(ruta).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size,
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(ruta).pipe(res);
  });
  return new Promise((ok, mal) => {
    server.once("error", mal);
    server.listen(puerto, "127.0.0.1", () => ok(server));
  });
}
