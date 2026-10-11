"use client";

/**
 * Una fila arriba de las promociones: «Próxima fecha: Navidad · jueves 25/12 ·
 * en 15 días», con ⓘ (qué stockear y consejos) y «Armar promo», que abre las
 * Plantillas de temporada.
 *
 * Venía de Sugerencias IA › Estrategias (TabEstrategias, fusionada el 10-10):
 * aquella tenía las fechas de 2026 escritas a mano y colores fijos. Ahora las
 * fechas salen del servidor (`/api/ai-assistant/business-calendar`, calculadas
 * por año, a 30 días) y acá sólo quedan los consejos por fecha. San Juan no
 * está en ese calendario: se suma aquí para no perder sus consejos. Sin fecha
 * en 30 días (o si la carga falla), no se dibuja: es un recordatorio, no un dato.
 */

import { useEffect, useState } from "react";
import { CalendarDays, Sparkles } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";

interface FechaComercial {
  nombre: string;
  /** YYYY-MM-DD */
  fecha: string;
  tipo: string;
  diasHasta: number;
  impactoNegocio: string;
}

/**
 * Qué stockear y cómo vender, por fecha (antes en TabEstrategias). La clave se busca en el nombre.
 * Son ideas generales, sin cifras: no salen de tus ventas (las de TabEstrategias eran inventadas).
 */
const CONSEJOS: ReadonlyArray<{ clave: RegExp; stock: string[]; tips: string[] }> = [
  {
    clave: /madre/i,
    stock: ["Sublime", "Donofrio", "Inca Kola 2L", "Rosas (si vendes flores)"],
    tips: [
      "Chocolates a la vista desde la semana anterior",
      "Bebidas para reuniones familiares (gaseosa 2L o más)",
      "Kits «Detalle para mamá»: chocolate + galleta + flor",
    ],
  },
  {
    clave: /padre/i,
    stock: ["Pilsen", "Cusqueña", "Maní", "Canchita", "Salchichas"],
    tips: ["Cerveza fría a la mano desde el sábado anterior", "Chicharrón y embutidos para la parrilla familiar", "Combo cerveza + canchita en oferta"],
  },
  {
    clave: /san juan/i,
    stock: ["Hojas de bijao", "Arroz Costeño 5 kg", "Aceitunas", "Huevos", "Cerveza"],
    tips: ["Hojas de bijao para el juane: pedidos 3 días antes", "Arroz, gallina y huevos: ten más de lo de siempre", "Cerveza y chicha morada para la celebración"],
  },
  {
    clave: /fiestas patrias/i,
    stock: ["Cusqueña", "Pilsen", "Pisco", "Pan", "Carbón"],
    tips: ["Refuerza la cerveza desde 3 días antes", "Combos parrilla (carne + pan + bebida)", "Pisco y bebidas para chilcanos en oferta"],
  },
  {
    clave: /navid/i,
    stock: ["Panetón", "Chocolate Donofrio", "Sidra", "Champagne"],
    tips: [
      "Panetón a la vista desde la 1.ª semana de diciembre",
      "Chocolate + leche para la chocolatada",
      "Combo cena navideña: panetón + chocolate + sidra",
    ],
  },
  {
    clave: /año nuevo/i,
    stock: ["Sidra", "Champagne", "Uvas", "Lentejas"],
    tips: ["Refuerza champagne y sidra para el 30 y 31", "Uvas para los 12 deseos", "Lentejas para la abundancia"],
  },
];

const DIA_MS = 86_400_000;
const VENTANA_DIAS = 30;

function diasEntre(desde: string, hasta: string): number {
  const [a, b] = [desde, hasta].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / DIA_MS);
}

/** San Juan (24/06) no está en el calendario del servidor: se calcula por año, igual que el resto. */
function sanJuan(hoy: string): FechaComercial | null {
  const anio = Number(hoy.slice(0, 4));
  for (const y of [anio, anio + 1]) {
    const fecha = `${y}-06-24`;
    const dias = diasEntre(hoy, fecha);
    if (dias > 0 && dias <= VENTANA_DIAS) {
      return { nombre: "San Juan", fecha, tipo: "local", diasHasta: dias, impactoNegocio: "Fiesta grande en Pucallpa: juane, cerveza y reuniones familiares" };
    }
  }
  return null;
}

