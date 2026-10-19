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

### Configuración de proyectos (`bandeja/asistente.json`)

Se maneja con `asistente instalar` (pregunta qué proyectos agregar) y `asistente proyecto
agregar|quitar|listar|por-defecto`, que también actualizan `projects:` en `backlog/config.yml`.

```json
{
  "version": 1,
  "proyectoPorDefecto": null,
  "procesarPendientesAlIniciar": true,
  "proyectos": {
    "SmartHome": { "carpeta": "C:/Users/<yo>/repos/smarthome", "motor": "kiro" },
    "Personal":  { "carpeta": "/home/<yo>/proyectos/otro", "motor": "claude", "modelo": "..." }
  }
}
```

- El nombre del proyecto es el campo nativo `project` de Backlog.md, así que se filtra y se ve en
  el tablero.
- Una tarea **sin proyecto** o con un proyecto que no está en la configuración no se procesa: el
  vigilante la deja en `Pendiente` y avisa. Si se define `proyectoPorDefecto`, usa ese.
- El vigilante relee la configuración en cada evento: un proyecto nuevo aplica sin reiniciar.
- La ruta de la bandeja se guarda en la configuración de usuario
  (`%APPDATA%\asistente-tareas\config.json` o `~/.config/asistente-tareas/config.json`).

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
daily-task/                     ← REPO DE LA HERRAMIENTA (público; sin datos reales)
├── PLAN.md
├── README.md
├── package.json                ← comando `asistente` (solo Node, sin dependencias)
├── bin/asistente.mjs           ← instalar | proyecto | vigilante
├── src/
│   ├── rutas.mjs               ← rutas de la herramienta y configuración de usuario
│   ├── backlog.mjs             ← ejecuta Backlog.md con node, sin shell
│   ├── bandeja.mjs             ← crear bandeja, estados, proyectos
│   ├── kiro.mjs                ← agente `asistente-tareas` y MCP de usuario de Kiro
│   ├── instalar.mjs
│   └── proyectos.mjs
├── vigilante/
│   ├── vigilante.mjs           ← eventos, ruteo por proyecto, cola por proyecto
│   └── motores/                ← kiro.mjs, claude.mjs, comun.mjs
├── asistente/
│   ├── asistente.md            ← instrucciones del asistente (únicas, para todos los motores)
│   └── kiro-agent.json         ← plantilla del agente `asistente-tareas` de Kiro CLI
├── capturador/                 ← (Fase 5) solución .NET, solo Windows
├── spikes/                     ← pruebas de la Fase 0 (histórico)
└── pruebas/fixtures/           ← mensajes de ejemplo ANONIMIZADOS

C:\Users\<yo>\asistente-bandeja\   ← BANDEJA CENTRAL (privada, nunca se sube)
├── backlog/                    ← `backlog init`; `config.yml` con estados y `projects:`
│   └── tasks/
├── adjuntos/<task-id>/
├── conocimiento/<proyecto>/    ← procedimientos y casos que no están en el repo del proyecto
├── logs/vigilante.log
├── instrucciones.md            ← instrucciones propias (rol, área, a quién escalar)
└── asistente.json              ← proyectos → carpeta + motor

