// Handler real: le pide a Kiro CLI (modo no interactivo) que procese la tarea del evento.
// Las instrucciones del asistente están en asistente.md (incluido desde .kiro/steering/).
// Requiere haber iniciado sesión antes con `kiro-cli login`.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const kiro = process.env.KIRO_BIN
  ?? [join(process.env.LOCALAPPDATA ?? "", "Kiro-Cli", "kiro-cli.exe")].find(existsSync)
  ?? "kiro-cli";

const id = process.env.TASK_ID;
const prompt =
  `Procesá la tarea ${id} de la bandeja siguiendo las instrucciones de asistente.md (está en esta carpeta). ` +
  `Evento: ${process.env.EVENT}. Al terminar respondé solo con una línea: "<id> -> <status final>".`;

// Herramientas permitidas. Por defecto: leer archivos y el MCP de backlog.
// Para habilitar también la CLI por terminal (por ejemplo en Linux): KIRO_TRUST=fs_read,@backlog,execute_bash
// (en Windows la terminal de Kiro puede usar PowerShell, que en algunas PCs de empresa está restringido).
const trust = process.env.KIRO_TRUST ?? "fs_read,@backlog";
const args = ["chat", "--no-interactive", `--trust-tools=${trust}`];
if (trust.includes("@backlog")) args.push("--require-mcp-startup");
if (process.env.KIRO_MODEL) args.push("--model", process.env.KIRO_MODEL);
args.push(prompt);

const r = spawnSync(kiro, args, { encoding: "utf8", timeout: 5 * 60 * 1000 });
if (r.error) { console.error(r.error.message); process.exit(1); }
// Kiro escribe el progreso de las herramientas en stderr; al log va solo la última línea de la respuesta
const salida = (r.stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
if (r.status !== 0) console.error((r.stderr ?? "").trim().split(/\r?\n/).slice(-5).join("\n"));
console.log(salida.at(-1) ?? "(sin respuesta)");
process.exit(r.status ?? 1);
