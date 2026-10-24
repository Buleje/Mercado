/**
 * «Fotos de la carga» — la galería del camión y la madera, con el sello de
 * cada foto debajo (fecha y hora de Lima, quién, dónde; ADR-434). Las fotos se
 * guardan en TODAS las filas de la guía, así que se leen de la primera.
 * Cada miniatura abre la foto entera en otra pestaña (pasa por la ruta que
 * firma: exige sesión del mismo negocio).
 */

import { Camera, MapPin, Stamp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { srcDeFoto, type FotoCarga } from "@/lib/forestal/fotos-carga";
import { pieDeFoto, urlMapaDeFoto } from "@/lib/forestal/sello-foto";
import { BOTON_BLOQUE, BloqueFicha } from "./comun";

/** Cuántas miniaturas caben antes del «+N». */
const MAX_VISIBLES = 6;

export default function BloqueFotos({
  fotos,
  onFotos,
  ocupado,
  indice,
  className,
}: {
  fotos: FotoCarga[];
  /** Abre el detalle del asiento, donde se ven todas y se agregan (ADR-434). */
  onFotos?: () => void;
  ocupado: boolean;
  indice: number;
  className?: string;
}) {
  const visibles = fotos.slice(0, MAX_VISIBLES);
  const resto = fotos.length - visibles.length;
  return (
    <BloqueFicha
      titulo="Fotos de la carga"
      plegable
      icono={Camera}
      indice={indice}
      className={className}
      info={
        <InfoTip
          title="Fotos con sello"
          what="Cada foto lleva una franja con fecha y hora de Lima, quién la sacó, la guía y dónde estaba el teléfono."
          affects="Salen en el papel de la guía y sostienen la recepción ante una fiscalización."
        />
      }
      extra={<span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{fotos.length}</span>}
      pie={
        onFotos && fotos.length > 0 ? (
          <button type="button" onClick={onFotos} disabled={ocupado} className={BOTON_BLOQUE}>
            <Camera className="h-4 w-4" aria-hidden /> Ver o agregar fotos
          </button>
        ) : undefined
      }
    >
      {fotos.length === 0 ? (
        <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] px-4 py-6 text-center">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent)]/12 text-[var(--accent-ink)]">
            <Camera className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Todavía no hay fotos del camión ni de la madera</p>
          {onFotos && (
            <button type="button" onClick={onFotos} disabled={ocupado} className={BOTON_BLOQUE}>
              <Camera className="h-4 w-4" aria-hidden /> Sacar la primera
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 @min-[40rem]/ficha:grid-cols-3 @min-[72rem]/ficha:grid-cols-6">
          {visibles.map((f, i) => {
            const mapa = urlMapaDeFoto(f);
            const ultimo = i === visibles.length - 1 && resto > 0;
            return (
              <li key={f.url} className="min-w-0">
                <a
                  href={srcDeFoto(f)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]"
                  aria-label={`Abrir la foto ${i + 1} de la carga en otra pestaña`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- privada: pasa por /fotos/ver con sesión */}
                  <img
                    src={srcDeFoto(f)}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover object-bottom transition-transform duration-[var(--motion-base)] group-hover:scale-[1.03]"
                  />
                  {f.sellada && (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)]/90 px-1.5 py-0.5 text-xs font-bold text-[var(--accent-ink)]">
                      <Stamp className="h-3 w-3" aria-hidden /> sello
                    </span>
                  )}
                  {ultimo && (
                    <span className="absolute inset-0 grid place-items-center bg-[var(--surface-canvas)]/70 font-mono text-lg font-bold text-[var(--text-primary)]">
                      +{resto}
                    </span>
                  )}
                </a>
                {(f.tomadaEn || f.subidaEn || f.por) && (
                  <p className="mt-1 line-clamp-2 text-xs leading-snug text-[var(--text-secondary)]">{pieDeFoto(f)}</p>
                )}
                {mapa && (
                  <a
                    href={mapa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> Ver en el mapa
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </BloqueFicha>
  );
}
