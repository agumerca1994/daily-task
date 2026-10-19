// `asistente empaquetar`: genera dist/asistente-tareas-windows-<version>.zip para compartir:
//   asistente-tareas/
//     Instalar Asistente de tareas.exe   <- doble clic
//     LEEME.txt
//     bin/ src/ vigilante/ asistente/ windows/ package.json README.md instalar.cmd instalar.sh
// No incluye spikes/, PLAN.md, dist/ ni ninguna bandeja. El .zip se arma sin dependencias (deflate de
// node:zlib); el .exe se compila antes con `compilar-instalador`.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";
import { compilarInstalador, RUTA_INSTALADOR } from "./icono.mjs";
import { REPO } from "./rutas.mjs";

const RAIZ = "asistente-tareas";
const INCLUIR = ["bin", "src", "vigilante", "asistente", "windows", "tablero", "package.json", "README.md", "instalar.cmd", "instalar.sh"];

function archivos(ruta) {
  const info = statSync(ruta);
  if (info.isFile()) return [ruta];
  return readdirSync(ruta).flatMap((n) => archivos(join(ruta, n)));
}

// --- ZIP mínimo (deflate, nombres UTF-8)
const TABLA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = TABLA[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function fechaDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    fecha: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function zip(entradas) {
  const partes = [], central = [];
  let offset = 0;
  for (const { nombre, datos, fecha } of entradas) {
    const n = Buffer.from(nombre, "utf8");
    const comprimido = deflateRawSync(datos, { level: 9 });
    const { hora, fecha: dia } = fechaDos(fecha);
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(hora, 10); local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comprimido.length, 18); local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10); cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(dia, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comprimido.length, 20); cen.writeUInt32LE(datos.length, 24);
    cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    partes.push(local, n, comprimido);
    central.push(cen, n);
    offset += local.length + n.length + comprimido.length;
  }
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, dir, fin]);
}

export function empaquetar() {
  const version = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version;
  compilarInstalador();
  const entradas = [];
  const agregar = (ruta, nombre) => entradas.push({ nombre: `${RAIZ}/${nombre}`, datos: readFileSync(ruta), fecha: statSync(ruta).mtime });
  agregar(RUTA_INSTALADOR, "Instalar Asistente de tareas.exe");
  agregar(join(REPO, "windows", "LEEME.txt"), "LEEME.txt");
  for (const item of INCLUIR) {
    for (const f of archivos(join(REPO, item))) agregar(f, relative(REPO, f).replace(/\\/g, "/"));
  }
  const destino = join(REPO, "dist", `asistente-tareas-windows-${version}.zip`);
  writeFileSync(destino, zip(entradas));
  return { destino, archivos: entradas.length };
}
