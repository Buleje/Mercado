/**
 * La foto de la carga de su guía (ADR-434): la primera en grande —con el sello
 * abajo, por eso `object-bottom`— y las demás en miniatura. Cada una abre
 * entera en otra pestaña pasando por `/fotos/ver`, que pide sesión del mismo
 * negocio (la foto dice dónde estaba el teléfono y quién la sacó).
 *
 * Sin fotos no se dibuja nada: la tarjeta no pide sacar una desde acá.
 */

import { Camera, MapPin, Stamp } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { srcDeFoto, type FotoCarga } from "@/lib/forestal/fotos-carga";
import { pieDeFoto, urlMapaDeFoto } from "@/lib/forestal/sello-foto";

/** Miniaturas debajo de la grande antes del «+N». */
const MINIATURAS = 4;

const ENLACE_FOTO =
  "group relative block overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

export default function TarjetaFoto({ fotos }: { fotos: readonly FotoCarga[] }) {
  /* La grande es una CON sello si hay: lleva fecha, quién y dónde. */
  const [primera, ...resto] = [...fotos.filter((f) => f.sellada), ...fotos.filter((f) => !f.sellada)];
  if (!primera) return null;
  const visibles = resto.slice(0, MINIATURAS);
  const ocultas = resto.length - visibles.length;
  const mapa = urlMapaDeFoto(primera);

  return (
    <section aria-labelledby="tarjeta-foto" className="space-y-3 p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <Kicker as="h2" id="tarjeta-foto" className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Camera className="h-4 w-4" aria-hidden /> Foto de la carga
        </Kicker>
        <span className="shrink-0 text-sm text-[var(--text-secondary)]">
          {fotos.length} {fotos.length === 1 ? "foto" : "fotos"}
        </span>
      </div>

      <a
        href={srcDeFoto(primera)}
        target="_blank"
        rel="noopener noreferrer"
        className={ENLACE_FOTO}
        aria-label="Abrir la foto de la carga en otra pestaña"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- privada: pasa por /fotos/ver con sesión */}
        <img
          src={srcDeFoto(primera)}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full object-cover object-bottom transition-transform duration-[var(--motion-base)] group-hover:scale-[1.02]"
        />
        {primera.sellada && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)]/90 px-2 py-0.5 text-xs font-bold text-[var(--text-primary)]">
            <Stamp className="h-3.5 w-3.5" aria-hidden /> con sello
          </span>
        )}
      </a>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
        <span>{pieDeFoto(primera)}</span>
        {mapa && (
          <a
            href={mapa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline"
          >
            <MapPin className="h-4 w-4" aria-hidden /> Ver en el mapa
          </a>
        )}
      </div>

      {visibles.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {visibles.map((f, i) => {
            const ultima = i === visibles.length - 1 && ocultas > 0;
            return (
              <li key={f.url}>
                <a
                  href={srcDeFoto(f)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ENLACE_FOTO}
                  aria-label={`Abrir la foto ${i + 2} de la carga en otra pestaña`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- privada: pasa por /fotos/ver con sesión */}
                  <img src={srcDeFoto(f)} alt="" loading="lazy" className="aspect-square w-full object-cover object-bottom" />
                  {ultima && (
                    <span className="absolute inset-0 grid place-items-center bg-[var(--surface-canvas)]/75 font-mono text-lg font-bold text-[var(--text-primary)]">
                      +{ocultas}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
