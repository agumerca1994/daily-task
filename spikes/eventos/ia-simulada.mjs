// Handler de prueba: imita lo que haría la IA, sin llamar a ningún modelo.
// Pasa la tarea a "En análisis", agrega una nota y la deja en "Para revisar".
import { execSync } from "node:child_process";

const id = process.env.TASK_ID;
const bl = (args) => execSync(`backlog task edit ${id} ${args} --plain`, { stdio: "ignore" });

bl(`-s "En análisis"`);
await new Promise((r) => setTimeout(r, 1500));
bl(`--append-notes "Análisis simulado (${process.env.EVENT})" -s "Para revisar"`);
console.log(`${id} procesada -> Para revisar`);
