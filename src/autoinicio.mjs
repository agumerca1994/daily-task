// `asistente autoinicio activar|desactivar|estado`: arranca el asistente al iniciar sesión.
//   Windows: acceso en la carpeta Inicio del usuario (sin permisos de administrador). Con el ícono
//            compilado arranca sin ninguna ventana y queda el ícono junto al reloj; si no, un .cmd que
//            muestra una consola minimizada un instante.
//   Linux:   servicio de usuario de systemd.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { accesoPrincipalSinAbrir, crearLnk } from "./accesos.mjs";
import { REPO } from "./rutas.mjs";

const NOMBRE = "asistente-tareas";
const CLI = join(REPO, "bin", "asistente.mjs");

const dirInicioWindows = () => join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const posiblesWindows = () => [join(dirInicioWindows(), `${NOMBRE}.lnk`), join(dirInicioWindows(), `${NOMBRE}.cmd`)];
const unidadLinux = () => join(homedir(), ".config", "systemd", "user", `${NOMBRE}.service`);

function soportado() {
  if (process.platform !== "win32" && process.platform !== "linux") {
    throw new Error("El autoinicio todavía no está soportado en este sistema (solo Windows y Linux).");
  }
}

const systemctl = (...args) => spawnSync("systemctl", ["--user", ...args], { stdio: "inherit" });

export function autoinicio(accion, bandeja) {
  soportado();
  switch (accion) {
    case "activar": {
      let ruta;
      if (process.platform === "win32") {
        for (const f of posiblesWindows()) rmSync(f, { force: true });
        mkdirSync(dirInicioWindows(), { recursive: true });
        ruta = crearLnk(dirInicioWindows(), { ...accesoPrincipalSinAbrir(), nombre: NOMBRE });
      } else {
        ruta = unidadLinux();
        mkdirSync(dirname(ruta), { recursive: true });
        writeFileSync(ruta, `[Unit]
Description=Asistente de tareas (tablero, vigilante y adjuntos)

[Service]
ExecStart="${process.execPath}" "${CLI}" iniciar --servicio --bandeja "${bandeja}"
Restart=on-failure

[Install]
WantedBy=default.target
`);
        systemctl("enable", "--now", `${NOMBRE}.service`);
      }
      return console.log(`Autoinicio activado: ${ruta}\nArranca en el próximo inicio de sesión.`);
    }
    case "desactivar":
      if (process.platform === "linux") { systemctl("disable", "--now", `${NOMBRE}.service`); rmSync(unidadLinux(), { force: true }); }
      else for (const f of posiblesWindows()) rmSync(f, { force: true });
      return console.log("Autoinicio desactivado.");
    case "estado": case undefined: {
      const ruta = process.platform === "win32" ? posiblesWindows().find(existsSync) : (existsSync(unidadLinux()) && unidadLinux());
      return console.log(ruta ? `Activado: ${ruta}` : "Desactivado.");
    }
    default:
      throw new Error(`Acción desconocida: ${accion} (activar, desactivar, estado)`);
  }
}
