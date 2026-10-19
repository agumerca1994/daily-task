// Sección Configuración: proyectos (IA, modelo, carpeta, conectores), instrucciones propias y
// opciones generales. Usa $, esc, api y avisar de app.js.
"use strict";

const conf = { datos: null, modelos: null };
const PERMISOS = [["", "No"], ["lectura", "Lectura"], ["escritura", "Escritura"]];

// ---------------------------------------------------------------- Navegación tablero <-> configuración
function mostrarVista() {
  const enConfig = location.hash === "#configuracion";
  $("#vista-config").hidden = !enConfig;
  $("#vista-tablero").hidden = enConfig;
  $("#proyectos").hidden = enConfig;
  $(".buscar").hidden = enConfig;
  $("#enlace-config").setAttribute("aria-current", enConfig ? "page" : "false");
  if (enConfig) { cerrarPanel(); cargarConfig(); }
}
window.addEventListener("hashchange", mostrarVista);

async function cargarConfig() {
  try {
    conf.datos = await api("/api/config");
    dibujarConfig();
    if (!conf.modelos) {
      api("/api/modelos").then((m) => { conf.modelos = m; dibujarConfig(); }).catch(() => { conf.modelos = []; });
    }
  } catch (e) {
    $("#config-cuerpo").innerHTML = `<p class="error">No pude leer la configuración: ${esc(e.message)}</p>`;
  }
}

// ---------------------------------------------------------------- Dibujo
function opcionesModelo(motor, actual) {
  if (motor !== "kiro") return null;
  const lista = conf.modelos;
  const base = `<option value="">Automático (el que elija Kiro)</option>`;
  if (!lista) return base + (actual ? `<option selected>${esc(actual)}</option>` : "") + `<option disabled>Cargando modelos…</option>`;
  const ids = lista.map((m) => m.id).filter((id) => id !== "auto");
  if (actual && !ids.includes(actual)) ids.unshift(actual);
  return base + ids.map((id) => {
    const m = lista.find((x) => x.id === id);
    const costo = m?.costo ? ` · ${String(m.costo).replace(".", ",")}x créditos` : "";
    return `<option value="${esc(id)}" ${id === actual ? "selected" : ""}>${esc(id)}${costo}</option>`;
  }).join("");
}

function tarjetaProyecto(p) {
  const d = conf.datos;
  const modelo = opcionesModelo(p.motor, p.modelo);
  const conectores = p.disponibles.length
    ? p.disponibles.map((c) => {
      const actual = Array.isArray(p.conectores[c.nombre]) ? "personalizado" : (p.conectores[c.nombre] ?? "");
      if (actual === "personalizado") {
        return `<div class="fila-con"><span class="nombre-con">${esc(c.nombre)}</span>
          <span class="nota-estado">Herramientas a medida: ${esc(p.conectores[c.nombre].join(", "))} (se cambia por comando)</span></div>`;
      }
      return `<div class="fila-con"><span class="nombre-con">${esc(c.nombre)}</span>
        <span class="segmento" role="radiogroup" aria-label="Permiso de ${esc(c.nombre)}">
          ${PERMISOS.map(([v, t]) => `<label><input type="radio" name="con-${esc(p.nombre)}-${esc(c.nombre)}" value="${v}"
            data-conector="${esc(c.nombre)}" ${actual === v ? "checked" : ""}
            ${v === "lectura" && !c.lecturaConocida ? 'disabled title="No sé qué herramientas de este conector son de lectura: se configura por comando"' : ""}><span>${t}</span></label>`).join("")}
        </span></div>`;
    }).join("")
    : `<p class="vacio-con">Este proyecto no tiene conectores configurados en Kiro (.kiro/settings/mcp.json).</p>`;
  return `<article class="conf-proyecto" data-nombre="${esc(p.nombre)}">
    <header><h3>${esc(p.nombre)}</h3>${d.porDefecto === p.nombre ? '<span class="chip">por defecto</span>' : ""}</header>
    <label class="campo">Carpeta del proyecto
      <input name="carpeta" value="${esc(p.carpeta)}" spellcheck="false">
    </label>
    ${p.existe ? "" : '<p class="alerta">No encuentro esta carpeta: corregí la ruta.</p>'}
    <div class="fila">
      <label class="campo">IA que lo atiende
        <select name="motor">${d.motores.map((m) => `<option ${m === p.motor ? "selected" : ""}>${m}</option>`).join("")}</select>
      </label>
      <label class="campo">Modelo
        ${modelo !== null ? `<select name="modelo">${modelo}</select>` : `<input name="modelo" value="${esc(p.modelo)}" placeholder="El predeterminado de Claude">`}
      </label>
    </div>
    <div class="campo"><span>Conectores que puede usar la IA</span>
      <div class="conectores">${conectores}</div>
    </div>
    <p class="aviso-escritura" ${Object.values(p.conectores).includes("escritura") ? "" : "hidden"}>
      Con escritura la IA puede crear y modificar, pero antes te propone la acción en la tarea y espera tu aprobación.</p>
    <div class="acciones-fila">
      <button class="boton primario" type="button" data-guardar disabled>Guardar cambios</button>
      <span class="derecha"><button class="boton peligro" type="button" data-quitar>Quitar proyecto</button></span>
    </div>
  </article>`;
}

