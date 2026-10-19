// `asistente diagnostico --json`: qué hay instalado y qué está configurado. Lo usa el instalador
// gráfico de Windows para mostrar los requisitos y completar los valores actuales.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { backlogCli } from "./backlog.mjs";
import { leerConfig } from "./bandeja.mjs";
import { hayIcono } from "./icono.mjs";
import { buscarKiro, sesionKiro } from "./kiro.mjs";
import { BANDEJA_POR_DEFECTO, leerConfigUsuario, REPO } from "./rutas.mjs";

export function diagnostico() {
  let backlog = null;
  try { backlog = backlogCli(); } catch { /* falta */ }
  const kiro = buscarKiro();
  const bandeja = leerConfigUsuario().bandeja ?? null;
  const hayBandeja = bandeja && existsSync(join(bandeja, "backlog"));
  const proyectos = hayBandeja
    ? Object.entries(leerConfig(bandeja).proyectos).map(([nombre, p]) => ({ nombre, carpeta: p.carpeta, motor: p.motor }))
    : [];
  return {
    node: process.version,
    repo: REPO.replace(/\\/g, "/"),
    backlog,
    kiro: kiro ? { bin: kiro, sesion: sesionKiro(kiro) } : null,
    bandeja,
    bandejaPorDefecto: BANDEJA_POR_DEFECTO,
    proyectos,
    icono: hayIcono(),
  };
}
