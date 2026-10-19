// Estado de la sesión de Kiro CLI y reconexión.
// - estadoKiro(): `kiro-cli whoami` (con caché de 60 s). Cuando hay sesión, recuerda el proveedor de
//   identidad y la región para la próxima reconexión (en la configuración de usuario, nunca en el repo).
// - abrirLoginKiro(): el login de Kiro exige una terminal (no se puede hacer en segundo plano), así que
//   abre una ventana con `kiro-cli login` ya completado con esos datos: el usuario confirma con Enter
//   y aprueba en el navegador.
import { execFile, spawn } from "node:child_process";
import { buscarKiro } from "./kiro.mjs";
import { guardarConfigUsuario, leerConfigUsuario } from "./rutas.mjs";

const TTL = 60 * 1000;
let cache = { estado: null, cuando: 0, pendiente: null };

function whoami(kiro) {
  return new Promise((ok) => {
    execFile(kiro, ["whoami"], { encoding: "utf8", windowsHide: true, timeout: 20000 }, (err, stdout = "", stderr = "") => {
      ok({ codigo: err ? (err.code ?? 1) : 0, salida: `${stdout}\n${stderr}` });
    });
  });
}

/** { instalado, conectado, usuario, revisado } */
export async function estadoKiro({ forzar = false } = {}) {
  if (!forzar && cache.estado && Date.now() - cache.cuando < TTL) return cache.estado;
  if (cache.pendiente) return cache.pendiente;
  cache.pendiente = (async () => {
    const kiro = buscarKiro();
    let estado;
    if (!kiro) estado = { instalado: false, conectado: false };
    else {
      const { codigo, salida } = await whoami(kiro);
      const conectado = codigo === 0 && !/not logged in/i.test(salida);
      const usuario = salida.match(/^Email:\s*(.+)$/mi)?.[1]?.trim() ?? null;
      estado = { instalado: true, conectado, usuario };
      if (conectado) {
        const proveedor = salida.match(/IAM Identity Center \((https?:\/\/[^)\s]+)\)/i)?.[1];
        const region = salida.match(/arn:aws:[\w-]+:([a-z]{2}-[a-z]+-\d):/i)?.[1];
        const actual = leerConfigUsuario();
        if (proveedor && region && (actual.kiroLogin?.proveedor !== proveedor || actual.kiroLogin?.region !== region)) {
          guardarConfigUsuario({ ...actual, kiroLogin: { proveedor, region } });
        }
      }
    }
    cache = { estado: { ...estado, revisado: new Date().toISOString() }, cuando: Date.now(), pendiente: null };
    return cache.estado;
  })();
  return cache.pendiente;
}

/** Abre la ventana de inicio de sesión de Kiro. Devuelve un texto para mostrar. */
export function abrirLoginKiro() {
  const kiro = buscarKiro();
  if (!kiro) throw new Error("No encuentro Kiro CLI en esta PC.");
  const datos = leerConfigUsuario().kiroLogin;
  const args = ["login"];
  if (datos?.proveedor && datos?.region) args.push("--license", "pro", "--identity-provider", datos.proveedor, "--region", datos.region);
  if (process.platform !== "win32") {
    throw new Error(`Abrí una terminal y ejecutá: kiro-cli ${args.join(" ")}`);
  }
  // `start` abre una consola nueva y visible (el login de Kiro necesita una terminal)
  spawn("cmd.exe", ["/c", "start", "Iniciar sesión en Kiro", kiro, ...args], { detached: true, stdio: "ignore", windowsHide: false }).unref();
  cache.cuando = 0; // la próxima consulta vuelve a revisar
  return datos
    ? "Se abrió la ventana de Kiro: confirmá con Enter lo que te propone y aprobá el acceso en el navegador."
    : "Se abrió la ventana de Kiro: elegí tu tipo de cuenta (en el trabajo, la de la empresa) y aprobá el acceso en el navegador.";
}
