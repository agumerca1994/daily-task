// Comandos que la IA puede ejecutar en un proyecto (por ejemplo `node tools/cloudwatch-logs/cli.js`).
// Cada entrada habilita ese comando con cualquier argumento, ejecutado desde la raíz del proyecto. Nada
// más: cualquier otro comando lo bloquea la IA (Claude, probado) por no estar permitido.
// Siempre bloqueados, aunque el comando esté permitido: las opciones que saltean protecciones de las
// herramientas (consultas caras o repetidas). Esas las corre el usuario a mano.
export const OPCIONES_BLOQUEADAS = ["--allow-expensive", "--force"];

/** Valida y normaliza un comando permitido: sin encadenar ni redirigir. */
export function validarComando(c) {
  const comando = String(c ?? "").trim().replace(/\s+/g, " ");
  if (!comando) throw new Error("El comando está vacío.");
  if (/[;&|<>`$]/.test(comando)) throw new Error(`"${comando}": no puede tener ; & | < > \` ni $ (un comando por entrada).`);
  if (OPCIONES_BLOQUEADAS.some((o) => comando.includes(o))) throw new Error(`"${comando}": ${OPCIONES_BLOQUEADAS.join(" y ")} siempre quedan bloqueados.`);
  return comando;
}

/** Claude Code: herramientas permitidas (Bash y PowerShell: en Windows usa una u otra). */
export const permitidosClaude = (comandos) => comandos.flatMap((c) => [`Bash(${c}:*)`, `PowerShell(${c}:*)`]);
export const bloqueadosClaude = () => OPCIONES_BLOQUEADAS.flatMap((o) => [`Bash(*${o}*)`, `PowerShell(*${o}*)`]);

/**
 * Kiro CLI: herramienta `shell` con allowedCommands (expresiones regulares) y deniedCommands. Como con
 * `write`, `shell` NO va en allowedTools (eso la habilitaría para cualquier comando).
 */
const regex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
export const permisoShellKiro = (comandos) => ({
  allowedCommands: comandos.map((c) => `${regex(c)}( .*)?`),
  deniedCommands: OPCIONES_BLOQUEADAS.map((o) => `.*${regex(o)}.*`),
});
