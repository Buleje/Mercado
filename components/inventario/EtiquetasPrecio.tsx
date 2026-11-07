"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { CardTitle, ErrorAlert, LoadingState, SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Casilla } from "@/components/ui-system/Casilla";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import { logger } from "@/lib/logger";
import {
  FORMATOS_ETIQUETA_PRECIO,
  armarEtiqueta,
  infoFormatoPrecio,
  type EtiquetaPrecio,
  type FormatoEtiquetaPrecio,
} from "@/lib/etiquetas/precio";
import { EtiquetaPrecioVista, HojaMiniatura } from "./EtiquetaPrecioVista";
import { EtiquetasSelector } from "./EtiquetasSelector";
import { useEtiquetasPrecio } from "./use-etiquetas-precio";

const CORTO: Record<FormatoEtiquetaPrecio, string> = {
  "a4-3x8": "A4 · 24",
  "a4-3x10": "A4 · 30",
  "rollo-50x25": "Rollo",
};
/** px por mm de la vista previa: una etiqueta A4 sale de 266 px y la del rollo de 250. */
const ESCALA = (rollo: boolean) => (rollo ? 5 : 3.8);
const MUESTRAS_MAX = 3;
const AVISO = "text-xs text-[var(--data-warning-ink)]";

/**
 * Etiquetas de precio para la góndola: eliges productos (buscador, categoría,
 * «cambiaron de precio hoy»), cuántas de cada uno y el formato (A4 3×8, A4
 * 3×10 o rollo térmico 50×25), ves cómo salen y descargas el PDF.
 *
 * El precio impreso es el precio base del producto: el mismo que cobra la caja.
 * Vive fuera de `components/admin`: lo monta Productos e inventario.
 */
