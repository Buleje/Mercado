/**
 * Resumen del día del patio — PURO (sin Prisma, sin fetch, sin reloj propio).
 *
 * Se arma sólo con lo que las cámaras ya guardaron: las capturas del KV con la
 * lectura de la IA y, cuando existen, sus cruces y la lectura de la pila. Todos
 * esos campos son opcionales (las capturas viejas no los traen), así que acá
 * nada se da por hecho.
 *
 * ## «Gente por hora» no es un conteo continuo
 *
 * La cámara dispara por evento (movimiento, persona, vehículo): no hay una foto
 * cada minuto. Por eso el número de cada hora es **el máximo de personas visto
 * en UNA sola foto** de esa hora, junto con cuántas fotos hubo. «4» a las 10 h
 * dice «en la foto con más gente de las 10 había 4», no «hubo 4 personas
 * trabajando las 10». Si esa hora no tuvo fotos, no aparece: no se inventa un 0.
 *
 * Día y horas en America/Lima, igual que el resto del módulo.
 */

import { ACTIVIDADES, type ActividadPatio, type Camara, type Captura } from "./camaras";

const ZONA = "America/Lima";

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** «YYYY-MM-DD» del instante, en Lima. */
export function fechaDeLima(d: Date | string): string {
  const fecha = typeof d === "string" ? new Date(d) : d;
  return fmtDia.format(fecha);
}

/** «HH:MM» (24 h) del instante, en Lima. */
export function horaDeLima(d: Date | string): string {
  const fecha = typeof d === "string" ? new Date(d) : d;
  return fmtHora.format(fecha);
}

export interface CamaraDelDia {
  camaraId: string;
  nombre: string;
  lugar: string;
  fotos: number;
  /** «HH:MM» de la primera y la última foto del día; `null` si no mandó. */
  primera: string | null;
  ultima: string | null;
}

export interface CamionDelDia {
  /** «HH:MM» de la primera foto donde se leyó esa placa. */
  hora: string;
  placa: string;
  /** Con qué guía/flete/vehículo del negocio coincidió, o `null`. */
  etiquetaCruce: string | null;
  /** Una persona confirmó el cruce (si no, es sólo una propuesta de la IA). */
  confirmado: boolean;
}

/** Fotos por evento, NO un conteo continuo: `max` = más personas en UNA foto de esa hora. */
export interface PersonasPorHora {
  hora: number;
  max: number;
  fotos: number;
}

export interface ChalecoDelDia {
  numero: string;
  /** `null` = ese número no está asignado a nadie. */
  nombre: string | null;
  primeraVez: string;
  ultimaVez: string;
  /** Lo que dice la asistencia del día para esa persona; `null` = no marcó / no se sabe. */
  asistencia: string | null;
  /** Se lo vio en el patio y NO marcó asistencia (sólo si el chaleco está asignado). */
  sinMarcacion: boolean;
}

export interface PilaDelDia {
  hora: string;
  camara: string;
  cambio: "bajo" | "subio";
  /** Lo que el libro dice AL ARMAR el resumen (no lo que se sabía al sacar la foto). */
  despachoDelDia: boolean | null;
  produccionDelDia: boolean | null;
  avisada: boolean;
}

/**
 * Lo que se sabe AL ARMAR el resumen, no al sacar cada foto.
 *
 * En Blas la producción se anota días después y la asistencia tarde (8 de 14
 * marcas llegaron a las 20:17, después del resumen de las 19:00). Los cruces y
 * la lectura de pila guardados en la captura son una foto del momento: dicen
 * «no había despacho» cuando todavía nadie lo había anotado. Por eso las rutas
 * releen el libro y la asistencia y se los pasan acá como ENTRADA.
 */
