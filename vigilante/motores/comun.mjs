// Partes comunes de los motores. El vigilante los ejecuta en la carpeta del proyecto con:
//   TASK_ID, EVENT, BANDEJA, PROJECT_NAME, PROJECT_DIR, PROJECT_MODEL, ASISTENTE_MD, INSTRUCCIONES_MD

export function promptProcesar() {
  const { TASK_ID: id, PROJECT_NAME: proyecto, BANDEJA: bandeja, EVENT: evento } = process.env;
  return (
    `Procesá la tarea ${id} siguiendo asistente.md. ` +
    `Pertenece al proyecto ${proyecto}: estás en su carpeta, usá su contexto. ` +
    `La bandeja está en ${bandeja} (adjuntos en ${bandeja}/adjuntos/${id.toLowerCase()}/, ` +
    `conocimiento en ${bandeja}/conocimiento/${proyecto}/). Evento: ${evento}. ` +
    (process.env.PROJECT_ARCHIVOS === "escritura"
      ? "Archivos del proyecto: lectura y escritura (solo dentro de su carpeta y con la aprobación que pide asistente.md). "
      : "Archivos del proyecto: solo lectura. ") +
    (() => {
      let cmds = [];
      try { cmds = JSON.parse(process.env.PROJECT_COMANDOS_JSON || "[]"); } catch { /* sin comandos */ }
      return cmds.length
        ? `Comandos que podés ejecutar desde la raíz del proyecto (con cualquier argumento, salvo --allow-expensive y --force): ${cmds.map((c) => "`" + c + "`").join(", ")}. `
        : "No podés ejecutar comandos en este proyecto: si hace falta correr uno, proponelo en la tarea. ";
    })() +
    (process.env.PROJECT_CONECTORES
      ? `Conectores habilitados para este proyecto: ${process.env.PROJECT_CONECTORES}. `
      : "Este proyecto no tiene conectores habilitados (Jira, Confluence...): si los necesitás, decilo en Falta. ") +
    `Al terminar respondé solo con una línea: "<id> -> <status final>".`
  );
}

export function terminar(codigo, mensaje) {
  if (mensaje) (codigo === 0 ? console.log : console.error)(mensaje);
  process.exit(codigo);
}
