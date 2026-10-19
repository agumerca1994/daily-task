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
cd daily-task
node bin/asistente.mjs instalar
```

El instalador:

1. Crea la **bandeja** (por defecto `~/asistente-bandeja`). Es privada: no la pongas dentro de un
   repo que se suba, porque las tareas pueden tener datos de clientes.
2. Te pregunta qué **proyectos** agregar: nombre, carpeta y motor (`kiro` o `claude`).
3. Instala en tu usuario de Kiro el agente `asistente-tareas` y el MCP `backlog` (para crear y
   consultar tareas desde el chat en cualquier proyecto). No modifica tus proyectos.

Se puede volver a ejecutar cuando quieras: no borra tareas ni proyectos.

## Uso

```bash
# Tablero web (http://127.0.0.1:6420)
cd ~/asistente-bandeja && backlog browser

# Vigilante: manda cada tarea nueva o respondida a la IA de su proyecto
node bin/asistente.mjs vigilante
```

Para crear tareas:
- En el tablero: **New Task**, con estado `Pendiente` y el proyecto.
- Desde el chat de Kiro (IDE o CLI), en cualquier proyecto: *"creá una tarea en la bandeja para el
  proyecto SmartHome: …"*.
- Por línea de comandos: `backlog task create "Título" --project SmartHome -d "..."`, desde la bandeja.

Proyectos:

```bash
node bin/asistente.mjs proyecto listar
node bin/asistente.mjs proyecto agregar <nombre> <carpeta> [--motor kiro|claude] [--modelo <modelo>]
node bin/asistente.mjs proyecto quitar <nombre>
node bin/asistente.mjs proyecto por-defecto <nombre|ninguno>
```

## Qué hay en la bandeja

| Ruta | Para qué |
|---|---|
| `backlog/tasks/` | Las tareas (un `.md` por tarea) |
| `adjuntos/<id>/` | Imágenes y archivos de cada tarea |
| `conocimiento/<proyecto>/` | Procedimientos y casos que no están en el repo del proyecto |
| `instrucciones.md` | Tus instrucciones propias para el asistente (rol, área, a quién escalar) |
| `asistente.json` | Proyectos: carpeta, motor y modelo |
| `logs/vigilante.log` | Qué hizo el vigilante |

## Estados

`Pendiente` → `En análisis` → `Para revisar` o `Esperando info` → `Resuelta`

Las reglas que sigue la IA están en [asistente/asistente.md](asistente/asistente.md): solo lee el
proyecto, solo escribe en la tarea, no inventa datos y cita sus fuentes.