export default function EtiquetasPrecio({ conTitulo = true }: { conTitulo?: boolean }) {
  const s = useEtiquetasPrecio();
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const f = infoFormatoPrecio(s.formato);

  /** Las primeras etiquetas distintas de la tanda; sin nada elegido, un ejemplo. */
  const muestras = useMemo((): { etiquetas: EtiquetaPrecio[]; ejemplo: boolean } => {
    const vistas = new Set<number>();
    const distintas = s.tanda.filter((e) => !vistas.has(e.productoId) && vistas.add(e.productoId)).slice(0, MUESTRAS_MAX);
    if (distintas.length > 0 || !s.ahora) return { etiquetas: distintas, ejemplo: false };
    const primero = s.visibles[0];
    return { etiquetas: primero ? [armarEtiqueta(primero, s.cambios[primero.id], s.ahora)] : [], ejemplo: true };
  }, [s.tanda, s.visibles, s.cambios, s.ahora]);

  const descargar = async () => {
    if (descargando || s.tanda.length === 0) return;
    setDescargando(true);
    setErrorPdf(null);
    try {
      const { descargarEtiquetasPdf } = await import("@/lib/etiquetas/precio-pdf");
      await descargarEtiquetasPdf(s.tanda, s.formato, { guias: s.guias });
    } catch (err) {
      logger.error("[etiquetas-precio] PDF falló", { error: String(err) });
      setErrorPdf("No pudimos armar el PDF. Vuelve a intentar.");
    } finally {
      setDescargando(false);
    }
  };

  const total = s.tanda.length;
  const resumen = f.rollo
    ? `${total === 1 ? "etiqueta" : "etiquetas"} del rollo`
    : `${total === 1 ? "etiqueta" : "etiquetas"} · ${s.hojas} ${s.hojas === 1 ? "hoja" : "hojas"} A4`;

  return (
    <section className="flex flex-col gap-4">
      {conTitulo && (
        <div className="flex items-center gap-2">
          <SectionTitle>Etiquetas de precio</SectionTitle>
          <InfoTip
            title="Etiquetas de precio"
            what="Imprime los carteles de la góndola con el código de barras de cada producto. El precio es el mismo que cobra la caja."
            affects="El precio anterior tachado sale solo si el precio bajó en los últimos 30 días y quedó registrado."
            example="Cambias 5 precios en la mañana → «Cambiaron de precio hoy» → Descargar PDF → imprimes y cambias los carteles."
          />
        </div>
      )}

      {s.error ? (
        <ErrorAlert
          title="No cargaron tus productos"
          description={s.error}
          action={
            <button type="button" className={button({ variant: "secondary", size: "md" })} onClick={s.reintentar}>
              Volver a intentar
            </button>
          }
        />
      ) : s.cargando ? (
        <LoadingState message="Cargando tus productos…" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
          <div className="flex min-w-0 flex-col gap-3">
            <CardTitle>Elige los productos</CardTitle>
            <EtiquetasSelector s={s} />
          </div>

          <aside className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 lg:sticky lg:top-4 lg:self-start">
            <div className="flex flex-col gap-2">
              <CardTitle>Formato</CardTitle>
              <SegmentedControl
                label="Formato de las etiquetas"
                size="lg"
                value={s.formato}
                onChange={s.setFormato}
                options={FORMATOS_ETIQUETA_PRECIO.map((x) => ({ value: x.id, label: CORTO[x.id] }))}
              />
              <p className="text-xs text-[var(--text-secondary)]">
                {f.nombre} · {f.detalle}
              </p>
              {!f.rollo && (
                <Casilla etiqueta="Líneas de corte (papel común)" checked={s.guias} onChange={(ev) => s.setGuias(ev.target.checked)} />
              )}
            </div>

            <div className="flex items-center gap-3">
              <HojaMiniatura formato={s.formato} usadas={Math.min(total, f.columnas * f.filas)} />
              <p className="flex flex-col">
                <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{total}</span>
                <span className="text-sm text-[var(--text-secondary)]">{resumen}</span>
              </p>
            </div>

            {(s.avisos.recortadas > 0 || s.avisos.sinCodigo > 0 || s.avisos.muyLargo > 0 || s.avisos.conSku > 0) && (
              <ul className="flex flex-col gap-1">
                {s.avisos.recortadas > 0 && (
                  <li className={AVISO}>
                    Se imprimen {total.toLocaleString("es-PE")} de {s.avisos.pedidas.toLocaleString("es-PE")}: baja cantidades o imprime el resto en otra tanda.
                  </li>
                )}
                {s.avisos.sinCodigo > 0 && <li className={AVISO}>{s.avisos.sinCodigo} sin código de barras ni SKU: salen sin barras.</li>}
                {s.avisos.muyLargo > 0 && <li className={AVISO}>{s.avisos.muyLargo} con un código muy largo para este formato: mejor imprímelos en A4.</li>}
                {s.avisos.conSku > 0 && <li className={AVISO}>{s.avisos.conSku} llevan su SKU en barras: la caja todavía busca solo por código de barras.</li>}
              </ul>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                {muestras.ejemplo ? "Así sale (ejemplo)" : "Vista previa"}
              </p>
              <div className="flex flex-col items-center gap-2 overflow-x-auto">
                {muestras.etiquetas.map((e) => (
                  <EtiquetaPrecioVista key={e.productoId} etiqueta={e} formato={s.formato} escala={ESCALA(f.rollo)} />
                ))}
              </div>
            </div>

            {errorPdf && <p role="alert" className={AVISO}>{errorPdf}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button({ variant: "primary", size: "xl", className: "flex-1 rounded-xl" })}
                disabled={total === 0}
                aria-busy={descargando}
                onClick={descargar}
              >
                {descargando ? <Printer className="h-5 w-5" aria-hidden /> : <Download className="h-5 w-5" aria-hidden />}
                {descargando ? "Armando el PDF…" : "Descargar PDF"}
              </button>
              {s.elegidos.size > 0 && (
                <button type="button" className={button({ variant: "ghost", size: "xl", className: "rounded-xl" })} onClick={s.vaciar}>
                  Vaciar
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
