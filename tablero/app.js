// Bandeja de tareas: tablero, detalle, acciones y formulario. Sin dependencias.
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const ESTADOS = {
  "Para revisar": { grupo: "vos", vacio: "Nada para revisar." },
  "Esperando info": { grupo: "vos", vacio: "Ninguna espera datos." },
  "Pendiente": { grupo: "ia", vacio: "No hay tareas en cola." },
  "En análisis": { grupo: "ia", vacio: "La IA está libre." },
  "Resuelta": { grupo: "cerradas", vacio: "Todavía no cerraste ninguna." },
};
const PRIORIDAD = { high: "Alta", medium: "Media", low: "Baja" };
const MAX_RESUELTAS = 8;

const estado = { tareas: [], proyectos: [], filtro: "Todos", texto: "", abierta: null, verResueltas: false, imagenes: [] };

// ---------------------------------------------------------------- Utilidades
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function hace(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    ...opciones,
    headers: { "Content-Type": "application/json", "x-asistente": "1", ...(opciones.headers ?? {}) },
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

let temporizador;
function avisar(texto) {
  const a = $("#aviso");
  a.textContent = texto;
  a.classList.add("visible");
  clearTimeout(temporizador);
  temporizador = setTimeout(() => a.classList.remove("visible"), 4000);
}

/** Markdown mínimo (lo que escriben la IA y las respuestas). Escapa todo antes. */
function md(texto) {
  const inline = (s) => esc(s)
    .replace(/!\[([^\]]*)\]\(https?:\/\/127\.0\.0\.1:\d+\/([^)\s]+)\)/g, '<img src="/adjuntos/$2" alt="$1">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const salida = [];
  let lista = null;
  const cerrar = () => { if (lista) { salida.push(`</${lista}>`); lista = null; } };
  for (const linea of String(texto ?? "").split(/\r?\n/)) {
    const num = linea.match(/^\s*\d+[.)]\s+(.*)/);
    const vin = linea.match(/^\s*[-*]\s+(.*)/);
    const tit = linea.match(/^#{3,6}\s+(.*)/);
    if (num || vin) {
      const tipo = num ? "ol" : "ul";
      if (lista !== tipo) { cerrar(); salida.push(`<${tipo}>`); lista = tipo; }
      salida.push(`<li>${inline((num || vin)[1])}</li>`);
    } else if (tit) { cerrar(); salida.push(`<h4>${inline(tit[1])}</h4>`); }
    else if (!linea.trim()) cerrar();
    else { cerrar(); salida.push(`<p>${inline(linea)}</p>`); }
  }
  cerrar();
  return `<div class="md">${salida.join("")}</div>`;
}

