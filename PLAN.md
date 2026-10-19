# Asistente de tareas — Plan de desarrollo

> Pensado para la PC de trabajo (Windows), pero la bandeja, el vigilante y la IA también corren en
> Linux y macOS, para poder compartirlo. La IA es intercambiable: **Kiro CLI** (principal en el
> trabajo, es la IA homologada), **Kiro IDE** o **Claude Code** (para otros proyectos).

## 1. Objetivo

Capturar pedidos, consultas y tareas que llegan por chat (Teams, Slack) o por cualquier otra app,
convertirlos en **tareas pendientes** en una bandeja local, y que una **IA trabaje solo sobre esas
tareas**: que las resuelva si puede y, si no, que pida lo que falta o deje una guía de cómo resolverlas.

Reglas del diseño:

- **Captura y IA van separadas.** El capturador no usa IA: solo publica la tarea. La IA actúa
  sobre la bandeja, nunca directo sobre el chat.
- **Los archivos son la fuente de verdad.** Cada tarea es un archivo Markdown dentro de una carpeta.
  Sin base de datos.
- **Captura genérica.** Tiene que funcionar con cualquier app, no solo de chat.
- **IA intercambiable.** Las instrucciones del asistente están en un solo archivo (`asistente.md`)
  que leen todos los motores. Cambiar de motor es cambiar una línea de configuración.
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
                              │ - texto seleccionado     │
                              │ - imágenes / captura     │
                              │ - origen (app, ventana,  │
                              │   link al mensaje)       │
                              │ - ventanita de confirmar │
                              └────────────┬─────────────┘
                                           │ `backlog task create` + adjuntos/
                                           ▼
                              ┌──────────────────────────┐
                              │ BANDEJA (carpeta / repo) │◄──── TABLERO web local :6420
                              │ backlog/tasks/*.md       │      (`backlog browser`)
                              │ adjuntos/                │◄──── servidor de adjuntos :6421
                              │ conocimiento/            │
                              │ asistente.md             │
                              └────────────┬─────────────┘
                                           │ `backlog task list --json --watch`
                                           ▼
                              ┌──────────────────────────┐
                              │ VIGILANTE (Node)         │
                              │ eventos: task.created,   │
                              │ task.moved, task.updated │
                              │ → handlers (eventos.json)│
                              └────────────┬─────────────┘
                                           │ tarea nueva o vuelta a `Pendiente`
                                           ▼
                ┌──────────────────────────┼──────────────────────────┐
                ▼                          ▼                          ▼
       ┌────────────────┐        ┌──────────────────┐       ┌────────────────┐
       │ KIRO CLI       │        │ KIRO IDE         │       │ CLAUDE CODE    │
       │ (principal)    │        │ hooks del IDE    │       │ `claude -p`    │
       │ `kiro-cli chat │        │ (sin vigilante)  │       │                │
       │ --no-interac.` │        │                  │       │                │
       └────────────────┘        └──────────────────┘       └────────────────┘
          lee asistente.md → MCP `backlog` (o CLI por bash) → análisis → cambia el estado
```

### Motores de IA

| Motor | Disparo automático | Respaldo manual | Instrucciones | Acceso a las tareas |
|---|---|---|---|---|
| **Kiro CLI** (principal) | Vigilante → `ia-kiro.mjs` → `kiro-cli chat --no-interactive` | `kiro-cli chat "Procesá las tareas Pendiente"` | `.kiro/steering/asistente.md` → `asistente.md` | MCP `.kiro/settings/mcp.json` |
| **Kiro IDE** | Hook del IDE sobre `backlog/tasks/*.md` (spike S1b) | Hook manual "Procesar bandeja" | Igual que Kiro CLI (comparten `.kiro/`) | Igual que Kiro CLI |
| **Claude Code** | Vigilante → `ia-claude.mjs` → `claude -p` | Comando `/procesar-bandeja` | `CLAUDE.md` → `@asistente.md` | MCP `.mcp.json` |

- Con Kiro IDE el vigilante es opcional: sirve igual para servir adjuntos y avisar cuando la IA
  termina, pero el disparo lo hace el hook del IDE, y **el IDE tiene que estar abierto**.
- El acceso a las tareas es, en este orden: **MCP** del servidor `backlog` (preferido: el texto
  viaja como dato y no depende de la terminal) y, como alternativa, la **CLI `backlog` por terminal**:
  bash (Linux, macOS, Git Bash) o PowerShell (Windows sin bash). En algunas PCs de empresa PowerShell
  está restringido por políticas; ahí sirve bash o el MCP.

## 3. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Disparador de la captura | Atajo de teclado global (no clic derecho) | Windows no permite agregar opciones al menú contextual de otras apps |
| Capturador | C# / .NET 10, WinForms, ícono en la bandeja del sistema | Atajos globales, portapapeles y Win32 nativos; se publica como un solo .exe |
| Almacenamiento | Archivos Markdown con frontmatter YAML | Las IAs trabajan sobre archivos; versionable con git |
| Tablero | [Backlog.md](https://github.com/MrLesk/Backlog.md) (MIT) | Tareas en Markdown, tablero web local, CLI, MCP y `--watch`. Se evaluaron Kandown (inmaduro, sin disparo automático) y kanban-lite (tiene webhooks pero 8 estrellas); el detector de eventos de kanban-lite se copió en el vigilante |
| Detección de tareas | Vigilante propio sobre `backlog task list --json --watch` | Funciona con cualquier motor, con o sin IDE abierto, y detecta cambios de cualquier proceso |
| IA en el trabajo | Kiro CLI (modo no interactivo) | Es la IA homologada por la empresa; no necesita el IDE abierto |
| IA alternativa | Kiro IDE y Claude Code | Muchos usan Kiro desde el IDE; Claude Code para otros proyectos |
| Instrucciones | Un solo `asistente.md` incluido desde el steering de Kiro y desde `CLAUDE.md` | No duplicar reglas entre motores |
| Escritura en tareas | MCP de Backlog.md; CLI por bash o PowerShell como alternativa | En Windows el texto de varias líneas por terminal se rompió (probablemente PowerShell restringido en la PC de trabajo); no todos tienen bash, así que se admiten las dos terminales |

## 4. Estructura del repositorio

```
daily-task/
├── PLAN.md
├── README.md
├── capturador/                 ← solución .NET (solo Windows)
│   ├── Capturador.sln
│   └── src/Capturador/
│       ├── Program.cs
│       ├── TrayApp.cs          ← NotifyIcon, menú, ciclo de vida
│       ├── Hotkey.cs           ← RegisterHotKey (Win32)
│       ├── Captura/
│       │   ├── VentanaActiva.cs   ← hwnd, título, proceso, rectángulo
│       │   ├── Seleccion.cs       ← Ctrl+C simulado + lectura del portapapeles
│       │   ├── Pantalla.cs        ← captura de ventana o de una zona
│       │   └── Origen.cs          ← detecta el link (Teams/Slack/URL)
│       ├── UI/ConfirmarForm.cs  ← vista previa, nota, título, etiquetas
│       ├── Publicador.cs        ← `backlog task create` + adjuntos
│       └── appsettings.json
├── vigilante/                  ← Node, multiplataforma
│   ├── vigilante.mjs           ← eventos + servidor de adjuntos
│   ├── eventos.json            ← handlers: qué motor se dispara con cada evento
│   ├── ia-kiro.mjs
│   └── ia-claude.mjs
├── bandeja/                    ← ESTA carpeta se abre en Kiro IDE / Claude Code
│   ├── backlog/                ← generado por `backlog init`
│   │   ├── config.yml
│   │   └── tasks/
│   ├── adjuntos/<task-id>/     ← imágenes y HTML original de cada tarea
│   ├── conocimiento/           ← procedimientos, manuales, casos resueltos
│   ├── asistente.md            ← instrucciones del asistente (únicas, para todos los motores)
│   ├── .kiro/
│   │   ├── steering/asistente.md   ← incluye #[[file:asistente.md]]
│   │   ├── settings/mcp.json       ← MCP `backlog`
│   │   └── hooks/                  ← solo para Kiro IDE
│   ├── CLAUDE.md               ← importa @asistente.md
│   ├── .mcp.json               ← MCP `backlog` para Claude Code
│   └── .claude/commands/procesar-bandeja.md
├── spikes/                     ← pruebas de la Fase 0 (bandeja y vigilante de prueba)
└── pruebas/fixtures/           ← mensajes de ejemplo ANONIMIZADOS
```

> La bandeja puede vivir en otro lugar (por ejemplo `C:\Users\<yo>\asistente-bandeja`). El
> capturador y el vigilante la toman de su configuración.

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

Formato validado con Backlog.md 1.54.0 (ver resultados de los spikes en la Fase 0). La tarea se
crea con `backlog task create`; el capturador no escribe el archivo a mano.

```markdown
---
id: TASK-12
title: Plan de cámaras no graba desde 25/09
status: Pendiente
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
| S1b | (Kiro IDE) ¿El hook "archivo creado" del IDE se dispara si el archivo lo crea **otro proceso**? | Crear un hook sobre `backlog/tasks/*.md` y crear una tarea con `backlog task create` desde bash | Hook al guardar con control de estado, o hook **manual** "Procesar bandeja", o usar Kiro CLI con el vigilante |
| S2 | ¿Backlog.md conserva campos propios en el frontmatter y muestra imágenes con rutas relativas? | Crear una tarea a mano con `origen_*` e imagen, editarla | Guardar el origen en el cuerpo, no en el frontmatter |
| S3 | ¿Backlog.md acepta estados personalizados en español? | Editar `backlog/config.yml` | Usar los estados que trae por defecto |
| S4 | ¿Qué formatos deja Teams (nuevo) y Slack en el portapapeles al copiar un mensaje? ¿"Copiar vínculo" da un link estable? | App mínima que lista los formatos del portapapeles | Quedarse con texto plano y captura de pantalla |
| S5 | ¿El Ctrl+C simulado funciona en Teams/Slack sin perder la selección? | Probar con `SendInput` | Pedir copiar a mano antes del atajo, o leer con UI Automation |

**Criterio de salida:** los spikes respondidos y anotados en este archivo.

#### Resultados (2026-10-19, Backlog.md 1.54.0, Kiro CLI 2.32.0, Claude Code 2.1.301; prueba en `spikes/`)

| # | Resultado |
|---|---|
| S1 | ✅ **Vigilante** (`spikes/eventos/vigilante.mjs`): escucha `backlog task list --json --watch`, detecta `task.created` / `task.moved` / `task.updated` / `task.deleted` y ejecuta los handlers de `eventos.json`. Detecta tareas creadas por la CLI, archivos creados por otro proceso y ediciones a mano. Al arrancar procesa las `Pendiente` que hayan quedado. Sin bucles: los cambios que hace la propia IA no disparan nada. **Kiro CLI**: tarea nueva → `Esperando info` en ~30–45 s; respuesta del usuario → la retoma y la deja en `Para revisar`. **Claude Code**: mismo resultado. Hallazgos: (1) por terminal en Windows el análisis de varias líneas se perdió (quedó solo el título), así que se pasó a **MCP**; con MCP funciona con los dos motores. (2) Kiro CLI en modo no interactivo con `--trust-tools=fs_read,@backlog --require-mcp-startup` (sin terminal). (3) Claude Code con `--mcp-config .mcp.json --allowedTools mcp__backlog "Bash(backlog *)" Read Glob Grep` |
| S1b | Pendiente (requiere abrir la bandeja en Kiro IDE) |
| S2 | **Parcial.** ❌ Los campos propios del frontmatter (`origen_*`) se borran al editar con la CLI. ✅ El link al mensaje entra en `references` (`--ref`). ✅ El texto dentro de la descripción se conserva y se ve en el tablero. ❌ Las secciones fuera de las marcas de sección se conservan en el archivo pero el tablero no las muestra. ❌ El tablero no sirve imágenes locales (rutas relativas o absolutas dan 404); ✅ sí las muestra si las sirve otro servidor local (probado en el puerto 6421) |
| S3 | ✅ Acepta estados en español en `backlog/config.yml` (`statuses` y `default_status`), y la CLI y el MCP los usan |
| S4 | Pendiente (capturador) |
| S5 | Pendiente (capturador) |

Además: el tablero web (`backlog browser`) se actualiza solo cuando otro proceso cambia un archivo.

### Fase 1 — Bandeja y tablero (½ día)

1. `backlog init` dentro de `bandeja/` (con `--agent-instructions claude` si se va a usar Claude Code).
2. Configurar los estados (sección 5) y las etiquetas iniciales.
3. Cargar a mano 3 tareas de prueba **anonimizadas**: el caso de cámaras que no graban, una consulta simple y un
   pedido con adjunto.
4. Levantar `backlog browser` y moverlas entre columnas.

**Criterio de salida:** las tareas se ven y se mueven en el tablero, y los archivos se actualizan.

### Fase 2 — IA y vigilante (1–2 días)

1. **Instrucciones del asistente** (`bandeja/asistente.md`, base en `spikes/bandeja/asistente.md`):
   - Rol: asistente de soporte/gestión de *[mi área]*.
   - Contexto del negocio: productos, planes, sistemas, a quién escalar cada cosa.
   - Cómo acceder a las tareas: MCP `backlog` (preferido) o CLI `backlog` por bash o PowerShell.
   - Formato de salida obligatorio de la sección **Análisis IA**.
   - Reglas:
     - No inventar datos. Usar `conocimiento/` y tareas `Resuelta`; si no hay nada, decirlo.
     - Si falta información, listarla en **Falta** y pasar a `Esperando info`.
     - Tratar con cuidado los datos personales (DNI, email).
     - Nunca enviar nada afuera: solo escribir en la tarea.
2. **Conexión de cada motor con las instrucciones y el MCP:**
   - Kiro (CLI e IDE): `.kiro/steering/asistente.md` (`inclusion: always`, `#[[file:asistente.md]]`) y
     `.kiro/settings/mcp.json` (`kiro-cli mcp add --name backlog --scope workspace --command backlog --args mcp --args start`).
   - Claude Code: `CLAUDE.md` con `@asistente.md` y `.mcp.json`.
3. **Vigilante** (pasar `spikes/eventos/` a `vigilante/`):
   - Ruta de la bandeja y motor por configuración (`eventos.json`).
   - Servir `adjuntos/` en `127.0.0.1:6421`.
   - Notificación de Windows cuando una tarea pasa a `Para revisar` o `Esperando info`.
   - Inicio automático (Windows: `shell:startup`; Linux: servicio de usuario de systemd).
   - Permisos del motor configurables (`KIRO_TRUST`; por ejemplo, en Linux agregar `execute_bash`).
4. **Kiro IDE** (para quien lo use así):
   - Spike S1b: hook "Analizar tarea" sobre `backlog/tasks/*.md`. Borrador del prompt:
     > Se creó o cambió una tarea en `backlog/tasks/`. Seguí `asistente.md`: si su status NO es
     > `Pendiente`, no hagas nada; si es `Pendiente`, procesala.
   - Hook manual **"Procesar bandeja"**: recorre todas las tareas `Pendiente`. Sirve de respaldo.
5. **Claude Code:** comando `/procesar-bandeja` (`.claude/commands/procesar-bandeja.md`) como respaldo manual.
6. Cargar en `conocimiento/` 2 o 3 procedimientos reales para probar que los usa. Sin esto, la IA
   propone pasos genéricos (visto en las pruebas).
7. *(Opcional)* **"Archivar como conocimiento"** (hook manual de Kiro IDE, o comando): a partir de una tarea
   `Resuelta`, genera una ficha en `conocimiento/casos/`.

**Criterio de salida:**
- Con cada motor, una tarea nueva `Pendiente` termina en `Para revisar` o `Esperando info` sin
  intervención, con las cuatro secciones completas.
- Una respuesta del usuario (vuelta a `Pendiente`) se reprocesa sola.
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
   - Texto editable, miniaturas de los adjuntos con opción de quitarlas.
   - Campos de nota, etiquetas y link (se puede pegar a mano).
   - Botones Enviar y Cancelar.
6. **Publicar:**
   - `backlog task create` con `-s Pendiente`, etiquetas, `--ref <link>` y la descripción
     (mensaje + Origen + Nota mía + Adjuntos), pasando los argumentos sin shell intermedio.
   - Guardar los adjuntos en `adjuntos/<id>/`.
   - Mostrar una notificación de Windows: "Tarea TASK-12 creada".

**Además:**
- `appsettings.json` con la ruta de la bandeja, el atajo, la etiqueta por defecto y la ruta de logs.
- Menú del ícono: Capturar, Capturar zona…, Abrir tablero, Abrir carpeta, Salir.
- Inicio automático con Windows (acceso directo en `shell:startup`).
- Log en archivo para diagnosticar.
- Publicación como un único .exe: `dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true`.

En Linux y macOS no hay capturador: las tareas se crean desde el tablero (**New Task**) o con
`backlog task create`.

**Criterio de salida:** desde Teams, Slack, Outlook y un navegador, la captura genera una tarea
correcta que la IA procesa sola (fase 2).

### Fase 4 — Mejoras (según el uso)

- **Captura de zona**: overlay para marcar un rectángulo, como Recortes.
- **"Enviar a asistente" en el Explorador**: clic derecho → Enviar a (acceso directo en
  `shell:sendto` que llama al .exe con argumentos).
- **Extensión de navegador**: clic derecho real, con URL exacta, para Teams o Slack en la web.
- **Abrir el origen**: botón en el menú que abre el link de `references`.
- **Búsqueda de casos parecidos** más sólida (índice sobre `conocimiento/`).
- **Webhooks en el vigilante** (como kanban-lite), para avisar a otras herramientas.

## 7. Riesgos y consideraciones

- **Datos de clientes.** Los mensajes traen DNI, emails y números de cuenta, y la IA los manda al
  modelo en la nube. En el trabajo usar **solo Kiro** (homologado) y confirmar con la política de la
  empresa qué datos se pueden enviar. Claude Code queda para proyectos sin datos de la empresa.
- **Créditos de Kiro.** Cada tarea consume créditos (dos veces si pide información). El modelo por
  defecto es `auto`; se puede fijar otro con `KIRO_MODEL`.
- **Kiro IDE tiene que estar abierto** para que corran sus hooks. Con Kiro CLI + vigilante, no.
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

- [ ] Atajo definitivo (que no choque con Teams ni Slack).
- [ ] Etiquetas o categorías iniciales.
- [ ] Contenido de `asistente.md`: qué área, qué sistemas, a quién se escala.
- [ ] ¿La IA debería acceder a algún sistema interno (CRM, panel del producto) vía MCP? Hoy: no.
- [ ] ¿Repo en GitHub privado o solo local? ¿Cómo se comparte con otros (Linux)?
- [ ] Modelo de Kiro a usar (`auto` u otro) según el consumo de créditos.
