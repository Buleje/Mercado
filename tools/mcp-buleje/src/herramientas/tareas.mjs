// Grupo «tareas»: tareas, notas, agenda y actividad. Enviar el reporte diario sale por correo → pide OK.
import { z, negocio, idRuta, dia, limpiar, lista, ficha, claveNombre, fichaPorId, filasCompletas, otrosNombres, linea60, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

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
];
