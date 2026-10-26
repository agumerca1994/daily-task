// `asistente desinstalar`: quita lo que instaló `asistente instalar` en el usuario. La bandeja (tareas,
// adjuntos, conocimiento) NO se borra.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { quitarAccesos } from "./accesos.mjs";
import { autoinicio } from "./autoinicio.mjs";
import { quitarInstruccionesClaude, quitarMcpClaude } from "./claude.mjs";
import { quitarIcono } from "./icono.mjs";
import { detener } from "./iniciar.mjs";
import { RUTA_AGENTE, RUTA_MCP_USUARIO, RUTA_STEERING } from "./kiro.mjs";
import { CONFIG_USUARIO, leerConfigUsuario } from "./rutas.mjs";

export async function desinstalar() {
  const bandeja = leerConfigUsuario().bandeja;
  await detener();
  for (const f of quitarAccesos()) console.log(`Quitado: ${f}`);
  const exe = quitarIcono();
  if (exe) console.log(`Quitado: ${exe}`);
  try { autoinicio("desactivar", bandeja); } catch { /* no soportado en este sistema */ }
  quitarMcpClaude();
  quitarInstruccionesClaude();
  for (const f of [RUTA_AGENTE, RUTA_STEERING, CONFIG_USUARIO]) {
    if (existsSync(f)) { rmSync(f); console.log(`Quitado: ${f}`); }
  }
  // Del MCP de usuario de Kiro solo se saca el servidor `backlog`; los demás quedan como estaban
  if (existsSync(RUTA_MCP_USUARIO)) {
    const cfg = JSON.parse(readFileSync(RUTA_MCP_USUARIO, "utf8"));
    if (cfg.mcpServers?.backlog) {
      delete cfg.mcpServers.backlog;
      writeFileSync(RUTA_MCP_USUARIO, JSON.stringify(cfg, null, 2) + "\n");
      console.log(`Quitado el MCP backlog de ${RUTA_MCP_USUARIO}`);
    }
  }
  console.log(`\nListo. La bandeja ${bandeja ? `(${bandeja}) ` : ""}no se tocó: borrala a mano si ya no la querés.`);
}
