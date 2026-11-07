/**
 * explicar.ts — cómo se lee cada sugerencia (auditoría Compras C26 y C28,
 * noche 17-10). Puro: arma textos con los números que YA mandó el servidor
 * (`detalle`); no recalcula nada, así la explicación no puede contradecir a
 * la cantidad.
 */
import { diaCorto } from "@/lib/compras/ciclo-oc";
import { CAUSA_CONFIG, CAUSA_ORDER, URGENCY_CONFIG, URGENCY_ORDER, type AgruparPor, type Causa, type ConfigUrgencia, type Sugerencia } from "./tipos";

const LIMA_MS = 5 * 3600 * 1000;
const UNIDAD_SUELTA = new Set(["", "unidad", "unidades", "und", "u", "un"]);

/** «2», «0,5», «1,33»: hasta dos decimales, con coma. */
export function cifra(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

/** «unidades», «unidad», «pt»: la palabra que acompaña a la cantidad. */
export function unidadDe(n: number, unit?: string): string {
  const u = (unit ?? "").trim();
  if (UNIDAD_SUELTA.has(u.toLowerCase())) return n === 1 ? "unidad" : "unidades";
  return u;
}

/** «14 unidades», «1 unidad», «14 pt». */
export function cantidadConUnidad(n: number, unit?: string): string {
  return `${cifra(n)} ${unidadDe(n, unit)}`;
}

/** «viernes 17/10, 22:40» (hora de Lima) de un ISO. */
export function fechaDelCalculo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  // Un instante, no una fecha sin hora: el día es siempre el de Lima.
  const lima = new Date(t - LIMA_MS);
  const clave = lima.toISOString().slice(0, 10);
  const hh = String(lima.getUTCHours()).padStart(2, "0");
  const mm = String(lima.getUTCMinutes()).padStart(2, "0");
  return `${diaCorto(clave)}, ${hh}:${mm}`;
}

/** «llega jueves 23/10» de un YYYY-MM-DD. */
export function llegaEl(clave: string | null | undefined): string | null {
  return clave ? `llega ${diaCorto(clave)}` : null;
}

const ORIGEN_PLAZO: Record<Sugerencia["leadTimeOrigen"], string> = {
  declarado: "lo que declaraste en su ficha",
  historial: "el promedio de sus entregas",
  default: "estimado: el proveedor no tiene plazo cargado",
};

export type PasoCuenta = { rotulo: string; texto: string; aviso?: boolean };

/**
 * Los pasos de la cuenta, en el orden en que se decide (C28). Con ellos se
 * reconstruye «Pedir N» sin abrir el código.
 */
export function pasosDeLaCuenta(s: Sugerencia, ventanaDias: number): PasoCuenta[] {
  const d = s.detalle;
  if (!d) return [];
  const u = s.unit;
  const pasos: PasoCuenta[] = [
    {
      rotulo: "Venta",
      texto: `${cantidadConUnidad(d.vendido, u)} en ${cifra(d.diasConStock)} días con stock (de ${ventanaDias}) → ${cifra(d.ventaDiaria)} por día`,
    },
  ];
  if (d.pocosDatos) {
    pasos.push({
      rotulo: "Ojo",
      texto: "Pocas ventas o pocos días con stock: la venta por día es un estimado. Revisa la cantidad antes de pedir.",
      aviso: true,
    });
  }
  pasos.push(
    {
      rotulo: "Plazo",
      texto: `El proveedor tarda ${d.leadTimeDias} días (${ORIGEN_PLAZO[s.leadTimeOrigen]}) + ${d.colchonDias} de colchón = ${d.diasCobertura} días a cubrir`,
    },
    {
      rotulo: "Pedir cuando",
      texto: d.minimoManda
        ? `${cifra(d.ventaDiaria)} × ${d.diasCobertura} = ${cifra(d.porRitmo)}, pero tu mínimo es ${cifra(d.stockMin)}: manda el mínimo → baja de ${cifra(d.puntoReorden)}`
        : `${cifra(d.ventaDiaria)} × ${d.diasCobertura} = ${cifra(d.puntoReorden)}${d.stockMin > 0 ? ` (tu mínimo, ${cifra(d.stockMin)}, queda debajo)` : ""}`,
    },
    {
      rotulo: "Tienes",
      texto: d.enTransito > 0
        ? `${cifra(d.stock)} en stock + ${cifra(d.enTransito)} en camino = ${cifra(d.disponible)}: menos que ${cifra(d.puntoReorden)}`
        : `${cifra(d.stock)} en stock, nada en camino: menos que ${cifra(d.puntoReorden)}`,
    },
    {
      rotulo: "Cuánto",
      texto: d.objetivo > d.porRitmo * 2
        ? `Llegar a tu mínimo, ${cifra(d.objetivo)} − ${cifra(d.disponible)} que tienes = ${cantidadConUnidad(d.cantidad, u)}`
        : `Dos vueltas de reposición (${cifra(d.porRitmo)} × 2 = ${cifra(d.objetivo)}) − ${cifra(d.disponible)} que tienes = ${cantidadConUnidad(d.cantidad, u)}`,
    },
  );
  return pasos;
}

/** Criterio corto para la tarjeta: con qué se decidió (C26). */
export function criterioCorto(s: Sugerencia, ventanaDias: number): string {
  return s.criterio === "minimo" ? "Por tu mínimo" : `Por ventas de ${ventanaDias} días`;
}

export type GrupoSugerencias = {
  clave: string;
  titulo: string;
  bajada: string;
  config: ConfigUrgencia;
  items: Sugerencia[];
};

/**
 * Los grupos de la lista: por urgencia (cuándo) o por causa (por qué). Una
 * sugerencia sin causa (respuesta vieja) cae en «Por lo que se vende».
 */
export function agruparSugerencias(visible: readonly Sugerencia[], por: AgruparPor): GrupoSugerencias[] {
  if (por === "causa") {
    return CAUSA_ORDER.map((causa: Causa) => {
      const c = CAUSA_CONFIG[causa];
      return {
        clave: causa,
        titulo: c.titulo,
        bajada: c.bajada,
        config: URGENCY_CONFIG[c.tono],
        items: visible.filter((s) => (s.causa ?? "ritmo") === causa),
      };
    }).filter((g) => g.items.length > 0);
  }
  return URGENCY_ORDER.map((u) => {
    const config = URGENCY_CONFIG[u];
    return {
      clave: u,
      titulo: config.short,
      bajada: config.label.split("—")[1]?.trim() ?? config.hint,
      config,
      items: visible.filter((s) => s.urgency === u),
    };
  }).filter((g) => g.items.length > 0);
}

/**
 * La nota con que nace la orden (C26: la recomendación conserva su criterio y
 * fecha). Antes decía «OC generada automaticamente por sugerencias de compra».
 */
export function notaDeLaOrden(items: readonly Sugerencia[], calculadoEn: string | null, ventanaDias: number): string {
  const cuando = fechaDelCalculo(calculadoEn);
  const cabeza = `Desde Sugerencias de compra${cuando ? ` del ${cuando}` : ""} (ventas de ${ventanaDias} días).`;
  const lineas = items.map((s) => {
    const causa = s.causa ? CAUSA_CONFIG[s.causa].titulo.toLowerCase() : null;
    return `${s.productName}: ${s.criterio === "minimo" ? "por tu mínimo" : `vende ${cifra(s.dailyAvg)}/día`}${causa ? `, ${causa}` : ""}`;
  });
  return `${cabeza} ${lineas.join("; ")}`.slice(0, 1000);
}