function dibujarConfig() {
  const d = conf.datos;
  $("#config-cuerpo").innerHTML = `
    <section class="conf-bloque" aria-labelledby="c-proy">
      <h2 class="grupo-titulo" id="c-proy">Proyectos</h2>
      <p class="ayuda">La IA trabaja cada tarea dentro de la carpeta de su proyecto: lee su código, documentación e instrucciones, y solo usa los conectores que habilites acá.</p>
      ${d.proyectos.map(tarjetaProyecto).join("") || '<p class="vacio">Todavía no hay proyectos.</p>'}
      <details class="conf-nuevo" ${d.proyectos.length ? "" : "open"}>
        <summary>Agregar un proyecto</summary>
        <form id="form-proyecto" novalidate>
          <div class="fila">
            <label class="campo">Nombre corto<input name="nombre" maxlength="40" placeholder="Ej.: SmartHome"></label>
            <label class="campo">IA que lo atiende<select name="motor">${d.motores.map((m) => `<option>${m}</option>`).join("")}</select></label>
          </div>
          <label class="campo">Carpeta del proyecto<input name="carpeta" spellcheck="false" placeholder="Pegá la ruta, por ejemplo C:\\Users\\vos\\repos\\mi-proyecto"></label>
          <p class="error" id="error-proyecto" role="alert"></p>
          <div class="botones"><button class="boton primario" type="submit">Agregar proyecto</button></div>
        </form>
      </details>
    </section>

    <section class="conf-bloque" aria-labelledby="c-inst">
      <h2 class="grupo-titulo" id="c-inst">Tus instrucciones para la IA</h2>
      <p class="ayuda">Se suman a las reglas generales en todos los proyectos: tu rol, a quién se escala cada cosa, el tono de los borradores. Solo quedan en tu PC.</p>
      <textarea class="conf-texto" id="instrucciones" spellcheck="false">${esc(d.instrucciones)}</textarea>
      <div class="botones" style="margin-top:10px"><button class="boton primario" type="button" id="guardar-inst" disabled>Guardar instrucciones</button></div>
    </section>

    <section class="conf-bloque" aria-labelledby="c-gen">
      <h2 class="grupo-titulo" id="c-gen">General</h2>
      <div class="conf-general">
        <label class="campo">Tareas sin proyecto
          <select id="por-defecto">
            <option value="">${d.proyectos.length === 1 ? `Van a ${esc(d.proyectos[0].nombre)} (es el único)` : "Esperan a que les elijas proyecto"}</option>
            ${d.proyectos.map((p) => `<option value="${esc(p.nombre)}" ${d.porDefecto === p.nombre ? "selected" : ""}>Van a ${esc(p.nombre)}</option>`).join("")}
          </select>
        </label>
        <label class="check"><input type="checkbox" id="notificaciones" ${d.notificaciones ? "checked" : ""}> Avisarme con una notificación cuando una tarea queda para revisar o esperando info</label>
      </div>
    </section>`;
  conectarConfig();
}

// ---------------------------------------------------------------- Eventos
function leerTarjeta(art) {
  const conectores = {};
  art.querySelectorAll("input[data-conector]:checked").forEach((r) => { if (r.value) conectores[r.dataset.conector] = r.value; });
  // Los conectores a medida (por comando) se conservan tal cual
  const original = conf.datos.proyectos.find((p) => p.nombre === art.dataset.nombre);
  for (const [s, v] of Object.entries(original.conectores)) if (Array.isArray(v)) conectores[s] = v;
  return {
    nombre: art.dataset.nombre,
    carpeta: art.querySelector('[name="carpeta"]').value,
    motor: art.querySelector('[name="motor"]').value,
    modelo: art.querySelector('[name="modelo"]').value,
    conectores,
  };
}