export interface ContextoDelDia {
  /** Movimientos que el libro CTP tiene hoy para ese día. `null` = no se pudo leer. */
  libro: { despacho: boolean; produccion: boolean } | null;
  /**
   * Por número de chaleco: a quién está asignado y su asistencia de ESE día.
   * `null` en `nombre` = nadie lo tiene; `null` en `estado` = no marcó.
   */
  chalecos: Record<string, { nombre: string | null; estado: string | null }> | null;
}

/** Motivos con los que `lib/ai/camara-vision.ts` devuelve una lectura que NO leyó nada. */
const MOTIVOS_DE_FALLA = new Set(["sin_tenant", "sin_ia_configurada", "presupuesto_agotado", "no_se_pudo_leer"]);

/** ¿La IA realmente leyó esta foto? Una lectura vacía con motivo de falla es «sin leer». */
export function fueLeida(c: Captura): boolean {
  const l = c.lectura;
  if (!l) return false;
  return !(!l.descripcion && l.motivo && MOTIVOS_DE_FALLA.has(l.motivo));
}

export interface ResumenDelDia {
  fecha: string;
  fotos: number;
  porCamara: CamaraDelDia[];
  camiones: CamionDelDia[];
  personasPorHora: PersonasPorHora[];
  chalecos: ChalecoDelDia[];
  /** Fotos por actividad vista; no cuenta «ninguna» ni las fotos sin esa lectura. */
  actividades: Partial<Record<ActividadPatio, number>>;
  pila: PilaDelDia[];
  /** Fotos del día que la IA no leyó (sin lectura). */
  sinLectura: number;
}

const normPlaca = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normNumero = (n: unknown) => String(n ?? "").trim();

/** Personas de una foto: el número de la IA, o 1 si dijo que vio a alguien sin contar. */
function personasDe(c: Captura): number {
  const l = c.lectura;
  if (!l) return 0;
  if (typeof l.personas === "number" && Number.isFinite(l.personas) && l.personas > 0) return Math.floor(l.personas);
  return l.hayPersona ? 1 : 0;
}

