#!/usr/bin/env node
// asistente — bandeja de tareas que una IA procesa con el contexto de cada proyecto.
import { crearAccesos, quitarAccesos } from "../src/accesos.mjs";
import { autoinicio } from "../src/autoinicio.mjs";
import { desinstalar } from "../src/desinstalar.mjs";
import { diagnostico } from "../src/diagnostico.mjs";
import { empaquetar } from "../src/empaquetar.mjs";
import { compilarInstalador } from "../src/icono.mjs";
import { actividad, detener, iniciar } from "../src/iniciar.mjs";
import { instalar } from "../src/instalar.mjs";
import { comandoProyecto } from "../src/proyectos.mjs";
import { rutaBandeja } from "../src/rutas.mjs";
import { vigilar } from "../vigilante/vigilante.mjs";

const AYUDA = `Uso: asistente <comando> [opciones]

Comandos:
  instalar [--bandeja <ruta>] [--si]
      Crea o actualiza la bandeja, elige los proyectos e instala la integración con Kiro.
      --si acepta todo lo propuesto sin preguntar.
  proyecto listar
  proyecto agregar <nombre> <carpeta> [--motor kiro|claude] [--modelo <modelo>]
  proyecto quitar <nombre>
  proyecto por-defecto <nombre|ninguno>
  iniciar [--no-abrir] [--ventana]
      Inicia el asistente en segundo plano (tablero http://127.0.0.1:6420, vigilante y adjuntos
      http://127.0.0.1:6421) y abre el tablero. Si ya está corriendo, solo abre el tablero.
      --ventana: todo en esta ventana, con la actividad a la vista (cerrarla lo detiene).
  detener
      Cierra el asistente que está corriendo en segundo plano.
  actividad
      Muestra en vivo lo que hace el asistente (cerrar la ventana no lo detiene).
  vigilante
      Solo el vigilante: manda cada tarea nueva (o respondida) al motor de su proyecto.
  autoinicio activar|desactivar|estado
      Arranca \`asistente iniciar\` al iniciar sesión (Windows: carpeta Inicio; Linux: systemd de usuario).
  acceso crear [--escritorio] | acceso quitar
      Acceso directo "Asistente de tareas" en el menú Inicio (y en el escritorio) para iniciar con doble clic.
  desinstalar
      Quita accesos, autoinicio y la integración con Kiro. No borra la bandeja.
  compilar-instalador
      (Windows) Genera dist/Instalar Asistente de tareas.exe, el instalador con ventana.
  empaquetar
      (Windows) Genera dist/asistente-tareas-windows-<versión>.zip para compartir (instalador + archivos).
  diagnostico [--json]
      Qué hay instalado y qué está configurado.

Opciones generales:
  --bandeja <ruta>   Usa esa bandeja en lugar de la configurada.
`;

function parsear(argv) {
  const pos = [], op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const clave = a.slice(2);
    const sig = argv[i + 1];
    if (sig !== undefined && !sig.startsWith("--")) { op[clave] = sig; i++; } else op[clave] = true;
  }
  return { pos, op };
}

const { pos: [comando, ...resto], op } = parsear(process.argv.slice(2));

try {
  switch (comando) {
    case "instalar": await instalar(op); break;
    case "proyecto": comandoProyecto(rutaBandeja(op.bandeja), resto, op); break;
    case "iniciar": await iniciar(rutaBandeja(op.bandeja), op); break;
    case "detener": await detener(); break;
    case "actividad": actividad(rutaBandeja(op.bandeja)); break;
    case "vigilante": {
      const v = vigilar(rutaBandeja(op.bandeja));
      const salir = () => { v.detener(); process.exit(0); };
      process.on("SIGINT", salir);
      process.on("SIGTERM", salir);
      break;
    }
    case "autoinicio": autoinicio(resto[0], rutaBandeja(op.bandeja)); break;
    case "acceso":
      if (resto[0] === "quitar") for (const f of quitarAccesos()) console.log(`Quitado: ${f}`);
      else for (const f of crearAccesos({ escritorio: !!op.escritorio })) console.log(`Creado: ${f}`);
      break;
    case "desinstalar": await desinstalar(); break;
    case "diagnostico": console.log(JSON.stringify(diagnostico(), null, op.json ? 0 : 2)); break;
    case "compilar-instalador": console.log(`Instalador: ${compilarInstalador()}`); break;
    case "empaquetar": { const r = empaquetar(); console.log(`Paquete: ${r.destino} (${r.archivos} archivos)`); break; }
    case undefined: case "ayuda": case "--help": console.log(AYUDA); break;
    default: console.error(`Comando desconocido: ${comando}\n\n${AYUDA}`); process.exitCode = 1;
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
}
