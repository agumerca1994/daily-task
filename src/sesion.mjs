// Estado de la sesión de cada IA (Kiro CLI, Claude Code) y reconexión.
// - estadoSesion(motor): `kiro-cli whoami` o `claude auth status`, con caché de 60 s. Con Kiro, cuando
//   hay sesión, recuerda el proveedor de identidad y la región para la próxima reconexión (en la
//   configuración de usuario, nunca en el repo).
// - abrirLogin(motor): el inicio de sesión de las dos IAs necesita una terminal (no se puede hacer en
//   segundo plano), así que abre una ventana con el comando de login; el usuario lo completa ahí y en
//   el navegador.
import { execFile, spawn } from "node:child_process";
import { buscarClaude, sesionClaude } from "./claude.mjs";
import { buscarKiro } from "./kiro.mjs";
import { guardarConfigUsuario, leerConfigUsuario } from "./rutas.mjs";

const TTL = 60 * 1000;
const caches = {};

function whoamiKiro(kiro) {
  return new Promise((ok) => {
    execFile(kiro, ["whoami"], { encoding: "utf8", windowsHide: true, timeout: 20000 }, (err, stdout = "", stderr = "") => {
      ok({ codigo: err ? (err.code ?? 1) : 0, salida: `${stdout}\n${stderr}` });
    });
  });
}

async function sesionKiro() {
  const kiro = buscarKiro();
  if (!kiro) return { instalado: false, conectado: false };
  const { codigo, salida } = await whoamiKiro(kiro);
  const conectado = codigo === 0 && !/not logged in/i.test(salida);
  const usuario = salida.match(/^Email:\s*(.+)$/mi)?.[1]?.trim() ?? null;
  if (conectado) {
    const proveedor = salida.match(/IAM Identity Center \((https?:\/\/[^)\s]+)\)/i)?.[1];
    const region = salida.match(/arn:aws:[\w-]+:([a-z]{2}-[a-z]+-\d):/i)?.[1];
    const actual = leerConfigUsuario();
    if (proveedor && region && (actual.kiroLogin?.proveedor !== proveedor || actual.kiroLogin?.region !== region)) {
      guardarConfigUsuario({ ...actual, kiroLogin: { proveedor, region } });
    }
  }
  return { instalado: true, conectado, usuario };
}

/** { instalado, conectado, usuario, revisado } de "kiro" o "claude". */
export async function estadoSesion(motor, { forzar = false } = {}) {
  const c = (caches[motor] ??= { estado: null, cuando: 0, pendiente: null });
  if (!forzar && c.estado && Date.now() - c.cuando < TTL) return c.estado;
  if (c.pendiente) return c.pendiente;
  c.pendiente = (async () => {
    const estado = motor === "claude" ? await sesionClaude() : await sesionKiro();
    Object.assign(c, { estado: { ...estado, revisado: new Date().toISOString() }, cuando: Date.now(), pendiente: null });
    return c.estado;
  })();
  return c.pendiente;
}

export const estadoKiro = (op) => estadoSesion("kiro", op);

/** Abre la ventana de inicio de sesión de esa IA. Devuelve un texto para mostrar. */
export function abrirLogin(motor) {
  let exe, args, mensaje;
  if (motor === "claude") {
    exe = buscarClaude();
    if (!exe) throw new Error("No encuentro Claude Code en esta PC.");
    args = ["auth", "login"];
    mensaje = "Se abrió la ventana de Claude: completá el inicio de sesión en el navegador.";
  } else {
    exe = buscarKiro();
    if (!exe) throw new Error("No encuentro Kiro CLI en esta PC.");
    const datos = leerConfigUsuario().kiroLogin;
    args = ["login"];
    if (datos?.proveedor && datos?.region) args.push("--license", "pro", "--identity-provider", datos.proveedor, "--region", datos.region);
    mensaje = datos
      ? "Se abrió la ventana de Kiro: confirmá con Enter lo que te propone y aprobá el acceso en el navegador."
      : "Se abrió la ventana de Kiro: elegí tu tipo de cuenta (en el trabajo, la de la empresa) y aprobá el acceso en el navegador.";
  }
  if (process.platform !== "win32") throw new Error(`Abrí una terminal y ejecutá: ${exe} ${args.join(" ")}`);
  // `start` abre una consola nueva y visible (el login necesita una terminal)
  spawn("cmd.exe", ["/c", "start", `Iniciar sesión (${motor})`, exe, ...args], { detached: true, stdio: "ignore", windowsHide: false }).unref();
  if (caches[motor]) caches[motor].cuando = 0; // la próxima consulta vuelve a revisar
  return mensaje;
}

export const abrirLoginKiro = () => abrirLogin("kiro");
