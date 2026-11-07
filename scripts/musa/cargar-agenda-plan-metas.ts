/**
 * Carga en Musa (tenant `cmv1v4b8e0002rlvz6ibrullo`) lo que el manual v5 deja
 * como seguimiento: Agenda (ADR-501), FODA y estrategias de la Planificación
 * (ADR-497), Metas (ADR-488) y las decisiones pendientes como Tareas.
 * (Brandon, 2026-10-20.)
 *
 * IDEMPOTENTE: cada cosa se reconoce por su nombre/título (actividades, metas,
 * tareas) o por «la sección ya tiene contenido» (FODA, estrategias). Correrlo
 * dos veces = 0 altas. Sólo ALTAS: nunca edita ni borra lo que ya hay.
 * Todo por las clases `lib/db/*.db.ts`; nada de prisma ni SQL de escritura acá.
 * Antes de escribir deja el respaldo de lo que había (JSON en
 * `.claude/autonomo/respaldos/musa-agenda-plan-<fecha>-antes.json`).
 *
 * Uso (desde la raíz del repo):
 *   npx tsx -r ./scripts/musa/_preload.cjs -r dotenv/config \
 *     scripts/musa/cargar-agenda-plan-metas.ts dotenv_config_path=.env.local [--simulacro]
 */
import fs from "node:fs";
import path from "node:path";
import { AgendaDB } from "@/lib/db/agenda.db";
import { PlanEmpresaDB } from "@/lib/db/plan-empresa.db";
import { AdminGoalsDB } from "@/lib/db/admin-goals.db";
import { AdminTasksDB } from "@/lib/db/admin-tasks.db";
import { ActividadCrearSchema } from "@/lib/agenda/schemas";
import { metaCrearSchema, tareaCrearSchema } from "@/lib/admin/metas-tareas";
import { fodaSchema, estrategiasSchema } from "@/lib/planificacion/secciones";

const TENANT = "cmv1v4b8e0002rlvz6ibrullo";
const ACTOR = "script:musa-agenda-plan";
const SIMULACRO = process.argv.includes("--simulacro");

const resumen = { agenda: 0, plan: 0, metas: 0, tareas: 0, omitidas: 0 };
const avisos: string[] = [];
const errores: string[] = [];

/** `revalidateTag` de las clases sólo falla fuera de Next, y después de escribir. */
async function tolerandoNext<T>(f: () => Promise<T>): Promise<T | undefined> {
  try {
    return await f();
  } catch (e) {
    if (/static generation store missing|incrementalCache missing/i.test(String(e))) return undefined;
    throw e;
  }
}
const minus = (s: string) => s.trim().toLocaleLowerCase("es");

// ─────────────────────────────────────────────────────────────────────────────
// 1. AGENDA (manual §23 «Agenda del negocio», §12 calendario, §28 plan con fechas)
//    Hora = elección mía (el manual sólo da 9:00-20:00 de atención).
//    Rol = "admin": Musa sólo tiene el usuario drucila; titular y respaldo van en la nota.
// ─────────────────────────────────────────────────────────────────────────────
type Act = {
  nombre: string;
  frecuencia: "una_vez" | "diaria" | "semanal" | "quincenal" | "mensual" | "cada_n_dias";
  desde: string;
  diasSemana?: number[];
  diaMes?: number;
  cadaN?: number;
  hora: string;
  color: "info" | "success" | "warning" | "error" | "neutral";
  nota: string;
};
const unaVez = (desde: string, nombre: string, nota: string, color: Act["color"] = "warning", hora = "09:00"): Act => ({
  nombre, frecuencia: "una_vez", desde, hora, color, nota,
});

