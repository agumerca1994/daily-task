# Asistente de tareas — Plan de desarrollo

> Uso personal, en la PC de trabajo (Windows). Este plan es el punto de partida para seguir
> el desarrollo en Windows, con Kiro o con Claude Code.

## 1. Objetivo

Capturar pedidos, consultas y tareas que llegan por chat (Teams, Slack) o por cualquier otra app,
convertirlos en **tareas pendientes** en una bandeja local, y que una **IA trabaje solo sobre esas
tareas**: que las resuelva si puede y, si no, que pida lo que falta o deje una guía de cómo resolverlas.

Reglas del diseño:

- **Captura y IA van separadas.** El capturador no usa IA: solo publica la tarea. La IA actúa
  sobre la bandeja, nunca directo sobre el chat.
- **Los archivos son la fuente de verdad.** Cada tarea es un archivo Markdown dentro de una carpeta
  que Kiro abre como proyecto. Sin base de datos.
- **Captura genérica.** Tiene que funcionar con cualquier app, no solo de chat.
- **Todo corre en local.** La única salida a internet es el modelo que use Kiro (ver riesgos).

## 2. Arquitectura

```
┌─────────────────────────┐   atajo global (Ctrl+Alt+A)
│ App cualquiera (Teams,  │ ───────────────┐
│ Slack, Outlook, web...) │                │
└─────────────────────────┘                ▼
                              ┌──────────────────────────┐
                              │ CAPTURADOR (.NET, bandeja│
                              │ del sistema)             │
                              │ - texto seleccionado     │
                              │ - imágenes / captura     │
                              │ - origen (app, ventana,  │
                              │   link al mensaje)       │
                              │ - ventanita de confirmar │
                              └────────────┬─────────────┘
                                           │ crea archivo .md + adjuntos
                                           ▼
                              ┌──────────────────────────┐
                              │ BANDEJA (carpeta / repo) │◄──── TABLERO web local
                              │ backlog/tasks/*.md       │      (Backlog.md: `backlog browser`)
                              │ adjuntos/                │
                              │ conocimiento/            │
                              └────────────┬─────────────┘
                                           │ hook: tarea nueva / status Pendiente
                                           ▼
                              ┌──────────────────────────┐
                              │ KIRO (Agent Hook +       │
                              │ steering)                │
                              │ analiza → completa la    │
                              │ tarea → cambia el estado │
                              └──────────────────────────┘
```

