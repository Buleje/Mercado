/**
 * lib/agents/domains/planificacion.agent.ts
 *
 * El plan de la empresa (ADR-497) desde el chat del panel: «¿cuál es mi política
 * de devoluciones?», «¿qué objetivos tengo atrasados?», «¿qué licencia vence?».
 *
 * Solo lectura: el plan se edita en Gestión › Planificación, donde queda la
 * versión y quién la cambió.
 *
 * Permisos en dos capas: el orchestrator pide `analytics:read` (lo básico del
 * panel) y acá cada sección pasa por `puedeVerSeccion(rol, sección)`, la misma
 * regla de las rutas de `/api/admin/planificacion`. Socios e inversión (DNI y
 * plata) NO se le pasan nunca al asistente, ni al dueño: el texto viaja a un
 * proveedor de IA de afuera. Se ven en su pestaña.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";
import { PlanEmpresaDB } from "@/lib/db/plan-empresa.db";
import { ROLES_LEER_PLAN, puedeVerSeccion } from "@/lib/admin/planificacion-acceso";
import { vacia, type DatosSeccion, type SeccionPlan } from "@/lib/planificacion/secciones";
import { avanceObjetivo, diasEntre, estadoLicencia, objetivoAtrasado } from "@/lib/planificacion/calculos";
import { limaDateKey } from "@/lib/utils";
import type { AdminRole } from "@/lib/session";

/** Lo que el chat puede preguntar, y qué secciones lee cada tema. */
export const TEMAS_PLAN = {
  politicas: ["politicas"],
  objetivos: ["objetivos"],
  licencias: ["licencias"],
  empresa: ["ficha", "identidad"],
  foda: ["foda", "estrategias"],
  organizacion: ["organizacion"],
} as const satisfies Record<string, readonly SeccionPlan[]>;
export type TemaPlan = keyof typeof TEMAS_PLAN;

/** Temas que existen en el plan pero no salen al asistente (plata y DNI de los socios). */
const TEMAS_SENSIBLES = new Set(["socios", "inversion", "inversión", "aportes"]);

/** Para que una respuesta larga no se coma el minuto de tokens (Groq: 8.000/min). */
const MAX_ITEMS = 25;
const corto = (t: string, max = 400) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function rolDelPlan(actorRole: string | undefined): AdminRole | null {
  return actorRole && (ROLES_LEER_PLAN as readonly string[]).includes(actorRole) ? (actorRole as AdminRole) : null;
}

/** Filtra por palabras sueltas (sin tildes). Sin coincidencias → todo, avisando. */
function filtrar<T>(items: readonly T[], buscar: string, textoDe: (x: T) => string): { items: T[]; aviso?: string } {
  const palabras = norm(buscar).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4);
  if (palabras.length === 0) return { items: [...items] };
  // «devoluciones» encuentra «devolución»: se compara por la raíz (primeras 6 letras).
  const raices = palabras.map((w) => w.slice(0, 6));
  const hits = items.filter((x) => {
    const t = norm(textoDe(x));
    return raices.some((r) => t.includes(r));
  });
  if (hits.length > 0) return { items: hits };
  return { items: [...items], aviso: `Nada del plan nombra «${buscar}»: van todas.` };
}

function politicas(d: DatosSeccion<"politicas">, buscar: string, hoy: string) {
  const f = filtrar(d.items, buscar, (p) => `${p.categoria} ${p.titulo} ${p.texto}`);
  const fq = filtrar(d.preguntas, buscar, (q) => `${q.pregunta} ${q.respuesta}`);
  return {
    politicas: f.items.slice(0, MAX_ITEMS).map((p) => ({
      categoria: p.categoria,
      titulo: p.titulo,
      texto: corto(p.texto),
      vigenteDesde: p.vigenteDesde || null,
      todaviaNoRige: Boolean(p.vigenteDesde && p.vigenteDesde > hoy),
      revisarEl: p.revisar || null,
      tocaRevisar: Boolean(p.revisar && p.revisar <= hoy),
    })),
    preguntasFrecuentes: (fq.aviso ? [] : fq.items).slice(0, MAX_ITEMS).map((q) => ({ pregunta: q.pregunta, respuesta: corto(q.respuesta) })),
    pasosDeAtencion: buscar ? undefined : d.protocolo.slice(0, MAX_ITEMS).map((p) => corto(`${p.paso}${p.detalle ? `: ${p.detalle}` : ""}`, 200)),
    total: d.items.length,
    aviso: f.aviso,
  };
}

