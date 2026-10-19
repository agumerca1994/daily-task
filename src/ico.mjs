// Genera el ícono del asistente (.ico con PNG de 16, 32, 48 y 256 px) sin dependencias: cuadrado
// redondeado azul con una tilde blanca, el mismo dibujo que usa el ícono junto al reloj.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const AZUL = [37, 99, 235];
const TILDE = [[0.25, 0.53], [0.44, 0.72], [0.75, 0.31]];

function distSegmento(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function dentroRedondeado(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

/** Pixeles RGBA de N x N, con antialias por supermuestreo 4x4. */
function dibujar(n) {
  const px = Buffer.alloc(n * n * 4);
  const m = 4, grosor = 0.125 / 2, margen = 0.03;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let fondo = 0, blanco = 0;
      for (let sy = 0; sy < m; sy++) {
        for (let sx = 0; sx < m; sx++) {
          const u = (x + (sx + 0.5) / m) / n, v = (y + (sy + 0.5) / m) / n;
          const uu = (u - margen) / (1 - 2 * margen), vv = (v - margen) / (1 - 2 * margen);
          if (uu < 0 || vv < 0 || uu > 1 || vv > 1 || !dentroRedondeado(uu, vv, 0.25)) continue;
          fondo++;
          if (Math.min(distSegmento(uu, vv, TILDE[0], TILDE[1]), distSegmento(uu, vv, TILDE[1], TILDE[2])) <= grosor) blanco++;
        }
      }
      const i = (y * n + x) * 4, total = m * m;
      if (!fondo) continue;
      const w = blanco / fondo;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(AZUL[c] * (1 - w) + 255 * w);
      px[i + 3] = Math.round((255 * fondo) / total);
    }
  }
  return px;
}

// --- PNG mínimo
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, crc]);
}

function png(n) {
  const rgba = dibujar(n);
  const filas = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) rgba.copy(filas, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6; // RGBA 8 bits
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque("IHDR", ihdr), bloque("IDAT", deflateSync(filas)), bloque("IEND", Buffer.alloc(0)),
  ]);
}

/** Escribe el .ico en `ruta`. */
export function generarIco(ruta, tamanos = [16, 32, 48, 256]) {
  const imagenes = tamanos.map(png);
  const cabecera = Buffer.alloc(6 + 16 * tamanos.length);
  cabecera.writeUInt16LE(1, 2); cabecera.writeUInt16LE(tamanos.length, 4);
  let offset = cabecera.length;
  tamanos.forEach((n, i) => {
    const e = 6 + 16 * i;
    cabecera[e] = n >= 256 ? 0 : n; cabecera[e + 1] = n >= 256 ? 0 : n;
    cabecera.writeUInt16LE(1, e + 4); cabecera.writeUInt16LE(32, e + 6);
    cabecera.writeUInt32LE(imagenes[i].length, e + 8); cabecera.writeUInt32LE(offset, e + 12);
    offset += imagenes[i].length;
  });
  writeFileSync(ruta, Buffer.concat([cabecera, ...imagenes]));
  return ruta;
}