/** Divide las notas en hojas: análisis de la IA y respuestas, en orden. */
function hojas(notas) {
  const partes = String(notas ?? "").split(/^(?=### )/m).map((p) => p.trim()).filter(Boolean);
  return partes.map((p) => {
    const titulo = p.match(/^### (.*)/)?.[1] ?? "";
    const cuerpo = p.replace(/^### .*\n?/, "");
    const esIA = /análisis/i.test(titulo);
    const esVos = /respuesta/i.test(titulo);
    let borrador = null, resto = cuerpo;
    if (esIA) {
      const m = cuerpo.match(/\*\*Borrador de respuesta:\*\*\s*([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|$)/);
      if (m) { borrador = m[1].trim(); resto = cuerpo.replace(m[0], ""); }
    }
    // Para copiar y pegar en Teams o un mail: sin marcas de formato
    const borradorLimpio = borrador && borrador.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
    return { titulo, cuerpo: resto, borrador, borradorLimpio, tipo: esIA ? "ia" : esVos ? "vos" : "" };
  });
}

// ---------------------------------------------------------------- Tablero
async function cargar() {
  try {
    const [cfg, tareas] = await Promise.all([api("/api/estado"), api("/api/tareas")]);
    estado.proyectos = cfg.proyectos;
    estado.tareas = tareas;
    dibujarProyectos();
    dibujar();
    if (estado.abierta) abrir(estado.abierta, { refrescar: true });
  } catch (e) {
    $("#situacion").textContent = `No pude leer la bandeja: ${e.message}`;
  }
}

function visibles() {
  const t = estado.texto.toLowerCase();
  return estado.tareas.filter((x) =>
    (estado.filtro === "Todos" || (estado.filtro === "Sin proyecto" ? !x.proyecto : x.proyecto === estado.filtro)) &&
    (!t || x.titulo.toLowerCase().includes(t) || x.id.toLowerCase().includes(t) || (x.resumen ?? "").toLowerCase().includes(t)));
}

function dibujarProyectos() {
  const nav = $("#proyectos");
  const opciones = ["Todos", ...estado.proyectos];
  if (estado.tareas.some((t) => !t.proyecto)) opciones.push("Sin proyecto");
  if (!opciones.includes(estado.filtro)) estado.filtro = "Todos";
  nav.innerHTML = opciones.length > 2 || opciones.includes("Sin proyecto")
    ? opciones.map((p) => `<button type="button" aria-pressed="${p === estado.filtro}">${esc(p)}</button>`).join("")
    : "";
  nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { estado.filtro = b.textContent; dibujarProyectos(); dibujar(); }));
}

function dibujar() {
  const lista = visibles();
  const cuenta = (e) => lista.filter((t) => t.estado === e).length;
  const vos = cuenta("Para revisar") + cuenta("Esperando info");
  const ia = cuenta("Pendiente") + cuenta("En análisis");
  const frase = vos === 0 ? "Nada te espera." : vos === 1 ? "<b>1 tarea</b> espera tu mirada." : `<b>${vos} tareas</b> esperan tu mirada.`;
  const fraseIA = ia === 0 ? " La IA está libre." : ` <span class="ia">La IA está con ${ia}.</span>`;
  $("#situacion").innerHTML = frase + fraseIA;

  for (const col of document.querySelectorAll(".columna")) {
    const e = col.dataset.estado;
    let tareas = lista.filter((t) => t.estado === e).sort((a, b) => new Date(b.actualizada) - new Date(a.actualizada));
    const total = tareas.length;
    if (e === "Resuelta" && !estado.verResueltas) tareas = tareas.slice(0, MAX_RESUELTAS);
    col.innerHTML = `
      <h3 class="columna-titulo">${esc(e)} <span class="cuenta">${total}</span></h3>
      ${tareas.length ? `<ol>${tareas.map(tarjeta).join("")}</ol>` : `<p class="vacio">${ESTADOS[e]?.vacio ?? "Vacío."}</p>`}
      ${e === "Resuelta" && total > MAX_RESUELTAS ? `<button class="mas" type="button">${estado.verResueltas ? "Ver menos" : `Ver todas (${total})`}</button>` : ""}`;
    col.querySelector(".mas")?.addEventListener("click", () => { estado.verResueltas = !estado.verResueltas; dibujar(); });
  }
  // Estados que no están en las columnas (por si la bandeja tiene otros)
  document.querySelectorAll(".tarjeta").forEach((b) => b.addEventListener("click", () => abrir(b.dataset.id)));
}

function tarjeta(t) {
  const origen = [t.app, t.de].filter(Boolean).join(" · ");
  return `<li><button class="tarjeta" type="button" data-id="${esc(t.id)}" data-estado="${esc(t.estado)}">
    <span class="linea1"><span class="id">${esc(t.id)}</span>
      ${t.prioridad ? `<span class="prio" data-p="${esc(t.prioridad)}">${PRIORIDAD[t.prioridad] ?? esc(t.prioridad)}</span>` : ""}
      <span>${hace(t.actualizada)}</span></span>
    <span class="titulo">${esc(t.titulo)}</span>
    <span class="linea3">
      ${t.proyecto ? `<span class="chip proyecto">${esc(t.proyecto)}</span>` : `<span class="chip sin">sin proyecto</span>`}
      ${origen ? `<span>${esc(origen)}</span>` : ""}
      ${t.etiquetas.map((e) => `<span class="chip">${esc(e)}</span>`).join("")}
    </span>
    ${t.estado === "En análisis" ? '<span class="trabajando" aria-label="La IA la está analizando"></span>' : ""}
  </button></li>`;
}

// ---------------------------------------------------------------- Detalle
async function abrir(id, { refrescar = false } = {}) {
  let t;
  try { t = await api(`/api/tareas/${encodeURIComponent(id)}`); }
  catch (e) { if (!refrescar) avisar(e.message); cerrarPanel(); return; }
  const anterior = estado.abierta === id ? $("#panel-sello").textContent : null;
  estado.abierta = id;
  $("#velo").hidden = false;
  const panel = $("#panel");
  panel.hidden = false;
  panel.dataset.estado = t.estado;

  const origen = [t.app && `por ${t.app}`, t.de && `de ${t.de}`].filter(Boolean).join(" ");
  $("#panel-meta").innerHTML = `<span class="id">${esc(t.id)}</span>
    ${t.proyecto ? `<span class="chip proyecto">${esc(t.proyecto)}</span>` : `<span class="chip sin">sin proyecto</span>`}
    ${t.prioridad ? `<span>Prioridad ${PRIORIDAD[t.prioridad] ?? esc(t.prioridad)}</span>` : ""}
    ${origen ? `<span>Llegó ${esc(origen)}</span>` : ""}
    <span>${hace(t.creada)}</span>`;
  $("#panel-titulo").textContent = t.titulo;
  const sello = $("#panel-sello");
  sello.textContent = t.estado;
  sello.style.setProperty("--color", `var(--${{ "Pendiente": "pendiente", "En análisis": "analisis", "Esperando info": "espera", "Para revisar": "revisar", "Resuelta": "resuelta" }[t.estado] ?? "pendiente"})`);
  if (anterior !== t.estado) { sello.classList.remove("estampar"); void sello.offsetWidth; sello.classList.add("estampar"); }

  const historia = hojas(t.notas);
  $("#panel-cuerpo").innerHTML = `
    <section class="bloque"><h3>Mensaje</h3><p class="mensaje">${esc(t.mensaje || "(sin texto)")}</p></section>
    ${t.nota ? `<section class="bloque"><h3>Tu nota</h3>${md(t.nota)}</section>` : ""}
    ${t.imagenes.length ? `<section class="bloque"><h3>Imágenes</h3><div class="galeria">${t.imagenes.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Imagen adjunta"></a>`).join("")}</div></section>` : ""}
    ${t.links.length ? `<section class="bloque links"><h3>Mensaje original</h3>${t.links.map((l) => /^https?:\/\//.test(l) ? `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.length > 70 ? l.slice(0, 70) + "…" : l)}</a>` : esc(l)).join("<br>")}</section>` : ""}
    <section class="bloque"><h3>Seguimiento</h3>
      ${historia.length ? historia.map((h, i) => `
        <article class="hoja ${h.tipo}">
          <p class="hoja-quien">${h.tipo === "ia" ? "Análisis de la IA" : h.tipo === "vos" ? esc(h.titulo.replace(/^Respuestas?/i, "Tu respuesta")) : esc(h.titulo)}</p>
          ${md(h.cuerpo)}
          ${h.borrador ? `<div class="borrador"><div class="cab"><strong>Borrador de respuesta</strong>
            <button class="boton" type="button" data-copiar="${i}">Copiar</button></div>${md(h.borrador)}</div>` : ""}
        </article>`).join("")
      : `<p class="nota-estado">${t.estado === "Pendiente" || t.estado === "En análisis" ? "La IA todavía no escribió su análisis. Se actualiza sola." : "Sin análisis todavía."}</p>`}
    </section>`;
  $("#panel-cuerpo").querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(historia[b.dataset.copiar].borradorLimpio); avisar("Borrador copiado."); }
    catch { avisar("No se pudo copiar: seleccioná el texto a mano."); }
  }));

  dibujarAcciones(t);
  if (!refrescar) $("#cerrar-panel").focus();
}

function dibujarAcciones(t) {
  const acciones = $("#panel-acciones");
  const responder = (etiqueta, ayuda) => `
    <label class="campo">${etiqueta}<textarea id="respuesta" rows="3" placeholder="${esc(ayuda)}"></textarea></label>`;
  let principal = "";
  if (t.estado === "Esperando info") {
    principal = responder("Lo que faltaba", "Escribí los datos que pidió la IA") +
      `<div class="acciones-fila"><button class="boton primario" type="button" data-accion="responder">Enviar a la IA</button></div>`;
  } else if (t.estado === "Para revisar") {
    principal = `<div class="acciones-fila"><button class="boton primario" type="button" data-accion="resolver">Marcar resuelta</button>
      <button class="boton" type="button" data-accion="otra">Pedir otra vuelta</button></div>`;
  } else if (t.estado === "Resuelta") {
    principal = `<div class="acciones-fila"><button class="boton" type="button" data-accion="reabrir">Reabrir</button></div>`;
  } else if (t.estado === "Pendiente") {
    principal = `<p class="nota-estado">En cola: la IA la toma en unos segundos. Esta vista se actualiza sola.</p>`;
  } else {
    principal = `<p class="nota-estado">En análisis: la IA (o alguien desde Kiro) la está trabajando y el asistente automático no la toma.
      Si quedó trabada o la moviste acá por error, volvé a analizarla.</p>
      <div class="acciones-fila"><button class="boton" type="button" data-accion="reanalizar">Volver a analizar</button></div>`;
  }
  acciones.innerHTML = `${principal}
    <div class="acciones-fila"><span class="derecha">
      <label>Mover a <select id="mover">${Object.keys(ESTADOS).map((e) => `<option ${e === t.estado ? "selected" : ""}>${esc(e)}</option>`).join("")}</select></label>
      <button class="boton peligro" type="button" data-accion="archivar">Archivar</button>
    </span></div>`;

  const hacer = async (boton, fn, mensaje) => {
    boton.disabled = true;
    try { await fn(); avisar(mensaje); } catch (e) { avisar(e.message); } finally { boton.disabled = false; }
  };
  acciones.querySelectorAll("[data-accion]").forEach((b) => b.addEventListener("click", () => {
    const id = t.id;
    switch (b.dataset.accion) {
      case "responder": {
        const texto = $("#respuesta").value;
        if (!texto.trim()) return $("#respuesta").focus();
        return hacer(b, () => api(`/api/tareas/${id}/responder`, { method: "POST", body: JSON.stringify({ texto }) }), "Enviada. La IA la vuelve a mirar.");
      }
      case "otra":
        b.closest(".acciones-fila").outerHTML = responder("¿Qué le falta?", "Aclaraciones o datos nuevos para que la IA lo vuelva a analizar") +
          `<div class="acciones-fila"><button class="boton primario" type="button" data-accion="responder">Enviar a la IA</button></div>`;
        return dibujarAccionesDespues(t);
      case "resolver": return hacer(b, () => mover(id, "Resuelta"), "Marcada como resuelta.");
      case "reabrir": return hacer(b, () => mover(id, "Para revisar"), "Reabierta.");
      case "reanalizar": return hacer(b, () => mover(id, "Pendiente"), "Vuelve a la cola: la IA la toma en unos segundos.");
      case "archivar":
        if (b.dataset.seguro !== "1") { b.dataset.seguro = "1"; b.textContent = "¿Archivar? Confirmar"; return; }
        return hacer(b, async () => { await api(`/api/tareas/${id}/archivar`, { method: "POST", body: "{}" }); cerrarPanel(); }, "Archivada.");
    }
  }));
  $("#mover").addEventListener("change", (e) => {
    const destino = e.target.value;
    const mensaje = destino === "En análisis"
      ? "Queda reservada: la IA no la toma. Para que la analice, pasala a Pendiente."
      : destino === "Pendiente" ? "Vuelve a la cola: la IA la toma en unos segundos." : `Movida a ${destino}.`;
    mover(t.id, destino).then(() => avisar(mensaje), (err) => avisar(err.message));
  });
}

// Al reemplazar los botones por el campo de respuesta, se vuelven a conectar
function dibujarAccionesDespues(t) {
  const b = $('#panel-acciones [data-accion="responder"]');
  b.addEventListener("click", async () => {
    const texto = $("#respuesta").value;
    if (!texto.trim()) return $("#respuesta").focus();
    b.disabled = true;
    try { await api(`/api/tareas/${t.id}/responder`, { method: "POST", body: JSON.stringify({ texto }) }); avisar("Enviada. La IA la vuelve a mirar."); }
    catch (e) { avisar(e.message); } finally { b.disabled = false; }
  });
  $("#respuesta").focus();
}

const mover = (id, est) => api(`/api/tareas/${id}/estado`, { method: "POST", body: JSON.stringify({ estado: est }) });

function cerrarPanel() {
  estado.abierta = null;
  $("#panel").hidden = true;
  $("#velo").hidden = true;
}

// ---------------------------------------------------------------- Nueva tarea
const dialogo = $("#dialogo");

function abrirFormulario() {
  const sel = $("#campo-proyecto");
  const opciones = estado.proyectos.length > 1 ? ['<option value="">Elegí un proyecto</option>'] : [];
  sel.innerHTML = opciones.concat(estado.proyectos.map((p) => `<option ${estado.filtro === p ? "selected" : ""}>${esc(p)}</option>`)).join("")
    || '<option value="">(no hay proyectos configurados)</option>';
  $("#form-error").textContent = "";
  dialogo.showModal();
  $('[name="titulo"]').focus();
}

function agregarImagenes(archivos) {
  for (const f of archivos) {
    if (!f.type.startsWith("image/")) continue;
    if (f.size > 10 * 1024 * 1024) { avisar(`${f.name}: muy grande (máximo 10 MB).`); continue; }
    const lector = new FileReader();
    lector.onload = () => { estado.imagenes.push({ nombre: f.name || "captura.png", datos: lector.result }); dibujarMiniaturas(); };
    lector.readAsDataURL(f);
  }
}

function dibujarMiniaturas() {
  $("#miniaturas").innerHTML = estado.imagenes.map((img, i) =>
    `<li><img src="${img.datos}" alt="${esc(img.nombre)}"><button type="button" data-quitar="${i}" aria-label="Quitar ${esc(img.nombre)}">×</button></li>`).join("");
  $("#miniaturas").querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", () => { estado.imagenes.splice(+b.dataset.quitar, 1); dibujarMiniaturas(); }));
}

function limpiarFormulario() {
  $("#form-nueva").reset();
  estado.imagenes = [];
  dibujarMiniaturas();
}

$("#nueva").addEventListener("click", abrirFormulario);
$("#cancelar").addEventListener("click", () => dialogo.close());
const soltar = $("#soltar");
soltar.addEventListener("click", () => $("#archivos").click());
soltar.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#archivos").click(); } });
$("#archivos").addEventListener("change", (e) => { agregarImagenes(e.target.files); e.target.value = ""; });
soltar.addEventListener("dragover", (e) => { e.preventDefault(); soltar.classList.add("encima"); });
soltar.addEventListener("dragleave", () => soltar.classList.remove("encima"));
soltar.addEventListener("drop", (e) => { e.preventDefault(); soltar.classList.remove("encima"); agregarImagenes(e.dataTransfer.files); });
dialogo.addEventListener("paste", (e) => {
  const archivos = [...(e.clipboardData?.files ?? [])];
  if (archivos.length) { e.preventDefault(); agregarImagenes(archivos); }
});

$("#form-nueva").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const datos = Object.fromEntries(f.entries());
  if (!datos.titulo.trim()) return ($("#form-error").textContent = "Falta el título.", $('[name="titulo"]').focus());
  if (!datos.mensaje.trim()) return ($("#form-error").textContent = "Falta el mensaje.", $('[name="mensaje"]').focus());
  if (estado.proyectos.length > 1 && !datos.proyecto) return ($("#form-error").textContent = "Elegí el proyecto.", $("#campo-proyecto").focus());
  datos.etiquetas = (datos.etiquetas || "").split(",").map((x) => x.trim()).filter(Boolean);
  datos.imagenes = estado.imagenes;
  const boton = $("#crear");
  boton.disabled = true;
  boton.textContent = "Creando…";
  try {
    const { id } = await api("/api/tareas", { method: "POST", body: JSON.stringify(datos) });
    dialogo.close();
    limpiarFormulario();
    avisar(`Tarea ${id} creada. La IA la toma en unos segundos.`);
  } catch (err) {
    $("#form-error").textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = "Crear tarea";
  }
});

// ---------------------------------------------------------------- Generales
$("#buscar").addEventListener("input", (e) => { estado.texto = e.target.value; dibujar(); });
$("#cerrar-panel").addEventListener("click", cerrarPanel);
$("#velo").addEventListener("click", cerrarPanel);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#panel").hidden && !dialogo.open) cerrarPanel();
  if (e.key === "n" && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !dialogo.open) {
    e.preventDefault();
    abrirFormulario();
  }
});

// ---------------------------------------------------------------- Sesión de cada IA
const NOMBRE_IA = { kiro: "Kiro", claude: "Claude" };
const esperandoLogin = {}; // motor -> momento en que se abrió el login (se revisa más seguido)

async function revisarSesiones(ahora = false) {
  let sesiones;
  try { sesiones = await api(`/api/sesiones${ahora ? "?ahora" : ""}`); } catch { return; }
  const caja = $("#sesiones");
  caja.innerHTML = sesiones.map((s) => {
    const ia = NOMBRE_IA[s.motor] ?? s.motor;
    if (s.conectado && esperandoLogin[s.motor]) { avisar(`${ia} reconectado. Las tareas pendientes se procesan solas.`); delete esperandoLogin[s.motor]; }
    const estado = s.conectado ? "conectado" : esperandoLogin[s.motor] ? "esperando" : "sin-sesion";
    const texto = s.conectado ? `${ia} conectado` : esperandoLogin[s.motor] ? `${ia}: esperando el inicio de sesión…`
      : s.instalado ? `${ia} sin sesión` : `${ia} no está instalado`;
    const titulo = s.conectado ? (s.usuario ? `Sesión de ${s.usuario}` : "") : "Mientras no tenga sesión, sus tareas esperan en Pendiente.";
    const boton = !s.conectado && s.instalado
      ? `<button class="boton chico" type="button" data-login="${esc(s.motor)}">${esperandoLogin[s.motor] ? "Abrir de nuevo" : "Reconectar"}</button>` : "";
    return `<div class="sesion" data-estado="${estado}" title="${esc(titulo)}"><span class="punto" aria-hidden="true"></span><span>${esc(texto)}</span>${boton}</div>`;
  }).join("");
  caja.querySelectorAll("[data-login]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const { mensaje } = await api(`/api/sesiones/${b.dataset.login}/login`, { method: "POST", body: "{}" });
      esperandoLogin[b.dataset.login] = Date.now();
      avisar(mensaje);
      revisarSesiones();
    } catch (e) { avisar(e.message); }
  }));
}

// Esperando un login: se fuerza la revisión cada 5 s durante 10 minutos. Si no, el servidor responde
// con lo que revisó en el último minuto (no vuelve a consultar a la IA).
setInterval(() => {
  for (const [m, t0] of Object.entries(esperandoLogin)) if (Date.now() - t0 > 10 * 60 * 1000) delete esperandoLogin[m];
  revisarSesiones(Object.keys(esperandoLogin).length > 0);
}, 5000);
revisarSesiones();

// Cambios en vivo (la IA mueve tareas, Kiro crea otras...)
let recarga;
const eventos = new EventSource("/api/eventos");
eventos.onmessage = () => { clearTimeout(recarga); recarga = setTimeout(cargar, 150); };
setInterval(() => dibujar(), 60000); // refresca los "hace X min"

cargar();
