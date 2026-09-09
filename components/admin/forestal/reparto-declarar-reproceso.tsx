"use client";

/**
 * «¿De qué corrida sale?» — el paso que faltaba para declarar un reproceso
 * **sin salir de la distribución** (ADR-404 → ADR-316).
 *
 * La sugerencia sabe qué conviene reprocesar y cuánto; lo único que no puede
 * saber es de qué asiento del Libro sale esa madera, porque trabaja con bloques
 * del cubicador (una GTF, un saldo, un paquete). Elegir la corrida por el
 * operario sería inventar de qué asiento salió la madera — justo lo que la
 * trazabilidad no perdona.
 *
 * Así que esto es una pregunta, no un atajo: lista las corridas con saldo cuyo
 * producto es el tipo de origen, y con la elegida abre el MISMO modal de
 * reproceso del Libro (`CtpReprocesoModal`), con el producto y el volumen ya
 * puestos. Lo que se registra es idéntico se entre por acá o por el Libro.
 */
import { ExternalLink, Loader2, RefreshCw } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { corridasDelTipo, type CorridaParaReproceso } from "@/hooks/use-corridas-para-reproceso";

const CHIP =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide";

export default function DeclararReprocesoPicker({
  desdeTipo,
  haciaTipo,
  m3,
  especie,
  etiqueta,
  corridas,
  cargando,
  disponible,
  onElegir,
  onIrAlLibro,
  onCerrar,
}: {
  desdeTipo: string;
  haciaTipo: string;
  m3: number;
  especie: string;
  etiqueta: string;
  corridas: readonly CorridaParaReproceso[];
  cargando: boolean;
  /** `false` = el Libro no contestó (apagado o sin permiso). */
  disponible: boolean;
  onElegir: (c: CorridaParaReproceso) => void;
  /** El camino de siempre: dejar el pase y abrir el Libro. */
  onIrAlLibro: () => void;
  onCerrar: () => void;
}) {
  const candidatas = corridasDelTipo(corridas, desdeTipo, especie);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      icon={RefreshCw}
      title="¿De qué corrida sale?"
      description={`${desdeTipo} → ${haciaTipo} · ${fmtM3(m3)} m³ · ${especie}`}
    >
      <div className="space-y-3 px-5 py-4">
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <span className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
            {desdeTipo}
          </span>
          <span aria-label="a">→</span>
          <span className={`${CHIP} bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`}>
            {haciaTipo}
          </span>
          <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(m3)} m³</span>
          {etiqueta && (
            <span className="ml-auto truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              del bloque {etiqueta}
            </span>
          )}
        </p>

        {cargando ? (
          <p className="flex items-center gap-2 py-4 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando corridas con saldo…
          </p>
        ) : candidatas.length > 0 ? (
          <>
            <p className="text-xs text-[var(--text-secondary)]">
              {candidatas.length} {candidatas.length === 1 ? "corrida declara" : "corridas declaran"}{" "}
              <b>{desdeTipo}</b> con saldo. El volumen que sale ya viene puesto — lo que elegís acá es
              de dónde <b>entra</b> la madera a la sierra.
            </p>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {candidatas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onElegir(c)}
                    className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-left transition hover:border-[var(--accent)]"
                  >
                    <span className="font-bold text-[var(--text-primary)]">N° {c.lineNo ?? "—"}</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      {fmtM3(c.disponible)} m³
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">disponible</span>
                    {c.especie && <span className="text-xs text-[var(--text-secondary)]">· {c.especie}</span>}
                    <span className="ml-auto truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {c.producto ?? "—"} · {String(c.fecha).slice(0, 10)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          /* Sin candidata no se inventa una: el reproceso se declara contra una
             corrida que existe y tiene saldo, o no se declara. */
          <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm leading-snug text-[var(--text-secondary)]">
            {disponible ? (
              <>
                Ninguna corrida con saldo declara <b>{desdeTipo}</b>
                {especie ? <> de <b>{especie}</b></> : null}. Si esa madera está en el Libro con otro
                producto, reprocesala desde su fila; si todavía no está declarada, primero hay que
                registrar su producción.
              </>
            ) : (
              <>
                No se pudo leer el Libro desde acá (puede estar deshabilitado para esta tienda o no
                tenés permiso). Se puede declarar igual desde el Libro de Operaciones.
              </>
            )}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onIrAlLibro}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] underline transition hover:text-[var(--text-primary)]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Prefiero hacerlo en el Libro
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
