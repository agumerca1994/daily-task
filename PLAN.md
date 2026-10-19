# Asistente de tareas — Plan de desarrollo

> Pensado para la PC de trabajo (Windows), pero la bandeja, el vigilante y la IA también corren en
> Linux y macOS, para poder compartirlo. La IA es intercambiable: **Kiro CLI** (principal en el
> trabajo, es la IA homologada), **Kiro IDE** o **Claude Code** (para otros proyectos).

## 1. Objetivo

Capturar pedidos, consultas y tareas que llegan por chat (Teams, Slack) o por cualquier otra app,
convertirlos en **tareas pendientes** en una bandeja local, y que una **IA trabaje cada tarea con el
contexto del proyecto al que pertenece**: que la resuelva si puede y, si no, que pida lo que falta o
deje una guía de cómo resolverla.

Ejemplo: un ticket de SmartHome lo toma Kiro **dentro de la carpeta de SmartHome**, con su código,
su steering y sus MCP; un pedido de un proyecto personal lo toma Claude Code dentro de ese proyecto.

Reglas del diseño:

- **Una bandeja central, muchos proyectos.** Hay un solo tablero para todas las tareas. Cada tarea
  dice a qué proyecto pertenece, y la IA trabaja en la carpeta de ese proyecto.
- **Los proyectos no se tocan.** No hace falta agregar nada a los repos de los proyectos: ni la
  bandeja, ni hooks, ni instrucciones del asistente.
- **Las tareas no viven en los repos de código.** La bandeja es una carpeta privada, fuera de
  cualquier repo que se suba, porque tiene datos de clientes.
- **Captura y IA van separadas.** El capturador no usa IA: solo publica la tarea. La IA actúa
  sobre la bandeja, nunca directo sobre el chat.
- **Los archivos son la fuente de verdad.** Cada tarea es un archivo Markdown. Sin base de datos.
- **Captura genérica.** Tiene que funcionar con cualquier app, no solo de chat.
- **IA intercambiable.** Las instrucciones del asistente están en un solo archivo (`asistente.md`)
  que leen todos los motores. El motor se elige por proyecto.
- **Todo corre en local.** La única salida a internet es el modelo de la IA (ver riesgos).

## 2. Arquitectura

```
┌─────────────────────────┐   atajo global (Ctrl+Alt+A)
│ App cualquiera (Teams,  │ ───────────────┐
│ Slack, Outlook, web...) │                │
└─────────────────────────┘                ▼
                              ┌──────────────────────────┐
                              │ CAPTURADOR (.NET, solo   │
                              │ Windows, bandeja sistema)│
                              │ - texto, imágenes, origen│
                              │ - ventanita: título,     │
                              │   PROYECTO, nota, etiq.  │
                              └────────────┬─────────────┘
                                           │ `backlog task create --project ...` + adjuntos/
                                           ▼
                              ┌──────────────────────────┐
                              │ BANDEJA CENTRAL (privada,│◄──── TABLERO web local :6420
                              │ fuera de los repos)      │      (`backlog browser`)
                              │ backlog/tasks/*.md       │◄──── servidor de adjuntos :6421
                              │ adjuntos/                │
                              │ conocimiento/<proyecto>/ │
                              │ vigilante.json           │
                              └────────────┬─────────────┘
                                           │ `backlog task list --json --watch`
                                           ▼
                              ┌──────────────────────────┐
                              │ VIGILANTE (Node)         │
                              │ evento → proyecto de la  │
                              │ tarea → carpeta + motor  │
                              └────────────┬─────────────┘
                                           │ se ejecuta EN LA CARPETA DEL PROYECTO
                 ┌─────────────────────────┴─────────────────────────┐
                 ▼                                                   ▼
   ┌──────────────────────────────┐                    ┌──────────────────────────────┐
   │ C:\...\smarthome   (Kiro CLI)│                    │ C:\...\otro-proyecto (Claude)│
   │ contexto: código, .kiro/     │                    │ contexto: código, CLAUDE.md, │
   │ steering, MCP del proyecto   │                    │ MCP del proyecto             │
   │ + asistente.md + MCP backlog │                    │ + asistente.md + MCP backlog │
   └──────────────┬───────────────┘                    └──────────────┬───────────────┘
                  └──────────── escribe el análisis y cambia ──────────┘
                                el estado en la BANDEJA (MCP)
```

