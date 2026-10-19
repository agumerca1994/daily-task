---
inclusion: always
---

# Bandeja de tareas

Existe una bandeja de tareas central (Backlog.md) accesible con el MCP `backlog`. Proyectos
configurados: {{PROYECTOS}}. Estados: `Pendiente` → `En análisis` → `Para revisar` / `Esperando info`
→ `Resuelta`. Un asistente automático procesa las tareas que quedan en `Pendiente`.

Solo usá la bandeja cuando el usuario la mencione (una tarea, un ticket, "TASK-12", "la bandeja",
"qué tengo pendiente", etc.). Nunca edites los archivos de las tareas a mano: usá `task_view`,
`task_list`, `task_search`, `task_create` y `task_edit`.

## Crear una tarea ("creá una tarea", "mandá a la bandeja", "anotá un pendiente")

- `task_create` con `status: "Pendiente"` y `project`: el proyecto en el que estás o el que diga el
  pedido (si no sabés cuál, preguntá; solo sirven los configurados).
- `title` corto; `labels` y `references` (links al mensaje o ticket) si el pedido los tiene.
- `description` con el pedido **tal como lo dio el usuario**, sin investigar ni agregar análisis:

  (texto del pedido o mensaje original)

  ## Origen
  - App: (Teams, Slack, mail, chat de Kiro…)
  - De: (quién lo pidió, si se sabe)

  ## Nota mía
  (solo si el usuario agrega algo)

- No la proceses: respondé con el id creado. El asistente automático la toma solo.

## Consultar ("qué tareas esperan info", "mostrame TASK-5")

`task_list` (filtrando por estado o proyecto) o `task_view`. El análisis de la IA y las respuestas
están en las notas de la tarea. Resumí; no modifiques nada.

## Retomar una tarea que espera info o necesita otra vuelta

Preguntá cuál de estas dos quiere el usuario si no queda claro:

1. **Responder y devolverla al asistente automático** ("respondé TASK-5: …", "ya tengo el dato"):
   agregá a las notas con `task_edit` (`notesAppend`) una sección `### Respuestas` con lo que dijo
   el usuario (y la fecha), y pasala a `Pendiente`. El asistente la vuelve a analizar solo.
2. **Trabajarla acá, con el usuario** ("trabajemos TASK-5", "resolvela con lo que tenemos acá"):
   primero pasala a `En análisis` (así el asistente automático no la toma al mismo tiempo), leela
   con `task_view` y trabajala con el contexto de este proyecto. Al terminar agregá a las notas un
   `### Análisis IA` con el mismo formato (Resumen, Solución propuesta, Fuentes, Falta, Borrador de
   respuesta) y dejala en `Para revisar` o `Esperando info`, o en `Resuelta` si el usuario lo dice.

Reglas: no inventes datos, no muevas tareas de otros proyectos sin que te lo pidan y no borres
nada.
