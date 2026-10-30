// Grupo «tareas»: tareas, notas, agenda y actividad. Enviar el reporte diario sale por correo → pide OK.
import { z, negocio, idRuta, dia, limpiar, lista, ficha, filasDe, claveNombre, fichaPorId, filasCompletas, otrosNombres, linea60, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

/** Título por id en la lista del panel + los otros títulos (señuelos de la ventana). */
async function tituloDeLista(ruta, id, leer) {
  const filas = await filasCompletas(leer, ruta);
  const f = filas?.find((x) => x && String(x.id) === String(id));
  return { titulo: f?.title ?? f?.titulo, otros: otrosNombres(filas, id, ["title", "titulo"]) };
}
const ventanaTitulo = (etiqueta) => (_a, previa) => {
  const p = /** @type {any} */ (previa);
  return { clave: p?.titulo ? claveNombre(p.titulo, p.otros, { etiqueta, palabra: "título" }) : null, filas: [] };
};

const PRIORIDADES = ["baja", "media", "alta", "urgente"];
const ESTADOS = ["pendiente", "en_progreso", "completada", "cancelada"];
const COLORES = ["yellow", "green", "blue", "pink", "purple", "orange"];

// ── Carril C (29-10): actividades de la agenda (ADR-501). Escriben admin, dueño, tienda_owner y encargado. ──
const REGLAS_AGENDA = ["asistencia", "facturas", "servicio_aserrio", "gastos_ingresos", "adelantos", "cuenta_tercero", "manual"];
const FRECUENCIAS = ["una_vez", "diaria", "semanal", "quincenal", "mensual", "cada_n_dias"];
const CANALES = ["campana", "telegram", "n8n", "reporte_diario", "google"];
const ROLES_RESP = ["admin", "owner", "tienda_owner", "manager", "cajero", "almacenero", "analista"];
const COLORES_AG = ["info", "success", "warning", "error", "neutral"];
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora va como HH:MM");
const recurrencia = z.object({
  frecuencia: z.enum(/** @type {[string, ...string[]]} */ (FRECUENCIAS)).describe("una_vez, diaria, semanal, quincenal, mensual o cada_n_dias"),
  desde: dia.describe("Primer día"),
  hasta: dia.nullable().optional().describe("Último día (null = sin fin)"),
  diasSemana: z.array(z.number().int().min(0).max(6)).max(7).optional().describe("0=domingo … 6=sábado; obligatorio en diaria/semanal/quincenal"),
  diaMes: z.number().int().min(1).max(31).nullable().optional().describe("Día del mes; obligatorio en mensual"),
  cadaN: z.number().int().min(1).max(366).nullable().optional().describe("Cada cuántos días; obligatorio en cada_n_dias"),
});
const objetivo = z.object({ tipo: z.enum(["parte", "beneficiario"]), id: z.string().min(1).max(64), nombre: z.string().min(1).max(160) }).nullable().optional().describe("A qué cuenta o beneficiario apunta (cuenta_tercero la exige; adelantos la admite)");
const camposActividad = {
  regla: z.enum(/** @type {[string, ...string[]]} */ (REGLAS_AGENDA)).describe("Qué revisa sola: asistencia, facturas, servicio_aserrio, gastos_ingresos, adelantos, cuenta_tercero o manual"),
  objetivo,
  recurrencia: recurrencia.describe("Cada cuánto se repite"),
  hora: hora.nullable().optional().describe("HH:MM, null = sin hora"),
  canales: z.array(z.enum(/** @type {[string, ...string[]]} */ (CANALES))).min(1).optional().describe("Dónde avisa: campana, telegram, n8n, reporte_diario, google"),
  responsableRol: z.enum(/** @type {[string, ...string[]]} */ (ROLES_RESP)).nullable().optional().describe("Rol responsable"),
  parametros: z.record(z.string(), z.unknown()).optional().describe("Según la regla (ej. asistencia: {minimo:\"todos\"})"),
  color: z.enum(/** @type {[string, ...string[]]} */ (COLORES_AG)).optional(),
  nota: z.string().max(500).nullable().optional(),
  activo: z.boolean().optional(),
};
const sinUndef = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const cuerpoActividad = (a) => sinUndef({ nombre: a.nombre, regla: a.regla, objetivo: a.objetivo, recurrencia: a.recurrencia ? sinUndef(a.recurrencia) : undefined, hora: a.hora, canales: a.canales, responsableRol: a.responsableRol, parametros: a.parametros, color: a.color, nota: a.nota, activo: a.activo });
const recurTexto = (r) => (r && typeof r === "object" ? `${String(r.frecuencia ?? "").replace("_", " ")}${r.diasSemana?.length ? ` (días ${r.diasSemana.join(",")})` : ""}${r.diaMes ? ` (día ${r.diaMes})` : ""}${r.cadaN ? ` (cada ${r.cadaN})` : ""} desde ${r.desde}${r.hasta ? ` hasta ${r.hasta}` : ""}` : "—");

/** Nombre de la actividad por id en la lista del panel (no hay GET por id) + los otros nombres. */
async function actividadDeLista(id, leer) {
  const filas = await filasCompletas(leer, "/api/admin/agenda/actividades");
  const f = filas?.find((x) => x && String(x.id) === String(id));
  return { nombre: f?.nombre, otros: otrosNombres(filas, id, ["nombre"]), activa: f?.activo };
}

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
const herramientasAgenda = [
  {
    nombre: "agenda_actividades_ver",
    grupo: "tareas",
    tipo: "lectura",
    descripcion: "Lista las actividades de la agenda (GET /api/admin/agenda/actividades): nombre, regla, repetición, hora, canales, si está activa, su id y su versión (la versión se pide al editar). Filtra por texto q, regla o solo activas. Ej.: soloActivas=true.",
    entrada: { negocio, q: z.string().max(100).optional().describe("Texto en el nombre"), regla: z.enum(/** @type {[string, ...string[]]} */ (REGLAS_AGENDA)).optional(), soloActivas: z.boolean().optional() },
    pedido: () => ({ metodo: "GET", ruta: "/api/admin/agenda/actividades" }),
    formatear: (d, a) => {
      const q = String(a?.q ?? "").toLowerCase();
      const todas = filasDe(d).filter((x) => x && (!q || String(x.nombre ?? "").toLowerCase().includes(q)) && (!a?.regla || x.regla === a.regla) && (!a?.soloActivas || x.activo !== false));
      if (!todas.length) return "Actividades de la agenda: sin resultados.";
      const filas = todas.slice(0, 50).map((x) => `- ${x.nombre} · ${x.regla} · ${recurTexto(x.recurrencia)}${x.hora ? ` · ${x.hora}` : ""} · ${x.activo === false ? "apagada" : "activa"} · canales ${(x.canales ?? []).join("/")} · id ${x.id} · versión ${x.version}`);
      return [`Actividades de la agenda (${filas.length}${todas.length > 50 ? ` de ${todas.length}` : ""}):`, ...filas].join("\n");
    },
  },
  {
    nombre: "agenda_actividad_crear",
    grupo: "tareas",
    tipo: "escritura",
    descripcion: "Crea una actividad en la agenda (POST /api/admin/agenda/actividades): nombre, cada cuánto se repite y a quién avisa. Devuelve la actividad con su id. Ej.: nombre=\"Revisar caja\", regla=manual, recurrencia={frecuencia:\"semanal\", desde:\"2026-11-02\", diasSemana:[1]}.",
    entrada: { negocio, nombre: z.string().min(1).max(80).describe("Nombre (hasta 80)"), ...camposActividad, regla: camposActividad.regla.optional().describe("Por defecto manual") },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/admin/agenda/actividades", cuerpo: cuerpoActividad(a) }),
  },
  {
    nombre: "agenda_actividad_editar",
    grupo: "tareas",
    tipo: "escritura",
    descripcion: "Edita una actividad de la agenda (PATCH /api/admin/agenda/actividades/[id]): manda solo lo que cambia más la versión que dio agenda_actividades_ver (si alguien la cambió antes, el panel avisa). Ej.: id=<id>, version=<versión>, hora=\"09:00\".",
    entrada: { negocio, id: idRuta.describe("Id de la actividad"), version: z.string().max(40).describe("Versión (ISO) que mostró agenda_actividades_ver"), nombre: z.string().min(1).max(80).optional(), ...Object.fromEntries(Object.entries(camposActividad).map(([k, v]) => [k, v.optional()])) },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/admin/agenda/actividades/${a.id}`, cuerpo: { ...cuerpoActividad(a), version: a.version } }),
  },
  {
    nombre: "agenda_actividad_borrar",
    grupo: "tareas",
    tipo: "confirmar",
    descripcion: "Borra una actividad de la agenda (DELETE /api/admin/agenda/actividades/[id]; el panel la deja oculta y apagada, y quita su aviso en Google). Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id de la actividad: el nombre del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/admin/agenda/actividades/${a.id}` }),
    previa: (a, leer) => actividadDeLista(a.id, leer),
    resumen: (a, previa) => `Borrar la actividad de agenda «${verificado(/** @type {any} */ (previa)?.nombre)}». Deja de avisar y se quita de la agenda.`,
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Actividad", palabra: "nombre" }) : null, filas: [{ etiqueta: "Estado hoy", valor: p?.activa === false ? "apagada" : p?.activa === true ? "activa" : "(no se pudo leer)" }] };
    },
  },
];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "tareas_ver",
    grupo: "tareas",
    tipo: "lectura",
    descripcion: "Lista las tareas del panel (GET /api/tasks): título, prioridad, estado, responsable y fecha límite.",
    entrada: { negocio },
    pedido: () => ({ metodo: "GET", ruta: "/api/tasks" }),
    formatear: (d) => lista(d, { titulo: "Tareas", cols: [["Tarea", ["title"]], ["Prioridad", ["priority"]], ["Estado", ["status"]], ["Responsable", ["assignedTo"]], ["Vence", ["dueDate"], "f"], ["Id", ["id"]]] }),
  },
  {
    nombre: "tarea_crear",
    grupo: "tareas",
    tipo: "escritura",
    descripcion: "Crea una tarea (POST /api/tasks); nace pendiente. Devuelve la tarea con su id.",
    entrada: { negocio, titulo: z.string().min(1).max(200), descripcion: z.string().max(2000).optional(), prioridad: z.enum(/** @type {[string, ...string[]]} */ (PRIORIDADES)).optional(), responsable: z.string().max(120).optional(), fechaLimite: dia.optional(), modulo: z.string().max(60).optional() },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/tasks", cuerpo: limpiar({ title: a.titulo, description: a.descripcion, priority: a.prioridad, assignedTo: a.responsable, dueDate: a.fechaLimite, module: a.modulo }) }),
  },
  {
    nombre: "tarea_editar",
    grupo: "tareas",
    tipo: "escritura",
    descripcion: "Edita una tarea o cambia su estado (PATCH /api/tasks/[id]): título, prioridad, estado (pendiente|en_progreso|completada|cancelada), responsable, fecha límite.",
    entrada: { negocio, id: idRuta, titulo: z.string().min(1).max(200).optional(), descripcion: z.string().max(2000).optional(), prioridad: z.enum(/** @type {[string, ...string[]]} */ (PRIORIDADES)).optional(), estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS)).optional(), responsable: z.string().max(120).optional(), fechaLimite: dia.optional() },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/tasks/${a.id}`, cuerpo: limpiar({ title: a.titulo, description: a.descripcion, priority: a.prioridad, status: a.estado, assignedTo: a.responsable, dueDate: a.fechaLimite }) }),
  },
  {
    nombre: "tarea_borrar",
    grupo: "tareas",
    tipo: "confirmar",
    descripcion: "Borra una tarea (DELETE /api/tasks/[id]). Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id de la tarea: el título del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/tasks/${a.id}` }),
    previa: (a, leer) => tituloDeLista("/api/tasks", a.id, leer),
    resumen: (a, previa) => `Borrar la tarea «${verificado(/** @type {any} */ (previa)?.titulo)}». No se puede deshacer.`,
    ventana: ventanaTitulo("Tarea"),
  },
  {
    nombre: "notas_ver",
    grupo: "tareas",
    tipo: "lectura",
    descripcion: "Lista las notas del panel (GET /api/notes): título, contenido, color y si está fijada.",
    entrada: { negocio },
    pedido: () => ({ metodo: "GET", ruta: "/api/notes" }),
    formatear: (d) => lista(d, { titulo: "Notas", cols: [["Título", ["title"]], ["Texto", ["content"]], ["Fijada", ["pinned"]], ["Id", ["id"]]] }),
  },
  {
    nombre: "nota_crear",
    grupo: "tareas",
    tipo: "escritura",
    descripcion: "Crea una nota (POST /api/notes) con título, texto y color.",
    entrada: { negocio, titulo: z.string().min(1).max(200), texto: z.string().max(5000).optional(), color: z.enum(/** @type {[string, ...string[]]} */ (COLORES)).optional(), fijada: z.boolean().optional() },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/notes", cuerpo: limpiar({ title: a.titulo, content: a.texto, color: a.color, pinned: a.fijada }) }),
  },
  {
    nombre: "nota_editar",
    grupo: "tareas",
    tipo: "escritura",
    descripcion: "Edita una nota (PATCH /api/notes?id=): título, texto, color o fijada.",
    entrada: { negocio, id: idRuta, titulo: z.string().min(1).max(200).optional(), texto: z.string().max(5000).optional(), color: z.enum(/** @type {[string, ...string[]]} */ (COLORES)).optional(), fijada: z.boolean().optional() },
    pedido: (a) => ({ metodo: "PATCH", ruta: "/api/notes", query: { id: a.id }, cuerpo: limpiar({ title: a.titulo, content: a.texto, color: a.color, pinned: a.fijada }) }),
  },
  {
    nombre: "nota_borrar",
    grupo: "tareas",
    tipo: "confirmar",
    descripcion: "Borra una nota (DELETE /api/notes?id=). Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id de la nota: el título del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: "/api/notes", query: { id: a.id } }),
    previa: (a, leer) => tituloDeLista("/api/notes", a.id, leer),
    resumen: (a, previa) => `Borrar la nota «${verificado(/** @type {any} */ (previa)?.titulo)}». No se puede deshacer.`,
    ventana: ventanaTitulo("Nota"),
  },
  {
    nombre: "agenda_hoy",
    grupo: "tareas",
    tipo: "lectura",
    descripcion: "Agenda de hoy (GET /api/admin/agenda/hoy): lo de hoy, atrasadas de los últimos 7 días, alertas y a quién escribirle.",
    entrada: { negocio, fresco: z.boolean().optional().describe("Saltarse la caché") },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/agenda/hoy", query: limpiar({ fresco: a.fresco ? "1" : undefined }) }),
    formatear: (d) => (d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3500) : "Sin datos."),
  },
  {
    nombre: "actividad_ver",
    grupo: "tareas",
    tipo: "lectura",
    descripcion: "Registro de actividad del panel (GET /api/activity-log): quién hizo qué y cuándo. Filtra por usuario (ej. claude), entidad, acción. Máx. 50.",
    entrada: { negocio, usuario: z.string().max(100).optional(), entidad: z.string().max(100).optional(), entidadId: z.string().max(200).optional(), accion: z.string().max(100).optional(), limite: z.number().int().min(1).max(50).optional(), cursor: z.string().max(100).optional() },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/activity-log", query: limpiar({ user: a.usuario, entity: a.entidad, entityId: a.entidadId, action: a.accion, limit: a.limite ?? 50, cursor: a.cursor }) }),
    formatear: (d) => lista(d, { titulo: "Actividad", cols: [["Fecha", ["createdAt", "timestamp"], "f"], ["Usuario", ["user"]], ["Acción", ["action"]], ["Entidad", ["entity"]], ["Detalle", ["detail"]]] }),
  },
  {
    nombre: "reporte_diario_enviar",
    grupo: "tareas",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Envía por correo un reporte diario forestal ya armado (POST /api/admin/forestal/reportes-diarios/[id]/enviar). Sale del negocio hacia afuera: pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id del reporte: el nombre y los destinatarios los saca el panel") },
    pedido: (a) => ({ metodo: "POST", ruta: `/api/admin/forestal/reportes-diarios/${a.id}/enviar` }),
    previa: async (a, leer) => {
      const r = /** @type {any} */ (await fichaPorId(leer, `/api/admin/forestal/reportes-diarios/${a.id}`, "reporte"));
      const correos = Array.isArray(r?.correos) && r?.porCorreo !== false ? r.correos.length : 0;
      const telefonos = Array.isArray(r?.telefonos) && r?.porWhatsapp ? r.telefonos.length : 0;
      return { nombre: r?.nombre, correos, telefonos, leido: Boolean(r) };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const a_quien = p?.leido ? [p.correos && `${p.correos} correo(s)`, p.telefonos && `${p.telefonos} WhatsApp`].filter(Boolean).join(" y ") || "sus destinatarios" : `${NO_VERIFICADO} (destinatarios)`;
      return `Enviar el reporte diario «${verificado(p?.nombre)}» a ${a_quien}. No se puede recoger un correo ya enviado.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.nombre ? claveNombre(p.nombre, [], { etiqueta: "Reporte", palabra: "nombre de reporte" }) : null, filas: [{ etiqueta: "Destinatarios", valor: p?.leido ? `${p.correos} correo(s), ${p.telefonos} WhatsApp` : NO_VERIFICADO }] };
    },
  },
  ...herramientasAgenda,
];