### Cómo le llega todo a la IA

La IA arranca **en la carpeta del proyecto**, así que carga sola el contexto propio del proyecto.
Lo que es del asistente se lo suma el vigilante desde afuera, sin tocar el proyecto:

| Qué | De dónde sale | Kiro CLI | Claude Code |
|---|---|---|---|
| Contexto del proyecto | La carpeta del proyecto | `.kiro/steering/`, código, MCP del proyecto | `CLAUDE.md`, código, MCP del proyecto |
| Instrucciones del asistente | `asistente.md` (repo de la herramienta) | Agente de usuario `asistente-tareas` (`~/.kiro/agents/`) que incluye `asistente.md` como recurso | `--append-system-prompt-file asistente.md` |
| Acceso a las tareas | MCP `backlog` apuntando a la bandeja central | Definido en el agente: `backlog mcp start --cwd <bandeja>` | `--mcp-config` con `backlog mcp start --cwd <bandeja>` |
| Conocimiento que no está en el repo | `bandeja/conocimiento/<proyecto>/` | Lectura de archivos (ruta indicada en el prompt) | Lectura de archivos (`--add-dir <bandeja>`) |

### Motores de IA

| Motor | Disparo automático | Respaldo manual |
|---|---|---|
| **Kiro CLI** (principal) | Vigilante → `ia-kiro.mjs` → `kiro-cli chat --agent asistente-tareas --no-interactive`, en la carpeta del proyecto | En la carpeta del proyecto: `kiro-cli chat --agent asistente-tareas "Procesá las tareas Pendiente de SmartHome"` |
| **Kiro IDE** | No (la bandeja está fuera del workspace, así que los hooks del IDE no la ven). Para automático: Kiro CLI con el vigilante | Con el proyecto abierto en el IDE y el MCP `backlog` configurado a nivel de usuario: pedirle en el chat "Procesá las tareas Pendiente de SmartHome" (spike S1b) |
| **Claude Code** | Vigilante → `ia-claude.mjs` → `claude -p`, en la carpeta del proyecto | En la carpeta del proyecto: comando de usuario `/procesar-bandeja` |

El acceso a las tareas es, en este orden: **MCP** del servidor `backlog` (preferido: el texto viaja
como dato y no depende de la terminal) y, como alternativa, la **CLI `backlog` por terminal**: bash
(Linux, macOS, Git Bash) o PowerShell (Windows sin bash), siempre con `--cwd`/`BACKLOG_CWD` apuntando
a la bandeja. En algunas PCs de empresa PowerShell está restringido por políticas; ahí sirve bash o
el MCP.

### Configuración de proyectos (`bandeja/vigilante.json`)

```json
{
  "bandeja": "C:/Users/<yo>/asistente-bandeja",
  "proyectoPorDefecto": null,
  "proyectos": {
    "SmartHome": { "carpeta": "C:/Users/<yo>/repos/smarthome", "motor": "kiro" },
    "Personal":  { "carpeta": "C:/Users/<yo>/repos/otro-proyecto", "motor": "claude" }
  }
}
```

- El nombre del proyecto es el campo nativo `project` de Backlog.md (lista `projects:` en
  `backlog/config.yml`), así que se filtra y se ve en el tablero.
- Una tarea **sin proyecto** o con un proyecto que no está en la configuración no se procesa: el
  vigilante la deja en `Pendiente` y avisa. Si se define `proyectoPorDefecto`, usa ese.
- Opcionales por proyecto: `modelo` (Kiro: `--model`), permisos (`trust`) y una carpeta de
  conocimiento extra.