## 3. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Disparador de la captura | Atajo de teclado global (no clic derecho) | Windows no permite agregar opciones al menú contextual de otras apps |
| Capturador | C# / .NET 10, WinForms, ícono en la bandeja del sistema | Atajos globales, portapapeles y Win32 nativos; se publica como un solo .exe |
| Almacenamiento | Archivos Markdown con frontmatter YAML | Kiro trabaja sobre archivos; versionable con git |
| Tablero | [Backlog.md](https://github.com/MrLesk/Backlog.md) (MIT) | Tareas en Markdown, tablero web local, CLI y MCP |
| IA | Agent Hooks + steering de Kiro | Es la herramienta que ya se usa en el día a día |

## 4. Estructura del repositorio

```
asistente-tareas/
├── PLAN.md
├── README.md
├── capturador/                 ← solución .NET
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
│       ├── Publicador.cs        ← escribe la tarea y los adjuntos
│       └── appsettings.json
├── bandeja/                    ← ESTA carpeta se abre en Kiro
│   ├── backlog/                ← generado por `backlog init`
│   │   ├── config.yml
│   │   └── tasks/
│   ├── adjuntos/<task-id>/     ← imágenes y HTML original de cada tarea
│   ├── conocimiento/           ← procedimientos, manuales, casos resueltos
│   └── .kiro/
│       ├── steering/asistente.md
│       └── hooks/
└── pruebas/fixtures/           ← mensajes de ejemplo ANONIMIZADOS
```

> La bandeja puede vivir en otro lugar (por ejemplo `C:\Users\<yo>\asistente-bandeja`). El
> capturador la toma de `appsettings.json`.

## 5. Modelo de tarea

### Estados

| Estado | Quién lo pone | Significa |
|---|---|---|
| `Pendiente` | Capturador, o yo al responder | Lista para que la IA la tome |
| `En análisis` | IA, al empezar | Evita que se procese dos veces |
| `Esperando info` | IA | Falta algo; está en la sección **Falta** |
| `Para revisar` | IA | Propuso una solución o una respuesta; tengo que validarla |
| `Resuelta` | Yo | Cerrada |

Para responder a `Esperando info`: completo la sección **Respuestas** y vuelvo la tarea a `Pendiente`.

### Archivo de ejemplo

```markdown
---
id: task-12
title: Plan de cámaras no graba desde 25/09
status: Pendiente
labels: [camaras, soporte]
created_date: 2026-10-16 14:32
origen_app: Teams
origen_ventana: "Chat | Soporte | Microsoft Teams"
origen_link: https://teams.microsoft.com/l/message/...
---

## Mensaje original
Cliente con plan básico de cámaras: solo graba una de sus cámaras desde el 25/09.
Configuraciones verificadas. Adjunto capturas del plan y de la app sin grabaciones...

## Nota mía
(opcional, escrita en la ventanita de captura)

## Adjuntos
- ![captura 1](../../adjuntos/task-12/captura-1.png)
- [HTML original](../../adjuntos/task-12/mensaje.html)

## Análisis IA
<!-- lo completa la IA: Resumen / Solución propuesta / Falta / Borrador de respuesta -->

## Respuestas
<!-- lo que contesto cuando la IA pide algo -->
```

> El formato exacto del frontmatter tiene que coincidir con el de Backlog.md (spike S2). Los campos
> `origen_*` son propios y hay que confirmar que Backlog.md los respeta al editar desde el tablero.

## 6. Fases

### Fase 0 — Preparar Windows y spikes (½–1 día)

**Instalar:**
- Git
- .NET 10 SDK
- Node.js LTS (o Bun), para Backlog.md: `npm i -g backlog.md`
- Kiro (ya instalado)

**Spikes.** Son pruebas cortas para resolver lo incierto antes de construir:

| # | Pregunta | Cómo probarla | Si falla |
|---|---|---|---|
| S1 | ¿El hook de Kiro "archivo creado" se dispara si el archivo lo crea **otro proceso**? | Crear un hook sobre `backlog/tasks/*.md` y crear un archivo desde PowerShell | Hook **manual** "Procesar bandeja", o hook al guardar con control de estado, o invocar Kiro CLI desde el capturador (verificar que exista en Windows) |
| S2 | ¿Backlog.md conserva campos propios en el frontmatter y muestra imágenes con rutas relativas? | Crear una tarea a mano con `origen_*` e imagen, editarla desde `backlog browser` | Guardar el origen en el cuerpo, no en el frontmatter |
| S3 | ¿Backlog.md acepta estados personalizados en español? | Editar `backlog/config.yml` | Usar los estados que trae por defecto |
| S4 | ¿Qué formatos deja Teams (nuevo) y Slack en el portapapeles al copiar un mensaje? ¿"Copiar vínculo" da un link estable? | App mínima que lista los formatos del portapapeles | Quedarse con texto plano y captura de pantalla |
| S5 | ¿El Ctrl+C simulado funciona en Teams/Slack sin perder la selección? | Probar con `SendInput` | Pedir copiar a mano antes del atajo, o leer con UI Automation |

**Criterio de salida:** los cinco spikes respondidos y anotados en este archivo.

### Fase 1 — Bandeja y tablero (½ día)

1. `git init`, y `backlog init` dentro de `bandeja/`.
2. Configurar los estados (sección 5) y las etiquetas iniciales.
3. Cargar a mano 3 tareas de prueba **anonimizadas**: el caso de cámaras que no graban, una consulta simple y un
   pedido con adjunto.
4. Levantar `backlog browser` y moverlas entre columnas.

**Criterio de salida:** las tareas se ven y se mueven en el tablero, y los archivos se actualizan.

### Fase 2 — IA en Kiro (1–2 días)

1. **Steering** (`.kiro/steering/asistente.md`):
   - Rol: asistente de soporte/gestión de *[mi área]*.
   - Contexto del negocio: productos, planes, sistemas, a quién escalar cada cosa.
   - Formato de salida obligatorio de la sección **Análisis IA**.
   - Reglas:
     - No inventar datos.
     - Si falta información, listarla en **Falta** y pasar a `Esperando info`.
     - Tratar con cuidado los datos personales (DNI, email).
     - Nunca enviar nada afuera: solo escribir en el archivo.
2. **Hook "Analizar tarea"** (el disparador sale del spike S1). Borrador del prompt:
   > Se creó o cambió una tarea en `backlog/tasks/`. Si su `status` NO es `Pendiente`, no hagas
   > nada. Si es `Pendiente`: cambiá el estado a `En análisis`, leé el mensaje, la nota, las
   > respuestas y los adjuntos (imágenes en `adjuntos/<id>/`), y buscá casos parecidos en
   > `conocimiento/` y en tareas `Resuelta`. Completá **Análisis IA** con: Resumen, Solución
   > propuesta (pasos numerados), Falta (si aplica) y Borrador de respuesta. Al terminar, poné
   > `Para revisar` o `Esperando info`. No modifiques otras secciones.
3. **Hook manual "Procesar bandeja"**: recorre todas las tareas `Pendiente`. Sirve de respaldo.
4. Cargar en `conocimiento/` 2 o 3 procedimientos reales para probar que los usa.
5. *(Opcional)* Hook manual **"Archivar como conocimiento"**: a partir de una tarea `Resuelta`,
   genera una ficha en `conocimiento/casos/`.

**Criterio de salida:**
- Una tarea nueva `Pendiente` termina en `Para revisar` o `Esperando info` sin intervención,
  con las cuatro secciones completas.
- La IA no vuelve a procesar tareas que no están en `Pendiente`, así que no hay bucles.

### Fase 3 — Capturador MVP (3–5 días)

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
   - Siguiente id (o `backlog task create` vía CLI, según S2).
   - Escribir el `.md` con `status: Pendiente` y guardar los adjuntos en `adjuntos/<id>/`.
   - Mostrar una notificación de Windows: "Tarea task-12 creada".

**Además:**
- `appsettings.json` con la ruta de la bandeja, el atajo, la etiqueta por defecto y la ruta de logs.
- Menú del ícono: Capturar, Capturar zona…, Abrir tablero, Abrir carpeta, Salir.
- Inicio automático con Windows (acceso directo en `shell:startup`).
- Log en archivo para diagnosticar.
- Publicación como un único .exe: `dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true`.

**Criterio de salida:** desde Teams, Slack, Outlook y un navegador, la captura genera una tarea
correcta que la IA procesa sola (fase 2).

### Fase 4 — Mejoras (según el uso)

- **Captura de zona**: overlay para marcar un rectángulo, como Recortes.
- **"Enviar a asistente" en el Explorador**: clic derecho → Enviar a (acceso directo en
  `shell:sendto` que llama al .exe con argumentos).
- **Extensión de navegador**: clic derecho real, con URL exacta, para Teams o Slack en la web.
- **Notificación cuando la IA termina**: el capturador vigila la carpeta (`FileSystemWatcher`) y
  avisa al pasar a `Para revisar` o `Esperando info`.
- **Abrir el origen**: botón en el tablero o el menú que abre `origen_link`.
- **Búsqueda de casos parecidos** más sólida (índice sobre `conocimiento/`).

## 7. Riesgos y consideraciones

- **Datos de clientes.** Los mensajes traen DNI, emails y números de cuenta, y Kiro los manda al
  modelo en la nube. **Confirmar con la política de la empresa.** Si no se permite, evaluar un
  modelo local (Ollama) para el análisis.
- **Kiro tiene que estar abierto** para que corran los hooks del IDE.
- **Portapapeles.** Simular Ctrl+C puede pisar lo que el usuario tenía copiado: siempre respaldar
  y restaurar.
- **Políticas de la PC de trabajo.** Un antivirus o una política de TI puede bloquear un .exe sin
  firmar, atajos globales o `SendInput`. Probar temprano (spike S5).
- **Fixtures.** Nunca commitear mensajes reales: anonimizar los casos de prueba.

## 8. Pendientes por definir

- [ ] Atajo definitivo (que no choque con Teams ni Slack).
- [ ] Etiquetas o categorías iniciales.
- [ ] Contenido del steering: qué área, qué sistemas, a quién se escala.
- [ ] ¿La IA debería acceder a algún sistema interno (CRM, panel del producto) vía MCP? Hoy: no.
- [ ] ¿Repo en GitHub privado o solo local?