C:\Users\<yo>\repos\smarthome\     ← PROYECTOS (sin cambios)
```

Lo que `asistente instalar` deja en el usuario (no en los proyectos):
- Kiro CLI: `~/.kiro/agents/asistente-tareas.json` (MCP `backlog` de la bandeja + `asistente.md` +
  `instrucciones.md` + steering del proyecto donde se ejecuta).
- Kiro IDE y CLI: MCP `backlog` en `~/.kiro/settings/mcp.json`, para crear y consultar tareas desde
  el chat en cualquier proyecto (sin tocar los demás servidores).
- *(Pendiente)* Claude Code: comando de usuario `/procesar-bandeja`.

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

### Fase 1 — Bandeja central e instalador ✅ (2026-10-19)

Hecho con `node bin/asistente.mjs instalar`:

- [x] Bandeja **fuera de los repos** (`C:\Users\<yo>\asistente-bandeja`), `backlog init` sin
      instrucciones de agente, estados en español y `projects:` sincronizado con `asistente.json`.
- [x] Proyectos elegibles: el instalador pregunta cuáles agregar; después,
      `asistente proyecto agregar|quitar|listar|por-defecto`.
- [x] `instrucciones.md` (instrucciones propias, privadas), `conocimiento/<proyecto>/` y `logs/`.
- [x] Kiro: agente de usuario `asistente-tareas` y MCP `backlog` en la configuración de usuario
      (respeta los demás servidores).
- [x] Prueba en la bandeja real: tarea de SmartHome → Kiro en la carpeta de SmartHome → `Para revisar`
      en ~70 s, con la regla correcta del proyecto; tarea sin proyecto → queda en `Pendiente` con aviso;
      SmartHome sin cambios.
- [ ] Mirar el campo `project` y el filtro en el tablero web.
- [ ] *(Opcional)* `git init` en la bandeja **sin remoto**, para tener historial.

### Fase 2 — IA por proyecto y vigilante ✅ (2026-10-19)

- [x] `asistente/asistente.md`: contexto del proyecto, bandeja aparte, instrucciones propias,
      **Fuentes**, no modificar el proyecto, MCP preferido y CLI por bash o PowerShell, y cómo
      **crear tareas** cuando se lo piden desde el chat.
- [x] Vigilante (`asistente vigilante`): eventos sobre `--watch`, ruteo por `project`, motor
      ejecutado **en la carpeta del proyecto**, una tarea a la vez por proyecto, configuración
      releída en cada evento, procesa al iniciar las `Pendiente` que hayan quedado.
- [x] Backlog.md y los motores se ejecutan con node, **sin shell intermedia** (sin problemas de
      comillas ni de políticas de PowerShell/cmd).
- [x] Motor Kiro (`vigilante/motores/kiro.mjs`), con aviso si la sesión de Kiro venció.
- [x] Motor Claude (`vigilante/motores/claude.mjs`) escrito; falta probarlo (Fase 4).

### Fase 3 — Uso diario (siguiente)

Objetivo: usarlo de verdad unos días con Kiro y SmartHome, cargando las tareas a mano o desde Kiro.

1. **`asistente iniciar`**: un solo comando que levanta el tablero, el vigilante y el servidor de
   adjuntos (`127.0.0.1:6421` → `adjuntos/`), y los cierra juntos.
2. **Crear tareas desde Kiro**: probar desde el chat de Kiro (IDE y CLI) en SmartHome
   "creá una tarea en la bandeja: …" con el MCP de usuario, y ajustar `asistente.md` si hace falta.
3. **Notificaciones de Windows** cuando una tarea queda en `Para revisar` o `Esperando info`, o si el
   motor falla (por ejemplo, venció el login de Kiro).
4. **Inicio automático** (Windows: `shell:startup`; Linux: servicio de usuario de systemd).
5. **Afinar con casos reales**: completar `instrucciones.md` (rol, área, a quién escalar) y cargar en
   `conocimiento/SmartHome/` lo que no está en el repo.
6. *(Opcional)* **"Archivar como conocimiento"**: a partir de una tarea `Resuelta`, generar una ficha
   en `conocimiento/<proyecto>/casos/`.

**Criterio de salida:**
- Una semana de uso real sin tocar el código: las tareas entran a mano o desde Kiro y la IA las
  procesa sola con el contexto de SmartHome.
- Una respuesta del usuario (vuelta a `Pendiente`) se reprocesa sola.
- Los proyectos quedan sin cambios.

### Fase 4 — Otros motores (no bloqueante)

1. **Claude Code** (spike S8): probar `vigilante/motores/claude.mjs` con un proyecto personal;
   comando de usuario `/procesar-bandeja` como respaldo manual; sumarlo al instalador.
2. **Kiro IDE** (spike S1b): procesar a mano las tareas de un proyecto desde el chat del IDE con el
   MCP de usuario; documentar el prompt.
3. Probar el instalador en Linux.

### Fase 5 — Capturador (al final; 3–5 días, solo Windows)

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
correcta, con su proyecto, que la IA procesa sola en la carpeta de ese proyecto.

### Fase 6 — Mejoras (según el uso)

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