const ACTIVIDADES: Act[] = [
  // ── §23 Agenda fija ──
  {
    nombre: "Cada día: responder, cobrar, entregar y anotar kardex",
    frecuencia: "diaria", desde: "2026-11-09", diasSemana: [1, 2, 3, 4, 5, 6], hora: "18:00", color: "info",
    nota: "Manual v5 §23. Titular: Drucila (1 a 2 h). Responder, confirmar y cobrar · empacar y entregar · anotar ventas y kardex · pasar el costo al sobre de Recompra. Atención lunes a sábado de 9:00 a 20:00.",
  },
  {
    nombre: "Lunes: semáforo, caja, productos A, anuncios y recompra",
    frecuencia: "semanal", desde: "2026-10-26", diasSemana: [1], hora: "09:00", color: "success",
    nota: "Manual v5 §23. Titular: Brandon (30 min). Semáforo y caja · contar los productos A · revisar anuncios · pedir lo que llegó al punto de recompra.",
  },
  {
    nombre: "Reunión de socios: números, acta corta y decisiones pendientes",
    frecuencia: "quincenal", desde: "2026-10-25", diasSemana: [0], hora: "18:00", color: "warning",
    nota: "Manual v5 §23. Ambos socios (45 min), cada 2 semanas. Domingos desde el 25 oct: caen el 22 nov (condición de la compra de Navidad) y el 6 dic (cierre del mes 1). Día elegido por el sistema; el manual no lo fija.",
  },
  {
    nombre: "Fin de mes: estado de resultados, inventario, proveedores y plan",
    frecuencia: "mensual", desde: "2026-11-01", diaMes: 31, hora: "18:00", color: "warning",
    nota: "Manual v5 §23. Ambos (1 a 2 h), cada mes. Estado de resultados · inventario completo · puntaje de proveedores · plan del mes siguiente. Se corre el último día del mes.",
  },
  {
    nombre: "Cada campaña: nuevo catálogo con precios y ofertas, revisar manual",
    frecuencia: "cada_n_dias", desde: "2026-12-14", cadaN: 61, hora: "09:00", color: "warning",
    nota: "Manual v5 §23. Ambos (1 día), cada campaña de 2 meses. La Campaña 01 termina el 31 dic y el 14 dic es el primer aviso (2 semanas antes). Nuevo catálogo con precios, ofertas y fechas · revisar el manual.",
  },
  {
    nombre: "Sábado: salón y diagnóstico gratis",
    frecuencia: "semanal", desde: "2026-11-14", diasSemana: [6], hora: "10:00", color: "info",
    nota: "Manual v5 §23. Titular: Drucila, en Constitución (3 a 4 h por semana). Salón aliado y diagnóstico gratis de los sábados.",
  },
  {
    nombre: "Seguimiento de clientas: día 3, 15 y 30",
    frecuencia: "diaria", desde: "2026-11-09", diasSemana: [1, 2, 3, 4, 5, 6], hora: "10:00", color: "info",
    nota: "Manual v5 §9 y §18. Titular: Drucila. Día 3: ¿cómo te fue? · Día 15: resultados · Día 30: recompra. Actividad manual: el sistema no la marca solo (a quién toca hoy lo ve en Clientas).",
  },
  // ── §12 Calendario comercial y §28 Plan con fechas (una vez) ──
  unaVez("2026-11-09", "Lanzamiento público de Musa", "Manual v5 §28. Anuncios de ≈ S/ 10 al día y diagnóstico gratis los sábados.", "success"),
  unaVez("2026-11-16", "Empieza la preventa de Navidad (se separa con S/ 20)", "Manual v5 §12. «Separa tu kit de Navidad con S/ 20»: así se sabe cuántos kits pedir antes de gastar. Semana 16–22 nov: también 2 revendedoras piloto."),
  unaVez("2026-11-22", "Contar ventas: condición de la compra de Navidad", "Manual v5 §12. Se compra extra solo si al 22 nov se vendieron 25 productos o hay 10 kits separados en preventa. Si no, se empujan los kits con el stock que hay."),
  unaVez("2026-11-23", "Compra de Navidad (solo si se cumplió la condición)", "Manual v5 §12 y §28. 55 unidades, S/ 1.220 sin flete. Se paga con el sobre de Recompra + ganancia de noviembre + hasta S/ 200 de la reserva; nunca con plata personal. Titular: Brandon."),
  unaVez("2026-11-25", "Black Friday: publicar post y estado", "Manual v5 §12. El Black Friday es el 27 nov: solo kits, 1 día."),
  unaVez("2026-11-27", "Black Friday: solo kits, 1 día", "Manual v5 §12 y §28.", "error"),
  unaVez("2026-12-01", "Campaña de Navidad completa (1 al 24 dic)", "Manual v5 §12. Kits en caja, mascarillas, vale de regalo."),
  unaVez("2026-12-18", "Último día de envíos a provincia por Navidad", "Manual v5 §12 y §28. Después del 18 dic no se asegura la llegada.", "error"),
  unaVez("2026-12-24", "Última entrega local de Navidad", "Manual v5 §28. Semana 21–27 dic: entregas locales hasta el 24 y mensajes del día 3.", "error"),
  unaVez("2026-12-28", "Inventario completo, estado de resultados y campaña de verano", "Manual v5 §28. Titular: Brandon. Campaña de verano con protectores; más stock de protectores desde diciembre."),
  unaVez("2026-12-31", "Año nuevo: rutina «año nuevo, piel nueva» y cierre de la Campaña 01", "Manual v5 §2 y §12. Kit rutina facial. Es la fecha de revisión del catálogo (Campaña 02)."),
  unaVez("2027-01-10", "Reunión trimestral: ¿pasamos a la etapa 2?", "Manual v5 §28. Mes 3: revisar stock propio 50/50 y las condiciones para pasar a «Crecer en la provincia» (ganancia ≥ 35 % tres meses, ≥ 20 % de clientas que vuelven, 0 vencidos).", "error"),
  unaVez("2027-02-14", "San Valentín: kit regalo y contorno de ojos", "Manual v5 §12. Mensajes a parejas: «regálale algo que sí usará»."),
  unaVez("2027-03-08", "Día de la Mujer: sorteo o descuento en rutina facial", "Manual v5 §12. Alianza con el salón."),
  unaVez("2027-04-01", "Stock y preventa para el Día de la Madre", "Manual v5 §12. La campaña más grande del año (9 may): stock desde abril, revendedoras activas, preventa."),
  unaVez("2027-05-09", "Día de la Madre: kits regalo", "Manual v5 §12.", "error"),
  unaVez("2027-06-01", "Aniversario del distrito: confirmar fecha y mesa en la feria", "Manual v5 §12. La fecha exacta está por confirmar. Muestras y diagnóstico gratis."),
  unaVez("2027-07-28", "Fiestas Patrias: cabello, peinados de fiesta, argán", "Manual v5 §12. Alianza con el salón."),
];

