// Motor Kiro CLI: procesa la tarea en modo no interactivo, parado en la carpeta del proyecto, con el
// agente de usuario `asistente-tareas` (suma asistente.md, instrucciones.md, el steering del proyecto
// y el MCP `backlog` de la bandeja). Requiere haber iniciado sesión con `kiro-cli login`.
//
// Variables opcionales:
//   KIRO_MODEL  modelo a usar (si no, el del proyecto o el de Kiro)
//   KIRO_TRUST  reemplaza los permisos del agente; por ejemplo, para habilitar la terminal en Linux:
//               KIRO_TRUST=read,grep,glob,@backlog,shell
import { spawnSync } from "node:child_process";
import { AGENTE, buscarKiro } from "../../src/kiro.mjs";
import { promptProcesar, terminar } from "./comun.mjs";

const kiro = buscarKiro();
if (!kiro) terminar(1, "No encuentro Kiro CLI (kiro-cli). Instalalo o definí KIRO_BIN.");

const args = ["chat", "--no-interactive", "--agent", process.env.KIRO_AGENT ?? AGENTE, "--require-mcp-startup"];
if (process.env.KIRO_TRUST) args.push(`--trust-tools=${process.env.KIRO_TRUST}`);
const modelo = process.env.KIRO_MODEL || process.env.PROJECT_MODEL;
if (modelo) args.push("--model", modelo);
args.push(promptProcesar());

const r = spawnSync(kiro, args, { cwd: process.env.PROJECT_DIR, encoding: "utf8", timeout: 10 * 60 * 1000 });
if (r.error) terminar(1, r.error.message);
if (r.status !== 0) {
  const err = `${r.stderr ?? ""}`.trim().split(/\r?\n/).slice(-5).join("\n");
  terminar(r.status ?? 1, /not logged in|login/i.test(err) ? `Kiro CLI sin sesión: ejecutá kiro-cli login\n${err}` : err);
}
terminar(0, ultimaLinea(r.stdout));

function ultimaLinea(texto) {
  return `${texto ?? ""}`.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "(sin respuesta)";
}
