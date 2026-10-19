# Asistente de tareas

Una bandeja de tareas local ([Backlog.md](https://github.com/MrLesk/Backlog.md)) que una IA procesa
sola **con el contexto del proyecto al que pertenece cada tarea**.

- Cargás una tarea (en el tablero o pidiéndosela a la IA en el chat) y le asignás un proyecto.
- Un vigilante la detecta y ejecuta la IA **dentro de la carpeta de ese proyecto**: usa su código,
  su documentación y sus instrucciones.
- La IA escribe un análisis (resumen, solución propuesta, fuentes, qué falta y un borrador de
  respuesta) y deja la tarea en **Para revisar** o **Esperando info**.
- Si respondés lo que falta y la volvés a **Pendiente**, la retoma.

Motores: **Kiro CLI** (probado) y **Claude Code** (en prueba). Funciona en Windows, Linux y macOS.
El plan completo está en [PLAN.md](PLAN.md).

## Requisitos

- Node.js 20 o más nuevo.
- Backlog.md: `npm i -g backlog.md`
- Kiro CLI con sesión iniciada (`kiro-cli login`, verificar con `kiro-cli whoami`), o Claude Code.

## Instalación

```bash
git clone https://github.com/agumerca1994/daily-task.git
```

- **Windows:** doble clic en `dist\Instalar Asistente de tareas.exe` (instalador con ventanas). Si todavía
  no existe, generalo con `node bin/asistente.mjs compilar-instalador`, o usá `instalar.cmd` (por
  terminal). El .exe no está firmado: SmartScreen o el antivirus pueden pedir confirmación.
- **Linux / macOS:** `./instalar.sh`.
- (O en cualquier sistema: `node bin/asistente.mjs instalar`.)

No hace falta ser administrador. El instalador:

0. Si falta Backlog.md, ofrece instalarlo (`npm i -g backlog.md`).

1. Crea la **bandeja** (por defecto `~/asistente-bandeja`). Es privada: no la pongas dentro de un
   repo que se suba, porque las tareas pueden tener datos de clientes.
2. Te pregunta qué **proyectos** agregar: nombre, carpeta y motor (`kiro` o `claude`).
3. Instala en tu usuario de Kiro (no en tus proyectos):
   - el agente `asistente-tareas`, que procesa las tareas;
   - el MCP `backlog`, para crear y consultar tareas desde el chat en cualquier proyecto;
   - un steering global (`~/.kiro/steering/bandeja-tareas.md`) que le explica a Kiro cómo crear
     tareas en la bandeja.

4. Crea en el menú Inicio la carpeta **Asistente de tareas** (y, si querés, el acceso principal en
   el escritorio), y opcionalmente lo deja arrancando solo al iniciar sesión.

Se puede volver a ejecutar cuando quieras: no borra tareas ni proyectos. Para quitar todo lo
instalado (sin borrar la bandeja): `node bin/asistente.mjs desinstalar`.

## Uso del día a día

En el menú Inicio, carpeta **Asistente de tareas**:

| Acceso | Qué hace |
|---|---|
| **Asistente de tareas** | Lo inicia sin ninguna ventana, pone su ícono junto al reloj y abre el tablero. Si ya estaba corriendo, solo abre el tablero |
| **Ver actividad del asistente** | Ventana con lo que va haciendo, en vivo. Cerrarla no lo detiene |
| **Detener asistente de tareas** | Lo cierra (y saca el ícono) |

**Ícono junto al reloj** (Windows): azul = activo, gris = detenido. Doble clic abre el tablero; clic
derecho: *Abrir tablero*, *Ver actividad*, *Iniciar* (si está detenido) y *Detener y salir*. Si
Windows lo esconde en la flecha `^` del área de notificación, arrastralo a la barra para que quede
siempre visible. Para tenerlo también en la barra de tareas: clic derecho en *Asistente de tareas*
del menú Inicio > *Anclar a la barra de tareas*.

El ícono es un programa chico (`windows/AsistenteTareas.cs`) que el instalador compila en tu PC
con el compilador de C# que trae Windows; no se descarga nada. Si no se puede compilar, el asistente
funciona igual, pero muestra una consola minimizada un instante al iniciar.

**El tablero** (http://127.0.0.1:6420) está agrupado por quién tiene que actuar: *Te toca* (Para
revisar, Esperando info), *La tiene la IA* (Pendiente, En análisis) y *Cerradas*. Arriba se filtra por
proyecto y se busca por título o número. Al abrir una tarea se ve el mensaje, las imágenes, el link al
mensaje original y el seguimiento (análisis de la IA y tus respuestas); el borrador de respuesta tiene
un botón *Copiar* (texto limpio, listo para pegar). Según el estado: *Enviar a la IA* (responder lo
que falta), *Marcar resuelta*, *Pedir otra vuelta* o *Reabrir*; además *Mover a* y *Archivar*. Tecla
`n`: nueva tarea. El tablero de Backlog.md sigue disponible con `iniciar --ventana --tablero-backlog`.

El ciclo de una tarea:

1. **La creás** (ver abajo). Queda en **Pendiente**.
2. **El asistente la toma sola** en segundos y la pasa a **En análisis**. La IA trabaja en la carpeta
   del proyecto de la tarea (si la tarea no tiene proyecto y hay uno solo configurado, usa ese y lo
   escribe en la tarea; si hay varios, te avisa para que lo elijas en el tablero).
3. En uno o dos minutos la deja en **Para revisar** (propuso solución y borrador de respuesta) o en
   **Esperando info** (dice qué falta). Te llega una notificación.
4. **La revisás** en el tablero: el análisis está en *Implementation Notes*.
   - Si faltaba info: agregá la respuesta en las notas (sección *Respuestas*) y volvé la tarea a
     **Pendiente**: el asistente la retoma.
   - Si está bien: pasala a **Resuelta**.

Para crear tareas:
- **En el tablero**: *Nueva tarea*. Título, mensaje (pegado tal cual), proyecto, prioridad, por dónde
  llegó y quién lo pidió, link al mensaje, etiquetas, una nota para la IA e imágenes (arrastrarlas,
  pegarlas con Ctrl+V o elegirlas).
- **Desde el chat de Kiro** (IDE o CLI), en cualquier proyecto: *"creá una tarea en la bandeja: …"*.
- **Por línea de comandos**, desde la bandeja: `backlog task create "Título" --project SmartHome -d "..."`.

Por línea de comandos: `node bin/asistente.mjs iniciar | detener | actividad`, e `iniciar --ventana`
para tener todo en una ventana con la actividad a la vista. Para que arranque solo al iniciar
sesión: `node bin/asistente.mjs autoinicio activar` (`desactivar`, `estado`).

Proyectos:

```bash
node bin/asistente.mjs proyecto listar
node bin/asistente.mjs proyecto agregar <nombre> <carpeta> [--motor kiro|claude] [--modelo <modelo>]
node bin/asistente.mjs proyecto quitar <nombre>
node bin/asistente.mjs proyecto por-defecto <nombre|ninguno>
```

## Conectores (Jira, Confluence...)

La IA trabaja en la carpeta de cada proyecto, pero por defecto **no** usa sus conectores (los
servidores MCP de `<proyecto>/.kiro/settings/mcp.json`). Se habilitan por proyecto:

```bash
node bin/asistente.mjs proyecto conectores SmartHome                              # ver disponibles y habilitados
node bin/asistente.mjs proyecto conectores SmartHome jira=lectura confluence=lectura
node bin/asistente.mjs proyecto conectores SmartHome jira=escritura               # crear/editar (con aprobación)
node bin/asistente.mjs proyecto conectores SmartHome ninguno
```

- **lectura**: solo consultar (Jira: `jira_get`, Confluence: `conf_get`). Para otros conectores se
  indican las herramientas a mano: `postman=getCollection+getEnvironment`.
- **escritura**: todas las herramientas del conector. Aun así, cuando una tarea pide crear o
  modificar algo, la IA primero escribe en la tarea la *Acción propuesta* y la deja en *Para revisar*;
  solo la ejecuta cuando respondés aprobándola.
- Las credenciales no se copian: se genera un agente de Kiro por proyecto
  (`~/.kiro/agents/asistente-tareas-<proyecto>.json`) que usa la configuración del propio proyecto, y
  Kiro bloquea cualquier herramienta no habilitada.

## Qué hay en la bandeja

| Ruta | Para qué |
|---|---|
| `backlog/tasks/` | Las tareas (un `.md` por tarea) |
| `adjuntos/<id>/` | Imágenes y archivos de cada tarea |
| `conocimiento/<proyecto>/` | Procedimientos y casos que no están en el repo del proyecto |
| `instrucciones.md` | Tus instrucciones propias para el asistente (rol, área, a quién escalar) |
| `asistente.json` | Proyectos: carpeta, motor y modelo. `"notificaciones": false` las apaga |
| `logs/vigilante.log` | Qué hizo el vigilante |

## Estados

`Pendiente` → `En análisis` → `Para revisar` o `Esperando info` → `Resuelta`

Las reglas que sigue la IA están en [asistente/asistente.md](asistente/asistente.md): solo lee el
proyecto, solo escribe en la tarea, no inventa datos y cita sus fuentes.
