// Handler real: le pide a Kiro CLI (modo no interactivo) que procese la tarea del evento.
// Se ejecuta EN LA CARPETA DEL PROYECTO (PROJECT_DIR) para que Kiro use su contexto, con el agente de
// usuario `asistente-tareas` (~/.kiro/agents), que suma asistente.md y el MCP `backlog` de la bandeja.
// Requiere haber iniciado sesión antes con `kiro-cli login`.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const kiro = process.env.KIRO_BIN
  ?? [join(process.env.LOCALAPPDATA ?? "", "Kiro-Cli", "kiro-cli.exe")].find(existsSync)
  ?? "kiro-cli";

const id = process.env.TASK_ID;
const bandeja = process.env.BANDEJA || process.cwd();
const proyecto = process.env.PROJECT_NAME || "";
const carpeta = process.env.PROJECT_DIR || bandeja;

const prompt =
  `Procesá la tarea ${id} siguiendo asistente.md. ` +
  (proyecto ? `Pertenece al proyecto ${proyecto}: estás en su carpeta, usá su contexto. ` : "") +
  `La bandeja está en ${bandeja} (adjuntos en ${bandeja}/adjuntos/${id.toLowerCase()}/, ` +
  `conocimiento en ${bandeja}/conocimiento/${proyecto}/). Evento: ${process.env.EVENT}. ` +
  `Al terminar respondé solo con una línea: "<id> -> <status final>".`;

const args = ["chat", "--no-interactive", "--agent", process.env.KIRO_AGENT ?? "asistente-tareas"];
// Los permisos salen del agente (allowedTools). KIRO_TRUST los reemplaza, por ejemplo para habilitar
// la terminal en Linux: KIRO_TRUST=read,grep,glob,@backlog,shell
// (en Windows la terminal de Kiro puede usar PowerShell, que en algunas PCs de empresa está restringido).
if (process.env.KIRO_TRUST) args.push(`--trust-tools=${process.env.KIRO_TRUST}`);
const modelo = process.env.KIRO_MODEL || process.env.PROJECT_MODEL;
if (modelo) args.push("--model", modelo);
args.push("--require-mcp-startup", prompt);

const r = spawnSync(kiro, args, { cwd: carpeta, encoding: "utf8", timeout: 10 * 60 * 1000 });
if (r.error) { console.error(r.error.message); process.exit(1); }
// Kiro escribe el progreso de las herramientas en stderr; al log va solo la última línea de la respuesta
const salida = (r.stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
if (r.status !== 0) console.error((r.stderr ?? "").trim().split(/\r?\n/).slice(-5).join("\n"));
console.log(salida.at(-1) ?? "(sin respuesta)");
process.exit(r.status ?? 1);
