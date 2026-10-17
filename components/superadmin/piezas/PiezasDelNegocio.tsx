"use client";

/**
 * «Piezas a medida» en la ficha de UN negocio (ADR-457/458): arriba su página
 * propia, abajo las piezas que se le pueden prender. Es la misma tabla de
 * «Qué tiene cada negocio» vista por una fila: mismo hook, mismo modal de
 * opciones, mismas reglas (`piezas-del-negocio.ts`).
 */
import { useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Ruler } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CeldaPieza } from "./CeldaPieza";
import { OpcionesPiezaModal } from "./OpcionesPiezaModal";
import { rotuloDeEnchufe } from "./etiquetas";
import { ofertaDelNegocio, type Oferta } from "./piezas-del-negocio";
import { claveDeCelda, useAlternarPieza } from "./use-alternar-pieza";
import { usePiezasSuperadmin } from "./use-piezas-superadmin";

interface Props {
  negocio: { id: string; name: string; slug: string; industry?: string | null };
}

const BOTON_SUAVE =
  "inline-flex h-10 items-center rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";
const ALERTA = "flex items-start gap-3 rounded-xl border-2 p-4 text-sm";

export function PiezasDelNegocio({ negocio }: Props) {
  const { catalogo, matriz, cargando, error, recargar, guardar, soltar: soltarFila } = usePiezasSuperadmin();
  const { pendientes, aviso, abierta, cerrar, alternar, soltar, abrirOpciones, guardarOpciones } = useAlternarPieza(guardar, soltarFila);
  /** La acción que espera un «sí»: prender una página libre (queda amarrada) o soltar la propia. */
  const [confirmando, setConfirmando] = useState<{ tipo: "prender" | "liberar"; o: Oferta } | null>(null);
  const oferta = ofertaDelNegocio(catalogo, matriz, negocio);
  const nombre = (o: Oferta) => `${o.pieza.nombre} en ${negocio.name}`;

  const fila = (o: Oferta) => (
    <CeldaPieza
      enLinea
      fila={o.fila}
      pendiente={pendientes.has(claveDeCelda(negocio.id, o.pieza.id, o.enchufe))}
      nombre={nombre(o)}
      onAlternar={() => void alternar(negocio, o)}
      onOpciones={() => abrirOpciones(negocio, o)}
    />
  );

  const lista = (items: Oferta[]) => (
    <ul className="divide-y divide-[var(--rule-soft)]">
      {items.map((o) => (
        <li key={`${o.pieza.id}:${o.enchufe}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 basis-60">
            <p className="flex items-center gap-1 text-base font-bold text-[var(--text-primary)]">
              {o.pieza.nombre}
              <InfoTip title={o.pieza.nombre} what={o.pieza.descripcion} />
            </p>
            <p className="text-sm text-[var(--text-secondary)]">{rotuloDeEnchufe(o.enchufe)}</p>
          </div>
          {fila(o)}
        </li>
      ))}
    </ul>
  );

  const pagina = oferta.pagina;
  const sinPiezas = !pagina && oferta.paginasLibres.length === 0 && oferta.delRubro.length === 0 && oferta.deOtroRubro.length === 0;

  return (
    <section data-seccion="piezas-del-negocio" aria-labelledby="piezas-del-negocio-titulo" className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <header className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3">
        <Ruler className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
        <h3 id="piezas-del-negocio-titulo" className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          Piezas a medida
        </h3>
        <InfoTip
          title="Piezas a medida"
          what="Código hecho para este negocio. Lo escribimos en archivos; aquí solo decides si está prendido y con qué opciones."
          affects="Se nota al instante en su tienda o su panel. Si una pieza falla, se ve la versión normal."
          example="Prendes la página propia de una maderera y su portada pública cambia; las de los demás negocios no se tocan."
        />
      </header>

      <div className="space-y-5 p-4">
        {(error || aviso) && (
          <div role="alert" className={`${ALERTA} border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]`}>
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="flex-1">{error ?? aviso}</div>
            {error && (
              <button type="button" onClick={() => void recargar()} className="font-bold underline">
                Reintentar
              </button>
            )}
          </div>
        )}

        {cargando ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Cargando las piezas…
          </div>
        ) : (
          <>
            <div className="rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4" data-bloque="pagina-propia">
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-[var(--text-primary)]">Página propia</p>
                <InfoTip
                  title="Página propia"
                  what="La portada pública de este negocio con su propio código, sin tocar la de los demás. Es exclusiva: un negocio, una página."
                  affects="Sólo /t/ de este negocio. Si falla, se ve la portada general."
                  example="La maderera quiere su portada con el catálogo de trozas: se crea su página, la prendes aquí y listo."
                />
              </div>
              {pagina ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="flex flex-wrap items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                      {pagina.pieza.nombre}
                      <InfoTip title={pagina.pieza.nombre} what={pagina.pieza.descripcion} />
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          pagina.fila?.prendida ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {pagina.fila?.prendida ? "Prendida" : "Apagada"}
                      </span>
                    </p>
                    {pagina.fila?.prendida && (
                      <a href={`/t/${encodeURIComponent(negocio.slug)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent-ink)] hover:underline">
                        Ver su página <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {fila(pagina)}
                    {pagina.fila && !pagina.fila.prendida && (
                      <button type="button" onClick={() => setConfirmando({ tipo: "liberar", o: pagina })} className={BOTON_SUAVE}>
                        Liberar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 text-base text-[var(--text-secondary)]">
                  No tiene página propia.
                  <InfoTip
                    title="Se crea a pedido"
                    what={<>Se crea en el código. Pídesela a Claude: «crea la página propia de {negocio.name}».</>}
                    affects="Cuando exista, aparece aquí para prenderla."
                  />
                </div>
              )}

              {!pagina && oferta.paginasLibres.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-bold text-[var(--text-primary)]">Páginas sin negocio: elige una</p>
                  <ul className="divide-y divide-[var(--rule-soft)]">
                    {oferta.paginasLibres.map((o) => (
                      <li key={o.pieza.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                        <div className="min-w-0 flex-1 basis-60">
                          <p className="flex items-center gap-1 text-base font-bold text-[var(--text-primary)]">
                            {o.pieza.nombre}
                            <InfoTip title={o.pieza.nombre} what={o.pieza.descripcion} />
                          </p>
                        </div>
                        <button type="button" onClick={() => setConfirmando({ tipo: "prender", o })} className={BOTON_SUAVE}>
                          Prender «{o.pieza.nombre}»
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {confirmando && (
                <div role="alertdialog" aria-label="Confirmar" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--surface-raised)] p-3">
                  <p className="min-w-0 flex-1 basis-60 text-sm font-medium text-[var(--text-primary)]">
                    {confirmando.tipo === "prender"
                      ? `¿Prender «${confirmando.o.pieza.nombre}» para ${negocio.name}? Quedará amarrada a este negocio.`
                      : `¿Liberar «${confirmando.o.pieza.nombre}»? Dejará de ser de ${negocio.name} y otro negocio podrá tomarla.`}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmando(null)} className={BOTON_SUAVE}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const c = confirmando;
                        setConfirmando(null);
                        void (c.tipo === "prender" ? alternar(negocio, c.o) : soltar(negocio, c.o));
                      }}
                      className="h-10 rounded-lg bg-[var(--accent-dark)] px-4 text-sm font-bold text-white hover:brightness-110"
                    >
                      {confirmando.tipo === "prender" ? "Sí, prender" : "Sí, liberar"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {oferta.delRubro.length > 0 && lista(oferta.delRubro)}

            {oferta.deOtroRubro.length > 0 && (
              <div className="space-y-2 rounded-xl border border-dashed border-[var(--rule-base)] p-3">
                <p className="flex items-center gap-1 text-sm font-bold text-[var(--text-secondary)]">
                  De otro rubro
                  <InfoTip title="De otro rubro" what="Piezas hechas para otro tipo de negocio. Se pueden prender igual." />
                </p>
                {lista(oferta.deOtroRubro)}
              </div>
            )}

            {sinPiezas && <p className="text-sm text-[var(--text-tertiary)]">Todavía no hay piezas en el código.</p>}

            {oferta.huerfanas.length > 0 && (
              <div role="status" className={`${ALERTA} border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]`}>
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p>
                  <span className="font-bold">Piezas que ya no existen en el código (no hacen nada): </span>
                  {oferta.huerfanas.map((f) => `${f.piezaId} · ${rotuloDeEnchufe(f.enchufe)}`).join(", ")}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <OpcionesPiezaModal abierta={abierta} onClose={cerrar} onGuardar={guardarOpciones} />
    </section>
  );
}
