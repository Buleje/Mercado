"use client";

/**
 * Lo que el propio stock tiene mal, en chips que ACOTAN la tabla (ADR-418).
 *
 * Medido en el libro real el 2026-09-15: 27 paquetes sin escuadría, 19 con 0
 * piezas declaradas, uno parado hace 331 días. Ninguno de los tres se veía
 * desde «Productos disponibles»: había que abrir fila por fila para
 * encontrarlos, así que nadie los encontraba.
 *
 * Los chips **filtran**, no sólo señalan (memoria `deuda-no-es-indicador`): un
 * cartel que anuncia «27 sin escuadría» y deja al operador buscándolas a mano
 * da trabajo en vez de quitarlo.
 */

import { BookmarkPlus, Clock, Layers, Ruler } from "@buleje/design-system/icons";
import { DIAS_VIEJO } from "@/lib/forestal/edad-del-patio";

/** Los cuatro avisos que la pestaña puede dar sobre su propio stock. */
export type ClaveAviso = "sin-escuadria" | "sin-piezas" | "viejos" | "apartados";

export type CuentaAvisos = Record<ClaveAviso, number>;

/**
 * Las clases de cada chip, escritas enteras.
 *
 * Tailwind lee el código fuente como texto: una clase armada con
 * `bg-[var(--data-${tono}-500)]` no existe para el compilador y el chip sale
 * sin color. Por eso van las seis variantes literales.
 */
const CHIP_TONO: Record<"error" | "warning" | "info", { activo: string; quieto: string }> = {
  error: {
    activo:
      "border-[var(--data-error-500)] bg-[var(--data-error-500)]/20 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    quieto:
      "border-transparent bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] hover:border-[var(--data-error-500)]/50 dark:text-[var(--data-error-500)]",
  },
  warning: {
    activo:
      "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/20 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    quieto:
      "border-transparent bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] hover:border-[var(--data-warning-500)]/50 dark:text-[var(--data-warning-500)]",
  },
  info: {
    activo:
      "border-[var(--data-info-500)] bg-[var(--data-info-500)]/20 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
    quieto:
      "border-transparent bg-[var(--data-info-500)]/10 text-[var(--data-info-700)] hover:border-[var(--data-info-500)]/50 dark:text-[var(--data-info-500)]",
  },
};

/** Qué dice cada chip y por qué importa. El orden es el de urgencia. */
const AVISOS: {
  clave: ClaveAviso;
  icono: typeof Clock;
  texto: (n: number) => string;
  titulo: string;
  tono: "error" | "warning" | "info";
}[] = [
  {
    clave: "viejos",
    icono: Clock,
    texto: (n) => `${n} parado${n === 1 ? "" : "s"} hace más de ${DIAS_VIEJO} días`,
    titulo: "La madera aserrada parada se mancha de hongo azul y pierde precio",
    tono: "error",
  },
  {
    clave: "sin-escuadria",
    icono: Ruler,
    texto: (n) => `${n} sin escuadría`,
    titulo: "Sin medidas la tabla no puede contestar «cuántas 2×6×8 tengo»",
    tono: "warning",
  },
  {
    clave: "sin-piezas",
    icono: Layers,
    texto: (n) => `${n} sin piezas declaradas`,
    titulo: "El cliente pide tablas, no m³: sin la cantidad no se le puede ofrecer",
    tono: "warning",
  },
  {
    clave: "apartados",
    icono: BookmarkPlus,
    texto: (n) => `${n} apartado${n === 1 ? "" : "s"}`,
    titulo: "Reservados para un cliente: siguen en el patio pero ya tienen dueño",
    tono: "info",
  },
];

export function AvisosDelStock({
  cuentas,
  activo,
  onElegir,
  /** Qué se está viendo con el aviso puesto, para que las cifras cierren. */
  detalle,
}: {
  cuentas: CuentaAvisos;
  activo: ClaveAviso | null;
  onElegir: (clave: ClaveAviso | null) => void;
  detalle?: string;
}) {
  const visibles = AVISOS.filter((a) => cuentas[a.clave] > 0);
  if (visibles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibles.map((a) => {
        const encendido = activo === a.clave;
        const Icono = a.icono;
        return (
          <button
            key={a.clave}
            type="button"
            aria-pressed={encendido}
            title={`${a.titulo}. ${encendido ? "Toca para ver todo de nuevo" : "Toca para ver sólo esas filas"}`}
            onClick={() => onElegir(encendido ? null : a.clave)}
            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[length:var(--ts-2xs)] font-bold transition-colors ${CHIP_TONO[a.tono][encendido ? "activo" : "quieto"]}`}
          >
            <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden /> {a.texto(cuentas[a.clave])}
          </button>
        );
      })}
      {activo && detalle && (
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{detalle}</span>
      )}
    </div>
  );
}