function objetivos(d: DatosSeccion<"objetivos">, hoy: string) {
  const filas = d.items.map((o) => {
    const atrasado = objetivoAtrasado(o, hoy);
    return {
      titulo: o.titulo,
      area: o.area || null,
      responsable: o.responsable || null,
      estado: o.estado,
      avancePorcentaje: avanceObjetivo(o),
      fin: o.fin || null,
      atrasado,
      diasDeAtraso: atrasado ? -diasEntre(hoy, o.fin) : 0,
      meta: o.meta || null,
      accionesPendientes: o.acciones.filter((a) => !a.hecha).length,
    };
  });
  // Lo atrasado primero (el más atrasado arriba), después lo que está en curso.
  filas.sort((a, b) => b.diasDeAtraso - a.diasDeAtraso || Number(b.estado === "en-curso") - Number(a.estado === "en-curso"));
  return {
    resumen: {
      total: filas.length,
      atrasados: filas.filter((f) => f.atrasado).length,
      enCurso: filas.filter((f) => f.estado === "en-curso").length,
      hechos: filas.filter((f) => f.estado === "hecho").length,
    },
    objetivos: filas.slice(0, MAX_ITEMS),
  };
}

const URGENCIA = { vencida: 0, "por-vencer": 1, pendiente: 2, vigente: 3, "sin-vencimiento": 4 } as const;

function licencias(d: DatosSeccion<"licencias">, hoy: string) {
  const filas = d.items
    .map((l) => {
      const { estado, dias } = estadoLicencia(l, hoy);
      return { nombre: l.nombre, entidad: l.entidad || null, numero: l.numero || null, vence: l.vence || null, estado, diasParaVencer: dias };
    })
    .sort((a, b) => URGENCIA[a.estado] - URGENCIA[b.estado] || (a.diasParaVencer ?? 99_999) - (b.diasParaVencer ?? 99_999));
  return {
    resumen: {
      total: filas.length,
      vencidas: filas.filter((f) => f.estado === "vencida").length,
      porVencer30Dias: filas.filter((f) => f.estado === "por-vencer").length,
      sinTramitar: filas.filter((f) => f.estado === "pendiente").length,
    },
    licencias: filas.slice(0, MAX_ITEMS),
  };
}

function empresa(ficha: DatosSeccion<"ficha">, id: DatosSeccion<"identidad">) {
  return {
    razonSocial: ficha.razonSocial || null,
    nombreComercial: ficha.nombreComercial || null,
    tipoSociedad: ficha.tipoSociedad || null,
    regimenTributario: ficha.regimenTributario || null,
    rubro: ficha.rubro || null,
    tipoNegocio: ficha.tipoNegocio || null,
    horario: ficha.horario || null,
    fechaInicio: ficha.fechaInicio || null,
    mision: corto(id.mision) || null,
    vision: corto(id.vision) || null,
    valores: id.valores.map((v) => v.nombre),
    propuestaDeValor: corto(id.propuestaValor) || null,
    clienteIdeal: corto(id.clienteIdeal) || null,
    lema: id.lema || null,
  };
}

