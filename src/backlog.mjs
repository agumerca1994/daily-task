// Ejecuta Backlog.md con node directamente (sin shell intermedia: evita problemas de comillas y de
// políticas de PowerShell/cmd en Windows, y funciona igual en Linux y macOS).
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

let cli;

/** Ruta a `backlog.md/cli.js` del paquete global de npm. */
export function backlogCli() {
  if (cli) return cli;
  const candidatos = [];
  if (process.env.BACKLOG_CLI) candidatos.push(process.env.BACKLOG_CLI);
  try {
    const raiz = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    candidatos.push(join(raiz, "backlog.md", "cli.js"));
  } catch { /* npm no disponible */ }
  const encontrado = candidatos.find(existsSync);
  if (!encontrado) throw new Error("No encuentro Backlog.md. Instalalo con: npm i -g backlog.md");
  cli = encontrado.replace(/\\/g, "/");
  return cli;
}

/** Comando para lanzar Backlog.md desde otros programas (MCP de Kiro/Claude). */
export const comandoBacklog = () => ({ command: process.execPath.replace(/\\/g, "/"), args: [backlogCli()] });

/** Ejecuta `backlog <args>` y devuelve { status, stdout, stderr }. */
export function backlog(args, { cwd } = {}) {
  return spawnSync(process.execPath, [backlogCli(), ...args], { cwd, encoding: "utf8" });
}

/** Lanza `backlog <args>` como proceso hijo (por ejemplo, `task list --json --watch`). */
export function backlogSpawn(args, { cwd } = {}) {
  return spawn(process.execPath, [backlogCli(), ...args], { cwd });
}
