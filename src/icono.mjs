// Programas de Windows del asistente, compilados en cada PC con el compilador de C# que trae Windows
// (.NET Framework 4.x): no hace falta instalar nada y los binarios nunca van al repo.
//   - Ícono junto al reloj (windows/AsistenteTareas.cs) -> %LOCALAPPDATA%\asistente-tareas\
//   - Instalador con ventana (windows/Instalador.cs)    -> dist\Instalar Asistente de tareas.exe
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { generarIco } from "./ico.mjs";
import { REPO } from "./rutas.mjs";

const CLI = join(REPO, "bin", "asistente.mjs");
const DIR_LOCAL = process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? "", "asistente-tareas") : null;
export const RUTA_EXE = DIR_LOCAL && join(DIR_LOCAL, "asistente-tareas.exe");
export const RUTA_INSTALADOR = join(REPO, "dist", "Instalar Asistente de tareas.exe");

function compilador() {
  const raiz = join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET");
  return [join(raiz, "Framework64", "v4.0.30319", "csc.exe"), join(raiz, "Framework", "v4.0.30319", "csc.exe")].find(existsSync);
}

/** Compila un .cs a un .exe de ventana (GUI: sin consola), con el ícono del asistente. */
function compilar(fuente, destino, referencias) {
  if (process.platform !== "win32") throw new Error("Solo en Windows.");
  const csc = compilador();
  if (!csc) throw new Error("No encontré el compilador de C# de Windows (.NET Framework 4).");
  mkdirSync(join(destino, ".."), { recursive: true });
  const ico = generarIco(join(destino, "..", "asistente.ico"));
  rmSync(destino, { force: true });
  const r = spawnSync(csc, ["-nologo", "-target:winexe", "-optimize", `-out:${destino}`, `-win32icon:${ico}`,
    ...referencias.map((x) => `-r:${x}`), fuente], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0 || !existsSync(destino)) throw new Error(`No compiló:\n${r.stdout}${r.stderr}`);
  return destino;
}

/** Compila el ícono junto al reloj. */
export const compilarIcono = () =>
  compilar(join(REPO, "windows", "AsistenteTareas.cs"), RUTA_EXE, ["System.Windows.Forms.dll", "System.Drawing.dll"]);

/** Compila el instalador con ventana en dist/. */
export const compilarInstalador = () =>
  compilar(join(REPO, "windows", "Instalador.cs"), RUTA_INSTALADOR,
    ["System.Windows.Forms.dll", "System.Drawing.dll", "System.Web.Extensions.dll"]);

export const hayIcono = () => !!RUTA_EXE && existsSync(RUTA_EXE);

/** Argumentos para el .exe del ícono (también los usan los accesos directos). */
export const argsIcono = (...extra) => ["--node", process.execPath, "--cli", CLI, ...extra];

/** Lanza el ícono (que a su vez levanta el asistente sin ventana). */
export function lanzarIcono({ abrir = true } = {}) {
  spawn(RUTA_EXE, argsIcono(...(abrir ? ["--abrir"] : [])), { detached: true, stdio: "ignore" }).unref();
}

export function quitarIcono() {
  if (!RUTA_EXE || !existsSync(RUTA_EXE)) return null;
  rmSync(RUTA_EXE, { force: true });
  rmSync(join(DIR_LOCAL, "asistente.ico"), { force: true });
  return RUTA_EXE;
}