export function resumenDelDia(
  capturas: readonly Captura[],
  camaras: readonly Pick<Camara, "id" | "nombre" | "lugar">[],
  fecha: string,
  contexto?: ContextoDelDia,
): ResumenDelDia {
  const delDia = capturas
    .filter((c) => {
      const t = Date.parse(c.at);
      return Number.isFinite(t) && fechaDeLima(new Date(t)) === fecha;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  /* Por cámara: también las que no mandaron nada, que es justo lo que importa. */
  const nombres = new Map(camaras.map((c) => [c.id, c]));
  const ids = [...new Set([...camaras.map((c) => c.id), ...delDia.map((c) => c.camaraId)])];
  const porCamara: CamaraDelDia[] = ids.map((id) => {
    const suyas = delDia.filter((c) => c.camaraId === id);
    const cam = nombres.get(id);
    return {
      camaraId: id,
      nombre: cam?.nombre ?? "Cámara quitada",
      lugar: cam?.lugar ?? "",
      fotos: suyas.length,
      primera: suyas.length ? horaDeLima(suyas[0].at) : null,
      ultima: suyas.length ? horaDeLima(suyas[suyas.length - 1].at) : null,
    };
  });

  /* Camiones: una entrada por placa distinta, con la mejor evidencia de cruce. */
  const camionesPorPlaca = new Map<string, CamionDelDia>();
  const leidas = delDia.filter(fueLeida);
  for (const c of leidas) {
    const placa = normPlaca(c.lectura?.placa);
    if (!placa) continue;
    const cruce = (c.cruces?.placas ?? []).find((p) => normPlaca(p.placa) === placa) ?? null;
    const confirmado = !!(cruce?.confirmadoPor || cruce?.confirmadoEn);
    const previo = camionesPorPlaca.get(placa);
    if (!previo) {
      camionesPorPlaca.set(placa, {
        hora: horaDeLima(c.at),
        placa,
        etiquetaCruce: cruce?.etiqueta ?? null,
        confirmado,
      });
    } else if (cruce && (!previo.etiquetaCruce || (confirmado && !previo.confirmado))) {
      previo.etiquetaCruce = cruce.etiqueta;
      previo.confirmado = confirmado || previo.confirmado;
    }
  }
  const camiones = [...camionesPorPlaca.values()];

  /* Gente por hora: máximo en una foto, sólo las horas con fotos. */
  const horas = new Map<number, PersonasPorHora>();
  for (const c of leidas) {
    const h = Number(horaDeLima(c.at).slice(0, 2));
    const fila = horas.get(h) ?? { hora: h, max: 0, fotos: 0 };
    fila.fotos += 1;
    fila.max = Math.max(fila.max, personasDe(c));
    horas.set(h, fila);
  }
  const personasPorHora = [...horas.values()].sort((a, b) => a.hora - b.hora);

  /* Chalecos: la unión de lo que leyó la IA y de lo que cruzó con el personal. */
  const chalecosMap = new Map<string, ChalecoDelDia>();
  for (const c of leidas) {
    const cruzados = new Map((c.cruces?.chalecos ?? []).map((x) => [normNumero(x.numero), x]));
    const numeros = new Set([...(c.lectura?.chalecos ?? []).map(normNumero), ...cruzados.keys()]);
    for (const numero of numeros) {
      if (!numero) continue;
      const hora = horaDeLima(c.at);
      const cruce = cruzados.get(numero);
      const previo = chalecosMap.get(numero);
      /* Con contexto manda lo de AHORA; sin él, la foto del momento. */
      const vivo = contexto?.chalecos ? (contexto.chalecos[numero] ?? { nombre: null, estado: null }) : null;
      const nombre = vivo ? vivo.nombre : (cruce?.nombre ?? previo?.nombre ?? null);
      const asistencia = vivo ? vivo.estado : (cruce?.asistencia?.estado ?? previo?.asistencia ?? null);
      const asignado = vivo
        ? vivo.nombre !== null
        : nombre !== null || (cruce?.colaboradorId ?? null) !== null;
      chalecosMap.set(numero, {
        numero,
        nombre,
        primeraVez: previo?.primeraVez ?? hora,
        ultimaVez: hora,
        asistencia,
        sinMarcacion: asignado && asistencia === null,
      });
    }
  }
  const chalecos = [...chalecosMap.values()].sort((a, b) =>
    a.numero.localeCompare(b.numero, "es", { numeric: true }),
  );

  const actividades: Partial<Record<ActividadPatio, number>> = {};
  for (const c of leidas) {
    const a = c.lectura?.actividad;
    if (a && a !== "ninguna" && (ACTIVIDADES as readonly string[]).includes(a)) {
      actividades[a] = (actividades[a] ?? 0) + 1;
    }
  }

  const pila: PilaDelDia[] = [];
  for (const c of delDia) {
    const p = c.pila;
    if (!p || (p.cambio !== "bajo" && p.cambio !== "subio")) continue;
    pila.push({
      hora: horaDeLima(c.at),
      camara: nombres.get(c.camaraId)?.nombre ?? "Cámara quitada",
      cambio: p.cambio,
      despachoDelDia: contexto?.libro ? contexto.libro.despacho : (p.despachoDelDia ?? null),
      produccionDelDia: contexto?.libro ? contexto.libro.produccion : (p.produccionDelDia ?? null),
      avisada: p.avisada === true,
    });
  }

  return {
    fecha,
    fotos: delDia.length,
    porCamara,
    camiones,
    personasPorHora,
    chalecos,
    actividades,
    pila,
    sinLectura: delDia.length - leidas.length,
  };
}

const TOPE = 900;

const ACTIVIDAD_TEXTO: Record<ActividadPatio, string> = {
  carga: "carga",
  descarga: "descarga",
  aserrio: "aserrío",
  apilado: "apilado",
  transito: "tránsito",
  ninguna: "ninguna",
};

/** «2026-10-01» → «01/10». */
const diaMes = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

/** El WhatsApp del día: corto (≤ 900 caracteres), tuteo peruano, texto plano. */
export function textoResumen(r: ResumenDelDia, nombreNegocio: string): string {
  const nombre = nombreNegocio.trim() || "Tu negocio";
  const cab = `📷 Patio de ${nombre} · ${diaMes(r.fecha)}`;

  if (r.fotos === 0) {
    const nombres = r.porCamara.map((c) => c.nombre).join(", ");
    return `${cab}\nLa cámara no mandó fotos hoy — revisa batería/datos${nombres ? ` (${nombres})` : ""}.`.slice(0, TOPE);
  }

  /* Cada bloque es una línea; si el total pasa el tope se sueltan de atrás
     hacia adelante (lo menos importante primero). */
  const bloques: string[] = [];
  bloques.push(`Hoy las cámaras mandaron ${r.fotos} foto${r.fotos === 1 ? "" : "s"}.`);

  /* Recordatorio de anotar, no una alarma: sólo si el libro dice que NO hay
     ni despacho ni producción ese día (con uno solo, la baja se explica). */
  const pilaBajo = r.pila.filter((p) => p.cambio === "bajo" && p.despachoDelDia === false && p.produccionDelDia === false);
  if (pilaBajo.length) {
    bloques.push(`La pila bajó a las ${pilaBajo[0].hora} y todavía no hay despacho ni producción anotados ese día.`);
  }

  if (r.camiones.length) {
    const lista = r.camiones.slice(0, 5).map((c) => `${c.placa} ${c.hora}${c.etiquetaCruce ? ` (${c.etiquetaCruce})` : ""}`);
    const mas = r.camiones.length > 5 ? ` y ${r.camiones.length - 5} más` : "";
    bloques.push(`Camiones: ${r.camiones.length} — ${lista.join(" · ")}${mas}.`);
  }

  if (r.personasPorHora.length) {
    const top = r.personasPorHora.reduce((a, b) => (b.max > a.max ? b : a));
    const horas = r.personasPorHora.map((p) => `${p.hora}h:${p.max}`).join(" ");
    bloques.push(
      `Gente (más personas en una foto, por hora; son fotos por evento, no un conteo seguido): ${horas}. Lo más: ${top.max} a las ${top.hora}h.`,
    );
  }

  if (r.chalecos.length) {
    const vistos = r.chalecos.slice(0, 6).map((c) => `#${c.numero}${c.nombre ? ` ${c.nombre}` : ""}`).join(", ");
    bloques.push(`Chalecos vistos: ${vistos}.`);
    const sinMarcar = r.chalecos.filter((c) => c.sinMarcacion);
    if (sinMarcar.length) {
      bloques.push(`Sin marcar asistencia: ${sinMarcar.map((c) => c.nombre ?? `#${c.numero}`).join(", ")}.`);
    }
  }

  const acts = Object.entries(r.actividades) as [ActividadPatio, number][];
  if (acts.length) bloques.push(`Actividad: ${acts.map(([a, n]) => `${ACTIVIDAD_TEXTO[a]} ${n}`).join(", ")}.`);

  if (r.sinLectura > 0) bloques.push(`${r.sinLectura} foto${r.sinLectura === 1 ? "" : "s"} sin leer por la IA.`);

  const callada = r.porCamara.filter((c) => c.fotos === 0);
  if (callada.length) bloques.push(`No mandó nada hoy: ${callada.map((c) => c.nombre).join(", ")}.`);

  const cierre = "Detalle en el panel, pestaña Cámaras.";
  const armar = (b: string[]) => [cab, ...b, cierre].join("\n");
  while (bloques.length > 1 && armar(bloques).length > TOPE) bloques.pop();
  const texto = armar(bloques);
  return texto.length > TOPE ? `${texto.slice(0, TOPE - 1)}…` : texto;
}
