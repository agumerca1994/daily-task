// Accesos directos para usar el asistente con doble clic (sin permisos de administrador).
//   Windows: carpeta "Asistente de tareas" en el menú Inicio con tres accesos (.lnk creados con
//            WScript.Shell desde un PowerShell inline; si PowerShell está bloqueado, .cmd):
//              - Asistente de tareas: ícono junto al reloj + asistente sin ventana + abre el tablero
//              - Ver actividad: el registro en vivo (esta sí abre una ventana)
//              - Detener asistente de tareas
//            Si el ícono no se pudo compilar, los accesos usan node directamente (con una consola
//            minimizada un instante). Opcionalmente, el principal también en el escritorio.
//   Linux:   los mismos tres como .desktop en ~/.local/share/applications.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { argsIcono, hayIcono, RUTA_EXE } from "./icono.mjs";
import { REPO } from "./rutas.mjs";

const NOMBRE = "Asistente de tareas";
const CLI = join(REPO, "bin", "asistente.mjs");
const comillas = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

// Qué ejecuta cada acceso. ventana: 1 normal, 7 minimizada.
function accesos() {
  const icono = process.platform === "win32" && hayIcono();
  const node = (cmd) => ({ destino: process.execPath, args: [CLI, cmd] });
  return [
    { id: "asistente-tareas", nombre: NOMBRE, consola: false, ventana: icono ? 1 : 7,
      descripcion: "Inicia el asistente (sin ventana) y abre el tablero",
      ...(icono ? { destino: RUTA_EXE, args: argsIcono("--abrir") } : node("iniciar")) },
    { id: "asistente-tareas-actividad", nombre: "Ver actividad del asistente", consola: true, ventana: 1,
      descripcion: "Muestra en vivo lo que hace el asistente (cerrar la ventana no lo detiene)", ...node("actividad") },
    { id: "asistente-tareas-detener", nombre: "Detener asistente de tareas", consola: false, ventana: 7,
      descripcion: "Cierra el asistente",
      ...(icono ? { destino: RUTA_EXE, args: ["--detener"] } : node("detener")) },
  ];
}

function carpetas() {
  if (process.platform === "win32") {
    const programas = join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
    return { menu: join(programas, NOMBRE), menuViejo: programas, escritorio: join(homedir(), "Desktop") };
  }
  return { menu: join(homedir(), ".local", "share", "applications"), escritorio: join(homedir(), "Desktop") };
}

/** Crea un .lnk (Windows). Devuelve la ruta creada (o un .cmd si PowerShell está bloqueado). */
export function crearLnk(dir, a) {
  const lnk = join(dir, `${a.nombre}.lnk`);
  const ps = [
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:ASIS_LNK)",
    "$s.TargetPath = $env:ASIS_DESTINO",
    "$s.Arguments = $env:ASIS_ARGS",
    "$s.WorkingDirectory = $env:ASIS_REPO",
    "$s.Description = $env:ASIS_DESC",
    "$s.WindowStyle = [int]$env:ASIS_VENTANA",
    "$s.Save()",
  ].join("; ");
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env, ASIS_LNK: lnk, ASIS_DESTINO: a.destino, ASIS_ARGS: a.args.map(comillas).join(" "),
      ASIS_REPO: REPO, ASIS_DESC: a.descripcion, ASIS_VENTANA: String(a.ventana),
    },
  });
  if (r.status === 0 && existsSync(lnk)) return lnk;
  const cmd = join(dir, `${a.nombre}.cmd`);
  writeFileSync(cmd, `@echo off\r\nstart "" ${[a.destino, ...a.args].map((x) => `"${x}"`).join(" ")}\r\n`);
  return cmd;
}

function crearDesktop(dir, a) {
  const ruta = join(dir, `${a.id}.desktop`);
  writeFileSync(ruta, `[Desktop Entry]
Type=Application
Name=${a.nombre}
Comment=${a.descripcion}
Exec=${[a.destino, ...a.args].map((x) => `"${x}"`).join(" ")}
Terminal=${a.consola}
Categories=Office;ProjectManagement;
`, { mode: 0o755 });
  return ruta;
}

const crear = (dir, a) => (process.platform === "win32" ? crearLnk(dir, a) : crearDesktop(dir, a));

/** Acceso principal sin abrir el tablero (lo usa el autoinicio de Windows). */
export function accesoPrincipalSinAbrir() {
  const a = accesos()[0];
  return { ...a, args: a.args.filter((x) => x !== "--abrir"), ...(a.destino === process.execPath ? { args: [CLI, "iniciar", "--no-abrir"] } : {}) };
}

/** Crea los accesos en el menú (y el principal en el escritorio si se pide). Devuelve las rutas. */
export function crearAccesos({ escritorio = false } = {}) {
  if (process.platform !== "win32" && process.platform !== "linux") {
    throw new Error("Los accesos directos todavía no están soportados en este sistema.");
  }
  quitarAccesos();
  const { menu, escritorio: dirEscritorio } = carpetas();
  mkdirSync(menu, { recursive: true });
  const lista = accesos();
  const creados = lista.map((a) => crear(menu, a));
  if (escritorio && existsSync(dirEscritorio)) creados.push(crear(dirEscritorio, lista[0]));
  return creados;
}

export function quitarAccesos() {
  const { menu, menuViejo, escritorio } = carpetas();
  const quitados = [];
  const borrar = (f) => { if (existsSync(f)) { rmSync(f, { force: true }); quitados.push(f); } };
  for (const dir of [menu, menuViejo, escritorio].filter(Boolean)) {
    for (const a of accesos()) {
      for (const ext of [".lnk", ".cmd"]) borrar(join(dir, `${a.nombre}${ext}`));
      borrar(join(dir, `${a.id}.desktop`));
    }
  }
  if (process.platform === "win32" && existsSync(menu) && readdirSync(menu).length === 0) rmSync(menu, { recursive: true });
  return quitados;
}

/** Abre una URL en el navegador por defecto. */
export function abrirNavegador(url) {
  const [cmd, args] =
    process.platform === "win32" ? ["explorer.exe", [url]]
      : process.platform === "darwin" ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}