function foda(f: DatosSeccion<"foda">, e: DatosSeccion<"estrategias">) {
  const textos = (xs: { texto: string; impacto: string }[]) => xs.slice(0, 12).map((x) => `${corto(x.texto, 200)} (impacto ${x.impacto})`);
  return {
    fortalezas: textos(f.fortalezas),
    oportunidades: textos(f.oportunidades),
    debilidades: textos(f.debilidades),
    amenazas: textos(f.amenazas),
    estrategias: e.items.slice(0, MAX_ITEMS).map((x) => ({ tipo: x.tipo, texto: corto(x.texto, 250), estado: x.estado })),
  };
}

function organizacion(d: DatosSeccion<"organizacion">) {
  const area = new Map(d.areas.map((a) => [a.id, a.nombre]));
  const cargo = new Map(d.cargos.map((c) => [c.id, c.nombre]));
  return {
    areas: d.areas.map((a) => a.nombre),
    cargos: d.cargos.slice(0, 40).map((c) => ({
      cargo: c.nombre,
      area: area.get(c.areaId) ?? null,
      persona: c.persona || null,
      reportaA: cargo.get(c.reportaA) ?? null,
      funciones: c.funciones.slice(0, 5).map((x) => corto(x, 150)),
    })),
  };
}

async function consultar(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const temaCrudo = typeof task.payload.tema === "string" ? norm(task.payload.tema.trim()) : "";
  const buscar = typeof task.payload.buscar === "string" ? task.payload.buscar.trim().slice(0, 80) : "";

  if (TEMAS_SENSIBLES.has(temaCrudo)) {
    return {
      success: true,
      data: {
        mensaje:
          "Los socios y la inversión no se le pasan al asistente (tienen plata y documentos de identidad). Se ven en Gestión › Planificación › Socios e inversión, sólo para el dueño.",
      },
    };
  }
  if (!(temaCrudo in TEMAS_PLAN)) {
    return { success: false, error: `Tema del plan desconocido. Usa uno de: ${Object.keys(TEMAS_PLAN).join(", ")}.` };
  }
  const tema = temaCrudo as TemaPlan;

  const rol = rolDelPlan(ctx.actorRole);
  const secciones = TEMAS_PLAN[tema].filter((s) => rol !== null && puedeVerSeccion(rol, s));
  if (secciones.length < TEMAS_PLAN[tema].length) {
    log.warn("Plan: rol sin acceso a la sección", { tema, rol: ctx.actorRole });
    return { success: false, error: "Tu rol no puede ver esta parte del plan de la empresa." };
  }

  log.info("Leyendo el plan de la empresa", { tema });
  const leido = await PlanEmpresaDB.leer(task.tenantId, secciones);
  const datos = <S extends SeccionPlan>(s: S): DatosSeccion<S> => (leido[s]?.datos as DatosSeccion<S> | undefined) ?? vacia(s);
  const hoy = limaDateKey();
  const sinGuardar = secciones.every((s) => (leido[s]?.version ?? 0) === 0);

  const data =
    tema === "politicas" ? politicas(datos("politicas"), buscar, hoy)
    : tema === "objetivos" ? objetivos(datos("objetivos"), hoy)
    : tema === "licencias" ? licencias(datos("licencias"), hoy)
    : tema === "empresa" ? empresa(datos("ficha"), datos("identidad"))
    : tema === "foda" ? foda(datos("foda"), datos("estrategias"))
    : organizacion(datos("organizacion"));

  return {
    success: true,
    data: {
      tema,
      hoy,
      ...(sinGuardar && { mensaje: "Esta parte del plan todavía no está escrita: se llena en Gestión › Planificación." }),
      ...data,
    },
  };
}

export const planificacionAgent: DomainAgent = {
  domain: "planificacion",
  actions: ["consultar"],
  description:
    "El plan de la empresa: políticas y preguntas frecuentes, objetivos (avance y atrasos), licencias (vencimientos), ficha, misión, FODA y organización. Solo lectura.",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    if (task.action === "consultar") return consultar(task, ctx);
    return { success: false, error: `Acción desconocida del plan: ${task.action}` };
  },
};
