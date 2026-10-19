// Partes comunes de los motores. El vigilante los ejecuta en la carpeta del proyecto con:
//   TASK_ID, EVENT, BANDEJA, PROJECT_NAME, PROJECT_DIR, PROJECT_MODEL, ASISTENTE_MD, INSTRUCCIONES_MD

export function promptProcesar() {
  const { TASK_ID: id, PROJECT_NAME: proyecto, BANDEJA: bandeja, EVENT: evento } = process.env;
  return (
    `Procesá la tarea ${id} siguiendo asistente.md. ` +
    `Pertenece al proyecto ${proyecto}: estás en su carpeta, usá su contexto. ` +
    `La bandeja está en ${bandeja} (adjuntos en ${bandeja}/adjuntos/${id.toLowerCase()}/, ` +
    `conocimiento en ${bandeja}/conocimiento/${proyecto}/). Evento: ${evento}. ` +
    `Al terminar respondé solo con una línea: "<id> -> <status final>".`
  );
}

export function terminar(codigo, mensaje) {
  if (mensaje) (codigo === 0 ? console.log : console.error)(mensaje);
  process.exit(codigo);
}