function aFecha(x: unknown): FechaComercial | null {
  if (typeof x !== "object" || x === null) return null;
  const e = x as Record<string, unknown>;
  if (typeof e.nombre !== "string" || typeof e.fecha !== "string" || typeof e.diasHasta !== "number") return null;
  return {
    nombre: e.nombre,
    fecha: e.fecha,
    tipo: typeof e.tipo === "string" ? e.tipo : "",
    diasHasta: e.diasHasta,
    impactoNegocio: typeof e.impactoNegocio === "string" ? e.impactoNegocio : "",
  };
}

/**
 * La primera fecha que pide una promo: las quincenas y fines de mes son de todos los meses, no cuentan.
 * `diasHasta` se recuenta contra el día de Lima: el servidor lo cuenta con SU hora (UTC en Vercel) y
 * de noche en Perú se adelanta un día («en 2 días» cuando faltan 3).
 */
export function proximaFecha(eventos: FechaComercial[], hoy: string): FechaComercial | null {
  const candidatas = eventos
    .map((e) => ({ ...e, diasHasta: diasEntre(hoy, e.fecha) }))
    .filter((e) => e.tipo !== "quincena" && e.diasHasta > 0 && e.diasHasta <= VENTANA_DIAS);
  const extra = sanJuan(hoy);
  if (extra) candidatas.push(extra);
  candidatas.sort((a, b) => a.diasHasta - b.diasHasta);
  return candidatas[0] ?? null;
}

function cuandoFalta(dias: number): string {
  return dias === 1 ? "mañana" : `en ${dias} días`;
}

export default function ProximaFechaComercial({ onArmarPromo }: { onArmarPromo: () => void }) {
  const [fecha, setFecha] = useState<FechaComercial | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/ai-assistant/business-calendar", { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const crudos = typeof json === "object" && json !== null ? (json as { eventos?: unknown }).eventos : null;
        const eventos = (Array.isArray(crudos) ? crudos : []).map(aFecha).filter((e): e is FechaComercial => e !== null);
        if (!ctrl.signal.aborted) setFecha(proximaFecha(eventos, limaDateKey()));
      } catch (err) {
        if (ctrl.signal.aborted) return;
        // Un recordatorio que no carga no se dibuja; queda el rastro para soporte.
        logger.warn("[promociones] próxima fecha comercial falló", { error: String(err) });
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (!fecha) return null;
  const consejo = CONSEJOS.find((c) => c.clave.test(fecha.nombre));

  return (
    <div data-proxima-fecha className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-2 pl-3 pr-2 sm:pl-4">
      <CalendarDays className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <p className="min-w-0 text-sm text-[var(--text-secondary)] sm:text-base">
          Próxima fecha: <strong className="font-bold text-[var(--text-primary)]">{fecha.nombre}</strong>
          <span className="whitespace-nowrap"> · {diaConNombre(fecha.fecha)}</span>
          <span className="whitespace-nowrap"> · {cuandoFalta(fecha.diasHasta)}</span>
        </p>
        <InfoTip
          title={fecha.nombre}
          ariaLabel={`Qué preparar para ${fecha.nombre}`}
          ancho="w-80"
          side="bottom"
          body={
            <>
              {fecha.impactoNegocio && <span className="block">{fecha.impactoNegocio}.</span>}
              {consejo && (
                <>
                  <span className="mt-1 block"><strong>Qué stockear</strong> (idea general, no sale de tus ventas): {consejo.stock.join(", ")}.</span>
                  <span className="mt-1 block"><strong>Cómo venderlo:</strong> {consejo.tips.join(" · ")}.</span>
                </>
              )}
            </>
          }
        />
      </div>
      <button type="button" className={button({ variant: "secondary", className: "shrink-0" })} onClick={onArmarPromo}>
        <Sparkles className="h-4 w-4" aria-hidden /> Armar oferta
      </button>
    </div>
  );
}
