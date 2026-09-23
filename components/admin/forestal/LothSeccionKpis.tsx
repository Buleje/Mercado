"use client";

/**
 * LothSeccionKpis — la cabecera de la sección que se está mirando: su título,
 * qué se asienta ahí, y sus indicadores plegables.
 *
 * El título es un `SectionTitle` de verdad (h2): antes, entre el título del
 * libro y la tabla, todo era texto chico en mayúsculas al mismo peso, y nada
 * decía en qué sección estabas salvo el botón resaltado del riel.
 *
 * Los indicadores se pliegan y la preferencia se RECUERDA, una sola para las
 * seis secciones (Brandon, 2026-09-18). Una por sección haría saltar la tabla
 * ~120 px cada vez que se cambia de Tala a Trozado —la pantalla se movería
 * justo cuando la vista busca la misma fila— y obligaría a plegar seis veces
 * lo mismo: lo que se decide es cuánto lugar le toca a la tabla, y eso no
 * cambia de una sección a otra. Arranca plegada, como en el Libro CTP
 * (Brandon, 2026-09-03: «que los KPIs estén ocultos y que haya un botón para
 * mostrarlos»); plegada igual dice sus cifras en una línea, así el botón no
 * es una caja ciega.
 */

import { useId } from "react";
import { SectionTitle, StatCard } from "@buleje/design-system";
import {
  AlertCircle,
  BarChart3,
  Boxes,
  ChevronDown,
  FileText,
  ShieldAlert,
  ShieldCheck,
  TreePine,
  Truck,
} from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  PLAZO_REGISTRO_DIAS,
  estaFueraDePlazo,
  type LothEntryDTO,
  type LothSection,
} from "@/lib/forestal/loth-constants";
import { SECTION_META } from "./LothEntryForm";
import { formatNumber } from "@/lib/format";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_KPIS_SECCION = "loth:secciones:kpis-abiertos";

const fm = (n: number) =>
  formatNumber(n, 2);
const plural = (n: number, uno: string, varios: string) =>
  `${formatNumber(n)} ${n === 1 ? uno : varios}`;

export default function LothSeccionKpis({
  section,
  cur,
  totalLibro,
  lineas,
  delLibroEntero,
}: {
  section: LothSection;
  /** Lo que declara la API para la sección (sólo líneas vigentes). */
  cur?: { count: number; totalVolumeM3: number; totalQuantity: number };
  /** Líneas vigentes del libro entero, las seis secciones. */
  totalLibro: number;
  /** Las líneas de la sección que hay a mano. */
  lineas: LothEntryDTO[];
  /** `true` si `lineas` es la sección entera; `false` si es sólo la página. */
  delLibroEntero: boolean;
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_KPIS_SECCION, false);
  const panelId = useId();
  const meta = SECTION_META[section];

  const vigentes = lineas.filter((e) => e.status === "registrado");
  const tardias = vigentes.filter((e) => estaFueraDePlazo(e.entryDate, e.createdAt)).length;
  const cites = vigentes.filter((e) => e.cites).length;
  const guias = new Set(vigentes.map((e) => e.gtfNumber).filter((g): g is string => !!g)).size;
  const alcance = delLibroEntero ? "en la sección" : "en pantalla";

  const count = cur?.count ?? 0;
  const usaVolumen = section === "tala" || section === "trozado" || section === "consumo_troza";
  const usaCantidad = section === "producto_terminado" || section === "despacho_producto";
  /* En Despacho de trozas la segunda tarjeta repetía la primera («Líneas 2» y
     «Trozas despachadas 2»: cada línea ES una troza). Lo que sí suma es en
     cuántas guías salieron. */
  const segunda = usaVolumen
    ? {
        label: "Volumen registrado",
        value: `${fm(cur?.totalVolumeM3 ?? 0)} m³`,
        corto: `${fm(cur?.totalVolumeM3 ?? 0)} m³`,
        icon: TreePine,
      }
    : usaCantidad
      ? {
          label: "Cantidad registrada",
          value: fm(cur?.totalQuantity ?? 0),
          corto: `cantidad ${fm(cur?.totalQuantity ?? 0)}`,
          icon: FileText,
        }
      : {
          label: "Guías (GTF)",
          value: formatNumber(guias),
          corto: plural(guias, "guía", "guías"),
          icon: Truck,
        };

  return (
    <section aria-labelledby={`${panelId}-titulo`} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <SectionTitle id={`${panelId}-titulo`}>{meta.label}</SectionTitle>
          <span className="text-sm text-[var(--text-tertiary)]">{meta.help}</span>
        </div>
        {/* Plegados, las cifras siguen a la vista en una línea: las mismas
            cuentas que las tarjetas, nunca otras. */}
        {!abierto && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
            <span>{plural(count, "línea", "líneas")}</span>
            <span aria-hidden="true">·</span>
            <span>{segunda.corto}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                tardias > 0
                  ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                  : undefined
              }
            >
              {formatNumber(tardias)} fuera de plazo
            </span>
          </p>
        )}
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          aria-controls={`${panelId}-panel`}
          title={
            abierto
              ? "Oculta los indicadores. Se recuerda en este navegador para las seis secciones."
              : "Muestra los indicadores de la sección"
          }
          className={`ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
            abierto
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          }`}
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Indicadores
          <ChevronDown
            className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        id={`${panelId}-panel`}
        hidden={!abierto}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatCard
          density="compact"
          label={`Líneas · ${meta.short}`}
          value={formatNumber(count)}
          subValue={`${formatNumber(totalLibro)} en el libro`}
          icon={Boxes}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label={segunda.label}
          value={segunda.value}
          subValue={
            usaVolumen || usaCantidad
              ? meta.short
              : plural(count, "troza despachada", "trozas despachadas")
          }
          icon={segunda.icon}
          emphasis="success"
        />
        {/* Lo que mira primero una fiscalización: el registro tardío. El CITES
            va de subtítulo cuando lo hay, en vez de un tercio de fila en cero. */}
        <StatCard
          density="compact"
          label="Fuera de plazo"
          value={formatNumber(tardias)}
          subValue={
            tardias > 0
              ? `de ${formatNumber(vigentes.length)} ${alcance} · plazo ${PLAZO_REGISTRO_DIAS} días`
              : cites > 0
                ? `${plural(cites, "línea", "líneas")} con especie CITES`
                : "todo asentado en plazo"
          }
          icon={tardias > 0 ? AlertCircle : cites > 0 ? ShieldAlert : ShieldCheck}
          emphasis={tardias > 0 ? "warning" : cites > 0 ? "error" : "success"}
        />
      </div>
    </section>
  );
}