## 3. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Disparador de la captura | Atajo de teclado global (no clic derecho) | Windows no permite agregar opciones al menú contextual de otras apps |
| Capturador | C# / .NET 10, WinForms, ícono en la bandeja del sistema | Atajos globales, portapapeles y Win32 nativos; se publica como un solo .exe |
| Almacenamiento | Archivos Markdown con frontmatter YAML | Las IAs trabajan sobre archivos; versionable con git |
| Tablero | [Backlog.md](https://github.com/MrLesk/Backlog.md) (MIT) | Tareas en Markdown, tablero web local, CLI, MCP, `--watch` y campo `project`. Se evaluaron Kandown (inmaduro, sin disparo automático) y kanban-lite (tiene webhooks pero 8 estrellas); el detector de eventos de kanban-lite se copió en el vigilante |
| Organización | **Una bandeja central**; la IA trabaja en la carpeta del proyecto de cada tarea (opción B) | Un solo tablero y un solo destino para el capturador; la IA usa el contexto de cada proyecto; los datos de clientes no entran en los repos de código; los proyectos no se modifican |
| Detección de tareas | Vigilante propio sobre `backlog task list --json --watch` | Funciona con cualquier motor, con o sin IDE abierto, y detecta cambios de cualquier proceso |
| IA en el trabajo | Kiro CLI (modo no interactivo) | Es la IA homologada por la empresa; no necesita el IDE abierto |
| IA alternativa | Kiro IDE (manual) y Claude Code | Muchos usan Kiro desde el IDE; Claude Code para otros proyectos |
| Instrucciones | Un solo `asistente.md`, sumado desde afuera (agente de Kiro / `--append-system-prompt-file`) | No duplicar reglas entre motores y no tocar los proyectos |
| Escritura en tareas | MCP de Backlog.md; CLI por bash o PowerShell como alternativa | En Windows el texto de varias líneas por terminal se rompió (probablemente PowerShell restringido en la PC de trabajo); no todos tienen bash, así que se admiten las dos terminales |

## 4. Dónde vive cada cosa

Son tres lugares distintos:

```
daily-task/                     ← REPO DE LA HERRAMIENTA (se comparte; sin datos reales)
├── PLAN.md
├── README.md
├── capturador/                 ← solución .NET (solo Windows)
│   └── src/Capturador/
│       ├── Program.cs, TrayApp.cs, Hotkey.cs
│       ├── Captura/            ← VentanaActiva, Seleccion, Pantalla, Origen
│       ├── UI/ConfirmarForm.cs ← vista previa, título, PROYECTO, nota, etiquetas
│       ├── Publicador.cs       ← `backlog task create` + adjuntos
│       └── appsettings.json
├── vigilante/                  ← Node, multiplataforma
│   ├── vigilante.mjs           ← eventos, ruteo por proyecto, servidor de adjuntos
│   ├── ia-kiro.mjs
│   ├── ia-claude.mjs
│   └── vigilante.example.json
├── asistente/
│   ├── asistente.md            ← instrucciones del asistente (únicas, para todos los motores)
│   ├── kiro-agent.json         ← plantilla del agente `asistente-tareas` de Kiro CLI
│   └── procesar-bandeja.md     ← comando de usuario de Claude Code
├── instalar.mjs                ← crea la bandeja, el agente de Kiro y el comando de Claude
├── spikes/                     ← pruebas de la Fase 0
└── pruebas/fixtures/           ← mensajes de ejemplo ANONIMIZADOS

C:\Users\<yo>\asistente-bandeja\   ← BANDEJA CENTRAL (privada, nunca se sube)
├── backlog/                    ← `backlog init`; `config.yml` con `projects:`
│   └── tasks/
├── adjuntos/<task-id>/
├── conocimiento/<proyecto>/    ← procedimientos y casos que no están en el repo del proyecto
└── vigilante.json              ← proyectos → carpeta + motor

C:\Users\<yo>\repos\smarthome\     ← PROYECTOS (sin cambios)
```

Lo que se instala en el usuario (no en los proyectos):
- Kiro CLI: `~/.kiro/agents/asistente-tareas.json` (MCP `backlog` + `asistente.md`).
- Kiro IDE: MCP `backlog` en la configuración de usuario (`~/.kiro/settings/mcp.json`).
- Claude Code: `~/.claude/commands/procesar-bandeja.md`.

## 5. Modelo de tarea

### Estados

| Estado | Quién lo pone | Significa |
|---|---|---|
| `Pendiente` | Capturador, o yo al responder | Lista para que la IA la tome |
| `En análisis` | IA, al empezar | Evita que se procese dos veces |
| `Esperando info` | IA | Falta algo; está en la sección **Falta** |
| `Para revisar` | IA | Propuso una solución o una respuesta; tengo que validarla |
| `Resuelta` | Yo | Cerrada |

Para responder a `Esperando info`: agrego una sección **Respuestas** en las notas y vuelvo la tarea a
`Pendiente`. El vigilante detecta el cambio y la IA la retoma (probado).

### Archivo de ejemplo

Formato validado con Backlog.md 1.54.0 (ver resultados de los spikes en la Fase 0), salvo el campo
`project`, que falta probar (spike S6). La tarea se crea con `backlog task create`; el capturador no
escribe el archivo a mano.

```markdown
---
id: TASK-12
title: Plan de cámaras no graba desde 25/09
status: Pendiente
project: SmartHome                                 ← decide carpeta y motor
labels:
  - camaras
  - soporte
created_date: '2026-10-16 14:32'
references:
  - 'https://teams.microsoft.com/l/message/...'   ← link al mensaje (campo nativo, --ref)
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cliente con plan básico de cámaras: solo graba una de sus cámaras desde el 25/09.
Configuraciones verificadas. Adjunto capturas del plan y de la app sin grabaciones...

## Origen
- App: Teams
- Ventana: Chat | Soporte | Microsoft Teams

## Nota mía
(opcional, escrita en la ventanita de captura)

## Adjuntos
- ![captura 1](http://127.0.0.1:6421/task-12/captura-1.png)
- [HTML original](http://127.0.0.1:6421/task-12/mensaje.html)
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
### Análisis IA
**Resumen:** ... **Solución propuesta:** ... **Falta:** ... **Borrador de respuesta:** ...

### Respuestas
(lo que contesto cuando la IA pide algo)
<!-- SECTION:NOTES:END -->
```

- **Origen, nota y adjuntos van dentro de la descripción.** Backlog.md borra los campos propios del
  frontmatter al editar y el tablero no muestra secciones que estén fuera de las marcas de sección.
- **El análisis de la IA va en las notas** (MCP `task_edit` con `notesAppend`, o
  `backlog task edit <id> --append-notes "..."`).
- **Las imágenes se sirven aparte** (`http://127.0.0.1:6421/` → carpeta `adjuntos/`), porque el
  tablero no entrega archivos locales. La IA las lee directo del disco.

## 6. Fases

### Fase 0 — Preparar el entorno y spikes (½–1 día)

**Instalar:**
- Git
- Node.js LTS, para Backlog.md y el vigilante: `npm i -g backlog.md`
- El motor de IA que se vaya a usar:
  - **Kiro CLI**: instalar y `kiro-cli login` (en la empresa: `--license pro` con la URL de
    IAM Identity Center y la región). Verificar con `kiro-cli whoami`.
  - **Kiro IDE**: ya instalado.
  - **Claude Code**: CLI `claude` (o el que trae la extensión de VS Code).
- .NET 10 SDK (solo para el capturador, Fase 3)

**Spikes.** Son pruebas cortas para resolver lo incierto antes de construir:

| # | Pregunta | Cómo probarla | Si falla |
|---|---|---|---|
| S1 | ¿Cómo se dispara la IA cuando llega una tarea nueva? | Vigilante sobre `--watch` + motor en modo no interactivo | — |
| S1b | (Kiro IDE) ¿Se puede procesar la bandeja a mano desde el chat del IDE, con el proyecto abierto y el MCP `backlog` a nivel de usuario? | Abrir SmartHome en el IDE, configurar el MCP de usuario y pedirle que procese una tarea | Usar Kiro CLI desde la terminal del IDE |
| S2 | ¿Backlog.md conserva campos propios en el frontmatter y muestra imágenes con rutas relativas? | Crear una tarea a mano con `origen_*` e imagen, editarla | Guardar el origen en el cuerpo, no en el frontmatter |
| S3 | ¿Backlog.md acepta estados personalizados en español? | Editar `backlog/config.yml` | Usar los estados que trae por defecto |
| S4 | ¿Qué formatos deja Teams (nuevo) y Slack en el portapapeles al copiar un mensaje? ¿"Copiar vínculo" da un link estable? | App mínima que lista los formatos del portapapeles | Quedarse con texto plano y captura de pantalla |
| S5 | ¿El Ctrl+C simulado funciona en Teams/Slack sin perder la selección? | Probar con `SendInput` | Pedir copiar a mano antes del atajo, o leer con UI Automation |
| S6 | ¿El campo `project` de Backlog.md se guarda, se ve y se filtra en el tablero, y llega en el JSON del `--watch`? | `projects:` en `config.yml` y `backlog task create --project SmartHome` | Usar una etiqueta `proyecto:SmartHome` |
| S7 | (Kiro CLI) Ejecutado **en la carpeta de SmartHome** con un agente de usuario (`--agent asistente-tareas`), ¿usa a la vez el steering y el código del proyecto, `asistente.md` y el MCP `backlog` de la bandeja central? | Tarea de SmartHome que solo se pueda contestar con información del repo | Pasar `asistente.md` dentro del prompt y el MCP por configuración global |
| S8 | (Claude Code) Ídem con `claude -p` en la carpeta del proyecto, `--append-system-prompt-file` y `--mcp-config` | Ídem con un proyecto personal | Pasar las instrucciones en el prompt |

**Criterio de salida:** los spikes respondidos y anotados en este archivo.

#### Resultados (2026-10-19, Backlog.md 1.54.0, Kiro CLI 2.32.0, Claude Code 2.1.301; prueba en `spikes/`)

Estas pruebas se hicieron con la IA ejecutándose **dentro de la bandeja** (sin contexto de un
proyecto). El cambio a la opción B lo validan S6–S8.

| # | Resultado |
|---|---|
| S1 | ✅ **Vigilante** (`spikes/eventos/vigilante.mjs`): escucha `backlog task list --json --watch`, detecta `task.created` / `task.moved` / `task.updated` / `task.deleted` y ejecuta los handlers de `eventos.json`. Detecta tareas creadas por la CLI, archivos creados por otro proceso y ediciones a mano. Al arrancar procesa las `Pendiente` que hayan quedado. Sin bucles: los cambios que hace la propia IA no disparan nada. **Kiro CLI**: tarea nueva → `Esperando info` en ~30–45 s; respuesta del usuario → la retoma y la deja en `Para revisar`. **Claude Code**: mismo resultado. Hallazgos: (1) por terminal en Windows el análisis de varias líneas se perdió (quedó solo el título), así que se pasó a **MCP**; con MCP funciona con los dos motores. (2) Kiro CLI en modo no interactivo con `--trust-tools=fs_read,@backlog --require-mcp-startup` (sin terminal). (3) Claude Code con `--mcp-config .mcp.json --allowedTools mcp__backlog "Bash(backlog *)" "PowerShell(backlog *)" Read Glob Grep`. (4) Sin conocimiento ni contexto de proyecto, la IA propone pasos genéricos: es lo que resuelve la opción B |
| S1b | Pendiente |
| S2 | **Parcial.** ❌ Los campos propios del frontmatter (`origen_*`) se borran al editar con la CLI. ✅ El link al mensaje entra en `references` (`--ref`). ✅ El texto dentro de la descripción se conserva y se ve en el tablero. ❌ Las secciones fuera de las marcas de sección se conservan en el archivo pero el tablero no las muestra. ❌ El tablero no sirve imágenes locales (rutas relativas o absolutas dan 404); ✅ sí las muestra si las sirve otro servidor local (probado en el puerto 6421) |
| S3 | ✅ Acepta estados en español en `backlog/config.yml` (`statuses` y `default_status`), y la CLI y el MCP los usan |
| S4 | Pendiente (capturador) |
| S5 | Pendiente (capturador) |
| S6 | ✅ Con `projects: [SmartHome, Personal]` en `config.yml`, `backlog task create --project SmartHome` guarda `project: SmartHome` en el frontmatter, el campo llega en el JSON del `--watch` y `task list --project` filtra. Falta mirarlo en el tablero web |
| S7 | ✅ **Kiro CLI en la carpeta de SmartHome** con el agente de usuario `asistente-tareas` (`~/.kiro/agents/asistente-tareas.json`: `resources` con `asistente.md` + `file://.kiro/steering/**/*.md` + `AGENTS.md` + `README.md`; `mcpServers.backlog` → `backlog mcp start --cwd <bandeja>`; `tools` y `allowedTools`: `read`, `grep`, `glob`, `@backlog`; `includeMcpJson: false`). El vigilante rutea por `project` (`"run": "ia"` + `proyectos` + `motores` en `eventos.json`). Con una tarea que solo se podía contestar con la documentación del proyecto (una regla de negocio con su límite y su código de error), Kiro la dejó en ~65 s en `Esperando info` con un análisis correcto basado en el proyecto: encontró la regla, el parámetro que la controla y el error que devuelve, distinguió dos versiones del diseño y citó en **Fuentes** los documentos y el steering que usó. La carpeta del proyecto quedó **sin cambios** (comparación de ruta, tamaño y fecha de todos sus archivos). El detalle de la prueba no se sube al repo porque tiene información interna del proyecto. Con `includeMcpJson: false` no se cargan los MCP del proyecto (Jira, Confluence…); habilitarlos es una decisión aparte (más lento y hay que darles permiso) |
| S8 | Pendiente |

Además: el tablero web (`backlog browser`) se actualiza solo cuando otro proceso cambia un archivo.

### Fase 1 — Bandeja central y tablero (½ día)

1. Crear la bandeja **fuera de los repos** (por ejemplo `C:\Users\<yo>\asistente-bandeja`) y hacer
   `backlog init` ahí, sin instrucciones de agente (`--agent-instructions none`).
2. Configurar en `backlog/config.yml` los estados (sección 5), los proyectos (`projects:`) y las
   etiquetas iniciales.
3. Si se quiere historial, `git init` en la bandeja **sin remoto** (o con un remoto privado aprobado
   por la empresa).
4. Cargar a mano 3 tareas de prueba **anonimizadas** de al menos dos proyectos.
5. Levantar `backlog browser`, filtrarlas por proyecto y moverlas entre columnas.

**Criterio de salida:** las tareas se ven, se filtran por proyecto y se mueven en el tablero, y los
archivos se actualizan.

### Fase 2 — IA por proyecto y vigilante (2–3 días)

1. **Instrucciones del asistente** (`asistente/asistente.md`, base en `spikes/bandeja/asistente.md`):
   - Rol: asistente de soporte/gestión que trabaja **sobre la tarea** usando el contexto del
     proyecto en el que está parado.
   - Cómo acceder a las tareas: MCP `backlog` (preferido) o CLI `backlog` por bash o PowerShell con
     `--cwd <bandeja>`.
   - Dónde buscar: código, documentación y steering del proyecto; `conocimiento/<proyecto>/` de la
     bandeja; tareas `Resuelta` del mismo proyecto.
   - Formato de salida obligatorio de la sección **Análisis IA**.
   - Reglas:
     - No inventar datos. Si no hay nada en el proyecto ni en el conocimiento, decirlo.
     - **No modificar archivos del proyecto**: solo leerlos. Solo se escribe en la tarea.
     - Si falta información, listarla en **Falta** y pasar a `Esperando info`.
     - Tratar con cuidado los datos personales (DNI, email).
     - Nunca enviar nada afuera.
2. **Vigilante** (pasar `spikes/eventos/` a `vigilante/`):
   - Leer `vigilante.json`: ruta de la bandeja y, por proyecto, carpeta y motor.
   - Por cada evento, buscar el proyecto de la tarea y ejecutar el motor **con la carpeta del
     proyecto como directorio de trabajo**. Tarea sin proyecto conocido: no procesar y avisar.
   - Una tarea a la vez por proyecto (cola), para no pisar sesiones ni gastar créditos de más.
   - Servir `adjuntos/` en `127.0.0.1:6421`.
   - Notificación de Windows cuando una tarea pasa a `Para revisar` o `Esperando info`, o si el
     motor falla (por ejemplo, venció el login de Kiro).
   - Inicio automático (Windows: `shell:startup`; Linux: servicio de usuario de systemd).
3. **Kiro CLI:** agente de usuario `asistente-tareas` (spike S7) con:
   - MCP `backlog` → `backlog mcp start --cwd <bandeja>`.
   - `asistente.md` como recurso.
   - Herramientas permitidas: lectura de archivos y `@backlog` (configurable; por ejemplo, en Linux
     agregar `execute_bash`).
4. **Claude Code** (spike S8): `claude -p` en la carpeta del proyecto con
   `--append-system-prompt-file asistente.md`, `--mcp-config` de la bandeja y `--add-dir <bandeja>`
   para leer adjuntos y conocimiento. Comando de usuario `/procesar-bandeja` como respaldo manual.
5. **Kiro IDE** (spike S1b): MCP `backlog` a nivel de usuario y un prompt documentado para procesar
   a mano las tareas de un proyecto desde el chat del IDE.
6. **`instalar.mjs`:** crea la bandeja, el `vigilante.json` de ejemplo, el agente de Kiro y el comando
   de Claude, para que otra persona lo pueda poner en marcha rápido (Windows y Linux).
7. Cargar en `conocimiento/SmartHome/` 2 o 3 procedimientos reales que no estén en el repo, para
   probar que los usa junto con el código.
8. *(Opcional)* **"Archivar como conocimiento"**: a partir de una tarea `Resuelta`, generar una ficha
   en `conocimiento/<proyecto>/casos/`.

**Criterio de salida:**
- Una tarea nueva de SmartHome termina en `Para revisar` o `Esperando info` sin intervención, con
  las cuatro secciones completas y **usando información del repo de SmartHome**.
- Lo mismo con un proyecto que use Claude Code.
- Una respuesta del usuario (vuelta a `Pendiente`) se reprocesa sola.
- Los repos de los proyectos quedan sin cambios (`git status` limpio).
- La IA no vuelve a procesar tareas que no están en `Pendiente`, así que no hay bucles.

### Fase 3 — Capturador MVP (3–5 días, solo Windows)

Flujo al apretar `Ctrl+Alt+A`:

1. **Guardar contexto antes de cualquier cosa.** Ventana activa (`GetForegroundWindow`), título,
   proceso (`GetWindowThreadProcessId` → nombre del .exe) y rectángulo
   (`DwmGetWindowAttribute` con `DWMWA_EXTENDED_FRAME_BOUNDS`).
2. **Copiar la selección:**
   - Respaldar el portapapeles.
   - Soltar los modificadores del atajo y mandar `Ctrl+C` con `SendInput`.
   - Esperar a que cambie `GetClipboardSequenceNumber` (timeout de ~500 ms).
   - Leer texto, `HTML Format`, imágenes y archivos.
   - Restaurar el portapapeles.
3. **Sacar la captura de la ventana** activa (PNG).
4. **Buscar el origen:**
   - Links en el portapapeles o en el HTML. Patrones: `teams.microsoft.com/l/message`,
     `*.slack.com/archives/...` y cualquier URL.
   - Si no hay link, queda app + ventana + fecha.
5. **Mostrar la ventanita de confirmación:**
   - Título sugerido (primera línea, recortada).
   - **Proyecto** (lista sacada de `projects:` de la bandeja). Sugerido por reglas simples de
     `appsettings.json` (por ejemplo, canal o chat → proyecto) o el último usado.
   - Texto editable, miniaturas de los adjuntos con opción de quitarlas.
   - Campos de nota, etiquetas y link (se puede pegar a mano).
   - Botones Enviar y Cancelar.
6. **Publicar:**
   - `backlog task create` con `-s Pendiente`, `--project`, etiquetas, `--ref <link>` y la
     descripción (mensaje + Origen + Nota mía + Adjuntos), pasando los argumentos sin shell intermedio.
   - Guardar los adjuntos en `adjuntos/<id>/`.
   - Mostrar una notificación de Windows: "Tarea TASK-12 creada (SmartHome)".

**Además:**
- `appsettings.json` con la ruta de la bandeja, el atajo, las reglas de proyecto, la etiqueta por
  defecto y la ruta de logs.
- Menú del ícono: Capturar, Capturar zona…, Abrir tablero, Abrir carpeta, Salir.
- Inicio automático con Windows (acceso directo en `shell:startup`).
- Log en archivo para diagnosticar.
- Publicación como un único .exe: `dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true`.

En Linux y macOS no hay capturador: las tareas se crean desde el tablero (**New Task**, eligiendo el
proyecto) o con `backlog task create --project ...`.

**Criterio de salida:** desde Teams, Slack, Outlook y un navegador, la captura genera una tarea
correcta, con su proyecto, que la IA procesa sola en la carpeta de ese proyecto (fase 2).

### Fase 4 — Mejoras (según el uso)

- **Captura de zona**: overlay para marcar un rectángulo, como Recortes.
- **"Enviar a asistente" en el Explorador**: clic derecho → Enviar a (acceso directo en
  `shell:sendto` que llama al .exe con argumentos).
- **Extensión de navegador**: clic derecho real, con URL exacta, para Teams o Slack en la web.
- **Abrir el origen**: botón en el menú que abre el link de `references`.
- **Sugerir el proyecto con IA** cuando las reglas no alcanzan (siempre confirmado por mí).
- **Búsqueda de casos parecidos** más sólida (índice sobre `conocimiento/`).
- **Webhooks en el vigilante** (como kanban-lite), para avisar a otras herramientas.

## 7. Riesgos y consideraciones

- **Datos de clientes.** Los mensajes traen DNI, emails y números de cuenta, y la IA los manda al
  modelo en la nube. En el trabajo usar **solo Kiro** (homologado) y confirmar con la política de la
  empresa qué datos se pueden enviar. Claude Code queda para proyectos sin datos de la empresa: el
  motor se fija **por proyecto** en `vigilante.json`.
- **La bandeja nunca se sube** a un repo público ni al de la herramienta. El repo `daily-task` solo
  tiene código, plantillas y fixtures anonimizados.
- **La IA trabaja dentro de los proyectos.** Tiene que tener permiso solo de lectura sobre el
  proyecto y de escritura solo en la tarea (MCP `backlog`). Verificar después de cada prueba que el
  repo del proyecto quedó sin cambios.
- **Créditos de Kiro.** Cada tarea consume créditos (dos veces si pide información), y con el
  contexto de un proyecto grande el consumo sube. El modelo por defecto es `auto`; se puede fijar
  otro por proyecto.
- **Kiro IDE no dispara solo**: la bandeja está fuera del workspace. Para automático, Kiro CLI con el
  vigilante.
- **Sesión de Kiro CLI.** Si vence el login, el vigilante falla: registrar el error y avisar.
- **Terminal en Windows.** En algunas PCs de empresa PowerShell está restringido por políticas y no
  todos tienen bash. Por eso el acceso preferido a las tareas es el MCP, y por terminal se admiten
  bash y PowerShell.
- **Portapapeles.** Simular Ctrl+C puede pisar lo que el usuario tenía copiado: siempre respaldar
  y restaurar.
- **Políticas de la PC de trabajo.** Un antivirus o una política de TI puede bloquear un .exe sin
  firmar, atajos globales o `SendInput`. Probar temprano (spike S5).
- **Fixtures.** Nunca commitear mensajes reales: anonimizar los casos de prueba.

## 8. Pendientes por definir

- [ ] Ruta de la bandeja central y lista inicial de proyectos (con su carpeta y su motor).
- [ ] Atajo definitivo (que no choque con Teams ni Slack).
- [ ] Reglas para sugerir el proyecto en el capturador (canal, chat, remitente…).
- [ ] Etiquetas o categorías iniciales.
- [ ] Contenido de `asistente.md`: qué área, a quién se escala; y qué conocimiento de cada proyecto
      no está en su repo.
- [ ] ¿La IA debería acceder a algún sistema interno (CRM, panel del producto) vía MCP? Hoy: solo
      los MCP que ya tenga configurados cada proyecto.
- [ ] ¿Historial de la bandeja con git local? ¿Cómo se comparte la herramienta con otros (Linux)?
- [ ] Modelo de Kiro a usar (`auto` u otro) según el consumo de créditos.
- [ ] ¿El agente `asistente-tareas` debería cargar los MCP del proyecto (`includeMcpJson: true`), por
      ejemplo Jira o Confluence de SmartHome, solo con herramientas de lectura?