function aEntrada(a: Act) {
  return {
    nombre: a.nombre,
    regla: "manual" as const,
    objetivo: null,
    recurrencia: {
      frecuencia: a.frecuencia,
      desde: a.desde,
      hasta: null,
      diasSemana: a.diasSemana ?? [],
      diaMes: a.diaMes ?? null,
      cadaN: a.cadaN ?? null,
    },
    hora: a.hora,
    canales: ["campana" as const],
    responsableRol: "admin" as const,
    parametros: {},
    color: a.color,
    nota: a.nota,
    activo: true,
  };
}

async function agenda(respaldo: Record<string, unknown>) {
  const vivas = await AgendaDB.listarActividades(TENANT, "admin");
  respaldo.agenda = vivas;
  const nombres = new Set(vivas.map((v) => minus(v.nombre)));
  for (const a of ACTIVIDADES) {
    if (nombres.has(minus(a.nombre))) { resumen.omitidas++; continue; }
    const p = ActividadCrearSchema.safeParse(aEntrada(a));
    if (!p.success) { errores.push(`agenda «${a.nombre}»: ${p.error.issues[0]?.message}`); continue; }
    if (!SIMULACRO) {
      const r = await tolerandoNext(() => AgendaDB.crearActividad(TENANT, p.data, ACTOR));
      if (r && !r.ok) { errores.push(`agenda «${a.nombre}»: ${JSON.stringify(r)}`); continue; }
    }
    resumen.agenda++;
    console.log(`  [agenda] + ${a.frecuencia.padEnd(11)} ${a.desde} ${a.hora}  ${a.nombre}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PLANIFICACIÓN: FODA y estrategias (sacados de §1, §5, §9, §12, §22, §27)
// ─────────────────────────────────────────────────────────────────────────────
const I = (id: string, texto: string, impacto: "alto" | "medio" | "bajo") => ({ id, texto, impacto });
const FODA = {
  fortalezas: [
    I("f-asesoria", "Asesoría de verdad (Drucila): primero pregunta, después recomienda; seguimiento a los 3, 15 y 30 días.", "alto"),
    I("f-stock", "Stock propio en almacén propio: entrega rápida y control de la calidad (decidido el 08/10).", "alto"),
    I("f-nso", "Productos profesionales originales, con NSO y vencimiento largo exigido al comprar.", "alto"),
    I("f-precio", "Precio único en todos los canales y nunca más caro que en las tiendas del Perú: confianza y cero peleas.", "medio"),
    I("f-salon", "Salón aliado en Constitución (exhibidor y diagnóstico gratis los sábados).", "medio"),
    I("f-socios", "Dos socios 50/50 con roles repartidos: Drucila atiende y entrega; Brandon compra, controla números, web y anuncios.", "medio"),
  ],
  oportunidades: [
    I("o-publico", "≈ 3.200 mujeres de 15 a 54 años en el distrito de Constitución y ≈ 49.000 mujeres en la provincia de Oxapampa (INEI 2021).", "alto"),
    I("o-zona", "Nadie ofrece belleza profesional con asesoría en la zona; se recompra seguido.", "alto"),
    I("o-reventa", "Red de revendedoras: forma más barata de llegar a otros pueblos sin abrir tiendas (así crecieron las marcas de catálogo del Perú).", "alto"),
    I("o-fechas", "Fechas comerciales fuertes: Navidad, Black Friday, San Valentín, Día de la Madre (la campaña más grande del año).", "alto"),
    I("o-digital", "WhatsApp Business, redes y web permiten vender sin local grande y medir cada anuncio.", "medio"),
  ],
  debilidades: [
    I("d-capital", "Capital chico (S/ 5.000) y reserva de solo S/ 400: una mala compra deja sin caja.", "alto"),
    I("d-presencia", "Todo lo presencial depende de Drucila cuando Brandon está fuera de Constitución; todo depende de una persona para atender.", "alto"),
    I("d-proveedores", "Proveedores de rostro y cabello todavía sin elegir; NSO y vencimientos por confirmar antes de comprar.", "alto"),
    I("d-marca", "Negocio nuevo: sin historial de ventas ni marca conocida; marca por buscar en INDECOPI.", "medio"),
    I("d-pendientes", "Decisiones pendientes (RUC, ofertas, horario, cajas...) que atrasan el lanzamiento del 9 de noviembre.", "medio"),
  ],
  amenazas: [
    I("a-falsos", "Productos falsos, sin NSO o con poco vencimiento; calor y humedad que malogran el stock.", "alto"),
    I("a-techo", "Pueblo chico: las ventas se estancan cerca de S/ 6.000 a 8.000 al mes si no se sale del distrito.", "alto"),
    I("a-bajas", "Temporada baja en enero y febrero, después de Navidad.", "medio"),
    I("a-musa", "Que otro ya tenga registrada «Musa» en INDECOPI (plan B con el nombre completo).", "medio"),
    I("a-estafas", "Pedidos no recogidos y Yape falso; reacciones en la piel de una clienta.", "medio"),
    I("a-rus", "Pasar de S/ 8.000 de ventas en un mes: hay que cambiar de régimen (Nuevo RUS).", "bajo"),
  ],
};

const E = (id: string, tipo: "FO" | "FA" | "DO" | "DA", texto: string, usa: string[]) => ({
  id, tipo, texto, usa, estado: "idea" as const, objetivoId: "",
});
const ESTRATEGIAS = [
  E("e-revendedoras", "FO", "Reclutar revendedoras en la provincia con el precio único y la asesoría: 2 piloto en noviembre y 8 activas al mes 6.", ["f-precio", "f-asesoria", "o-publico", "o-reventa"]),
  E("e-kits-fechas", "FO", "Armar kits en caja y recomendar la rutina completa en las fechas fuertes (Navidad, San Valentín, Día de la Madre) para subir el ticket a S/ 100 o más.", ["f-asesoria", "f-stock", "o-fechas"]),
  E("e-diagnostico", "FO", "Diagnóstico gratis los sábados en el salón aliado para captar clientas que hoy nadie atiende con asesoría.", ["f-salon", "f-asesoria", "o-zona"]),
  E("e-nso", "FA", "Comprar solo con NSO y 12 meses de vencimiento, con la matriz de proveedores; lo que vence primero, sale primero; almacén fresco con medidor.", ["f-nso", "f-stock", "a-falsos"]),
  E("e-verano", "FA", "Campaña de verano con protectores y recompras con seguimiento para sostener enero y febrero.", ["f-asesoria", "a-bajas"]),
  E("e-pagos", "FA", "Cobro adelantado fuera de Constitución, Yape verificado en la app y prueba en el antebrazo para no tener estafas ni reacciones.", ["f-precio", "a-estafas"]),
  E("e-preventa", "DO", "Preventa de Navidad (se separa con S/ 20) y compra extra solo si se cumple la condición del 22 de noviembre: saber qué pedir antes de gastar.", ["d-capital", "o-fechas"]),
  E("e-referidas", "DO", "«Trae a una amiga» (S/ 10 y S/ 10) y fotos reales de clientas con permiso para ganar confianza siendo una marca nueva.", ["d-marca", "o-digital", "o-publico"]),
  E("e-techo", "DA", "Salir del distrito antes de topar el techo: revendedoras en Oxapampa y envíos a la Selva Central; contador listo si un mes pasa S/ 8.000.", ["d-presencia", "a-techo", "a-rus"]),
  E("e-caja", "DA", "Regla del sobre: el costo de cada venta se separa para recomprar; cero retiros los meses 1 a 3 y reserva mínima de S/ 400.", ["d-capital", "a-bajas"]),
  E("e-respaldo", "DA", "Respuestas rápidas guardadas, Brandon de respaldo en WhatsApp y motorizado por entrega desde 5 entregas por semana.", ["d-presencia"]),
  E("e-indecopi", "DA", "Búsqueda gratis de «Musa» en INDECOPI antes de imprimir cajas y catálogos; registro en el mes 2 a 3 con ganancia.", ["d-marca", "a-musa"]),
];

async function plan(respaldo: Record<string, unknown>) {
  const leidas = await PlanEmpresaDB.leer(TENANT, ["foda", "estrategias"]);
  respaldo.plan = leidas;
  const f = fodaSchema.safeParse(FODA);
  const e = estrategiasSchema.safeParse({ items: ESTRATEGIAS });
  if (!f.success) errores.push(`foda: ${f.error.issues[0]?.path.join(".")}: ${f.error.issues[0]?.message}`);
  if (!e.success) errores.push(`estrategias: ${e.error.issues[0]?.path.join(".")}: ${e.error.issues[0]?.message}`);
  const ids = new Set(Object.values(FODA).flat().map((x) => x.id));
  for (const s of ESTRATEGIAS) for (const u of s.usa) if (!ids.has(u)) errores.push(`estrategia ${s.id} usa «${u}» que no existe`);
  if (!f.success || !e.success) return;

  const cuenta = (d: Record<string, unknown[]>) => Object.values(d).reduce((n, x) => n + x.length, 0);
  const foda = leidas.foda;
  const est = leidas.estrategias;
  if (!foda || !est) {
    errores.push("plan: no se pudieron leer FODA y estrategias");
    return;
  }
  if (cuenta(foda.datos as unknown as Record<string, unknown[]>) > 0) {
    resumen.omitidas++;
    avisos.push(`FODA: ya tenía contenido (v${foda.version}); no se tocó`);
  } else {
    if (!SIMULACRO) {
      const r = await tolerandoNext(() => PlanEmpresaDB.guardar(TENANT, "foda", f.data, foda.version, ACTOR));
      if (r && !r.ok) { errores.push("foda: cambio en paralelo"); return; }
    }
    resumen.plan++;
    console.log(`  [plan] + foda (${cuenta(f.data as unknown as Record<string, unknown[]>)} puntos)`);
  }
  if (est.datos.items.length > 0) {
    resumen.omitidas++;
    avisos.push(`Estrategias: ya tenía ${est.datos.items.length} (v${est.version}); no se tocó`);
  } else {
    if (!SIMULACRO) {
      const r = await tolerandoNext(() => PlanEmpresaDB.guardar(TENANT, "estrategias", e.data, est.version, ACTOR));
      if (r && !r.ok) { errores.push("estrategias: cambio en paralelo"); return; }
    }
    resumen.plan++;
    console.log(`  [plan] + estrategias (${e.data.items.length})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. METAS (§9 palancas, §7 proyección, §21 semáforo, §11 revendedoras, §28 etapas)
//    Las que el sistema mide solo (ventas, ticket, retención, pedidos) llevan avance 0
//    (lo calcula el sistema); el resto es «manual» y se anota a mano.
// ─────────────────────────────────────────────────────────────────────────────
type Meta = {
  name: string;
  category: "ventas" | "ticket_promedio" | "pedidos" | "retencion" | "manual";
  period: "diario" | "semanal" | "mensual" | "trimestral" | "anual";
  target: number;
  unit?: string;
  dueDate: string;
};
const METAS: Meta[] = [
  { name: "Ticket promedio de S/ 100 o más", category: "ticket_promedio", period: "mensual", target: 100, dueDate: "2027-01-10" },
  { name: "Clientas que vuelven: 25 % o más", category: "retencion", period: "mensual", target: 25, dueDate: "2027-01-10" },
  { name: "Ganancia neta de S/ 1.700 o más en el mes 3 (10 ene 2027)", category: "manual", period: "mensual", target: 1700, unit: "S/", dueDate: "2027-01-10" },
  { name: "8 revendedoras activas al mes 6", category: "manual", period: "mensual", target: 8, unit: "revendedoras", dueDate: "2027-04-30" },
  { name: "2 revendedoras piloto en noviembre", category: "manual", period: "mensual", target: 2, unit: "revendedoras", dueDate: "2026-11-30" },
  { name: "8 pedidos por semana en el mes 1", category: "pedidos", period: "semanal", target: 8, dueDate: "2026-12-06" },
  { name: "Vender S/ 3.000 al mes (etapa 1: arrancar)", category: "ventas", period: "mensual", target: 3000, dueDate: "2027-01-31" },
  { name: "Vender S/ 6.000 al mes (etapa 2: crecer en la provincia)", category: "ventas", period: "mensual", target: 6000, dueDate: "2027-04-30" },
  { name: "Vender S/ 10.000 al mes (etapa 3: expandir)", category: "ventas", period: "mensual", target: 10000, dueDate: "2027-10-31" },
  { name: "Ganancia neta de 35 % o más por producto (3 meses seguidos)", category: "manual", period: "mensual", target: 35, unit: "%", dueDate: "2027-01-31" },
];

async function metas(respaldo: Record<string, unknown>) {
  const vivas = await AdminGoalsDB.listar(TENANT);
  respaldo.metas = vivas;
  const nombres = new Set(vivas.map((m) => minus(m.name)));
  for (const m of METAS) {
    if (nombres.has(minus(m.name))) { resumen.omitidas++; continue; }
    const p = metaCrearSchema.safeParse({ ...m, current: 0 });
    if (!p.success) { errores.push(`meta «${m.name}»: ${p.error.issues[0]?.message}`); continue; }
    if (!SIMULACRO) await tolerandoNext(() => AdminGoalsDB.crear(TENANT, p.data, ACTOR));
    resumen.metas++;
    console.log(`  [meta] + ${m.category.padEnd(15)} ${m.target} ${m.unit ?? ""} al ${m.dueDate}  ${m.name}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DECISIONES PENDIENTES (§2) como Tareas con fecha límite y responsable
//    «Mes 1» (Entregas en el pueblo) = 30 nov 2026, elección mía.
// ─────────────────────────────────────────────────────────────────────────────
type Tarea = { tema: string; opciones: string; reco: string; porque: string; hasta: string; quien: string; prioridad: "media" | "alta" };
const D = (tema: string, opciones: string, reco: string, porque: string, hasta: string, quien: string): Tarea => ({
  tema, opciones, reco, porque, hasta, quien, prioridad: hasta <= "2026-10-19" ? "alta" : "media",
});
const AMBOS = "Brandon y Drucila";
const DECISIONES: Tarea[] = [
  D("RUC a nombre de", "Brandon o Drucila", "El socio que vive en Constitución y cuyo RUC personal pueda ir al Nuevo RUS.", "Boletas, cuenta y trámites en el mismo lugar.", "2026-10-16", `${AMBOS} y el contador`),
  D("Ofertas del catálogo", "Aprobar o quitar", "Aprobar 2 × mascarillas S/ 69, 2 × protector S/ 149 y regalo desde S/ 150.", "Dejan 38 % o más y suben el ticket.", "2026-10-16", AMBOS),
  D("Descuento de preventa", "15 %, 10 % o regalo", "10 % para las primeras 20 clientas.", "Con 15 % el shampoo baja de 30 % de ganancia.", "2026-10-16", AMBOS),
  D("Proveedor de rostro", "yepo, One Seúl, Grica, NewSeoul", "El de mayor puntaje en la matriz, con NSO.", "Precio y vencimiento deciden.", "2026-10-25", "Brandon"),
  D("Proveedor de cabello", "Salón aliado, Procab, otro", "Proveedor del salón para S/ 49 a 69; Procab en la etapa 2.", "Procab es caro para este rango.", "2026-10-25", "Brandon"),
  D("Medida de cajas", "1 o 2 medidas", "Solo 25 × 20 × 8 cm, 100 unidades.", "Una medida cuesta menos; lo suelto va en bolsa.", "2026-10-19", "Brandon"),
  D("Inventario y ventas", "Google Sheets o FLUJO_PRO", "Google Sheets ahora; FLUJO_PRO cuando esté probado.", "Construir sistema no puede atrasar el lanzamiento.", "2026-10-16", "Brandon"),
  D("Horario de atención", "Libre o fijo", "Lunes a sábado, 9:00 a 20:00.", "La clienta sabe cuándo le responden.", "2026-10-16", "Drucila"),
  D("Quién sale en videos", "Drucila, clientas, solo productos", "Drucila + clientas con permiso escrito.", "Una cara de confianza vende más.", "2026-10-16", AMBOS),
  D("Registro de marca", "Ya, mes 2 a 3, mes 4 a 6", "Búsqueda gratis ya; registro en el mes 2 a 3 con ganancia.", "Se imprimen cajas y catálogos con el nombre.", "2026-10-16", "Brandon"),
  D("Entregas en el pueblo", "Socios o motorizado", "Socios al inicio; motorizado por entrega desde 5 entregas por semana.", "Cuidar el tiempo de los socios.", "2026-11-30", "Drucila"),
];

async function tareas(respaldo: Record<string, unknown>) {
  const vivas = await AdminTasksDB.listar(TENANT);
  respaldo.tareas = vivas;
  const titulos = new Set(vivas.map((t) => minus(t.title)));
  for (const d of DECISIONES) {
    const title = `Decidir: ${d.tema}`;
    if (titulos.has(minus(title))) { resumen.omitidas++; continue; }
    const p = tareaCrearSchema.safeParse({
      title,
      description: `Opciones: ${d.opciones}.\nRecomendación del manual v5 (§2): ${d.reco}\nPor qué: ${d.porque}\nSe anota en la tabla de decisiones y en el acta de la reunión.`,
      priority: d.prioridad,
      assignedTo: d.quien,
      dueDate: d.hasta,
      module: "planificacion",
    });
    if (!p.success) { errores.push(`tarea «${title}»: ${p.error.issues[0]?.message}`); continue; }
    if (!SIMULACRO) await tolerandoNext(() => AdminTasksDB.crear(TENANT, p.data, ACTOR));
    resumen.tareas++;
    console.log(`  [tarea] + ${d.hasta} ${d.prioridad.padEnd(5)} ${d.quien.padEnd(24)} ${title}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${SIMULACRO ? "SIMULACRO (no escribe)" : "CARGA REAL"} · tenant ${TENANT} (musa)`);
  const respaldo: Record<string, unknown> = { tenant: TENANT, cuando: new Date().toISOString() };

  // Primero se LEE todo y se guarda el respaldo; recién después se escribe.
  const secciones = [agenda, plan, metas, tareas];
  if (!SIMULACRO) {
    const lectura = {
      agenda: await AgendaDB.listarActividades(TENANT, "admin"),
      plan: await PlanEmpresaDB.leer(TENANT, ["foda", "estrategias"]),
      metas: await AdminGoalsDB.listar(TENANT),
      tareas: await AdminTasksDB.listar(TENANT),
    };
    const dir = path.resolve(process.cwd(), ".claude/autonomo/respaldos");
    fs.mkdirSync(dir, { recursive: true });
    const sello = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const archivo = path.join(dir, `musa-agenda-plan-${sello}-antes.json`);
    fs.writeFileSync(archivo, JSON.stringify({ tenant: TENANT, cuando: new Date().toISOString(), ...lectura }, null, 2));
    console.log(`Respaldo de lo que había: ${archivo}`);
  }
  for (const s of secciones) await s(respaldo);

  console.log(
    `\n── ${SIMULACRO ? "haría" : "hizo"}: ${resumen.agenda} actividades · ${resumen.plan} secciones de plan · ${resumen.metas} metas · ${resumen.tareas} tareas · ${resumen.omitidas} ya estaban ──`,
  );
  for (const a of avisos) console.log(`  · ${a}`);
  if (errores.length) {
    console.log("\n── ERRORES ──");
    for (const e of errores) console.log(`  ✗ ${e}`);
  }
  await new Promise((r) => setTimeout(r, 4000)); // auditoría fire-and-forget
  process.exit(errores.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