function conectarConfig() {
  document.querySelectorAll(".conf-proyecto").forEach((art) => {
    const guardar = art.querySelector("[data-guardar]");
    const marcar = () => {
      guardar.disabled = false;
      const conEscritura = !!art.querySelector('input[value="escritura"]:checked');
      art.querySelector(".aviso-escritura").hidden = !conEscritura;
    };
    art.querySelectorAll("input, select").forEach((el) => el.addEventListener("change", marcar));
    art.querySelector('[name="carpeta"]').addEventListener("input", marcar);
    // Cambiar de IA cambia el tipo de campo de modelo
    art.querySelector('[name="motor"]').addEventListener("change", (e) => {
      const p = conf.datos.proyectos.find((x) => x.nombre === art.dataset.nombre);
      p.motor = e.target.value;
      p.modelo = "";
      const cont = art.querySelector('[name="modelo"]').parentElement;
      const opciones = opcionesModelo(p.motor, "");
      cont.querySelector('[name="modelo"]').outerHTML = opciones !== null
        ? `<select name="modelo">${opciones}</select>` : `<input name="modelo" placeholder="El predeterminado de Claude">`;
      cont.querySelector('[name="modelo"]').addEventListener("change", marcar);
    });
    guardar.addEventListener("click", async () => {
      guardar.disabled = true;
      try {
        const r = await api("/api/config/proyecto", { method: "POST", body: JSON.stringify(leerTarjeta(art)) });
        avisar(r.avisos?.length ? r.avisos.join(" ") : `Cambios de ${art.dataset.nombre} guardados. Aplican desde la próxima tarea.`);
        await cargarConfig();
        cargar();
      } catch (e) { avisar(e.message); guardar.disabled = false; }
    });
    const quitar = art.querySelector("[data-quitar]");
    quitar.addEventListener("click", async () => {
      if (quitar.dataset.seguro !== "1") { quitar.dataset.seguro = "1"; quitar.textContent = "¿Quitar? Sus tareas quedan. Confirmar"; return; }
      try {
        await api("/api/config/quitar", { method: "POST", body: JSON.stringify({ nombre: art.dataset.nombre }) });
        avisar(`Proyecto ${art.dataset.nombre} quitado. Sus tareas siguen en la bandeja.`);
        await cargarConfig();
        cargar();
      } catch (e) { avisar(e.message); }
    });
  });

  $("#form-proyecto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    if (!f.nombre.trim()) return ($("#error-proyecto").textContent = "Poné un nombre.");
    if (!f.carpeta.trim()) return ($("#error-proyecto").textContent = "Pegá la ruta de la carpeta.");
    try {
      await api("/api/config/proyecto", { method: "POST", body: JSON.stringify({ ...f, nuevo: true }) });
      avisar(`Proyecto ${f.nombre} agregado. Elegí abajo qué conectores puede usar.`);
      await cargarConfig();
      cargar();
    } catch (err) { $("#error-proyecto").textContent = err.message; }
  });

  const inst = $("#instrucciones");
  const guardarInst = $("#guardar-inst");
  inst.addEventListener("input", () => { guardarInst.disabled = false; });
  guardarInst.addEventListener("click", async () => {
    guardarInst.disabled = true;
    try { await api("/api/config/instrucciones", { method: "POST", body: JSON.stringify({ texto: inst.value }) }); avisar("Instrucciones guardadas. Aplican desde la próxima tarea."); }
    catch (e) { avisar(e.message); guardarInst.disabled = false; }
  });

  $("#por-defecto").addEventListener("change", (e) => api("/api/config/general", { method: "POST", body: JSON.stringify({ porDefecto: e.target.value }) })
    .then(() => avisar("Guardado."), (err) => avisar(err.message)));
  $("#notificaciones").addEventListener("change", (e) => api("/api/config/general", { method: "POST", body: JSON.stringify({ notificaciones: e.target.checked }) })
    .then(() => avisar(e.target.checked ? "Notificaciones activadas." : "Notificaciones desactivadas."), (err) => avisar(err.message)));
}

mostrarVista();
