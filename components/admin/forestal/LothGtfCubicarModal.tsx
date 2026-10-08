"use client";

/**
 * «Cubicar en Oxapampina» — una GTF del Libro TH cubicada como compras y
 * vendes (K7 · ADR-483; Brandon 08-10: «en Smalian es según SERFOR, pero como
 * yo compro es en Oxapampina descontando huecos y demás, y vincular esa
 * cubicación a alguna cuenta de algún cliente o proveedor»).
 *
 * Arriba, la cifra SERFOR (dato de la guía) al lado de la neta que se paga.
 * La planilla trae las trozas de la guía con sus dos puntas en pulgadas y pies
 * (gris = de la guía, hasta que tipeas la cinta) y suma hueco, largo que no
 * sirve y castigo por troza; al pie, los descuentos del lote. «Guardar en la
 * cuenta» congela la cubicación a nombre de la persona (ADR-478) y abre
 * «Valorizar y descontar».
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ruler, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { formatCurrency } from "@/lib/currency";
import { ptSugeridoDeM3 } from "@/lib/forestal/cubicacion-comercial";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import { FORMULAS_TROZAS, UNIDADES_FORMULA } from "@/lib/forestal/cubicacion-trozas-formula";
import { Btn, ModalBody, ModalFooter, useCierreSeguro } from "./ctp-shared";
import type { Gtf } from "./gtf-tabla-columnas";
import GuardarEnLaCuentaModal from "./cubicador-trozas-guardar";
import ValorizarCubicacionModal from "./cubicador-trozas-valorizar";
import { CabeceraCubicar, FilaCubicarGuia, PieDescuentos } from "./loth-gtf-cubicar-fila";
import { ESTADO_CUB } from "./hooks/use-cubicaciones-trozas";
import { fmtNum, paraGuardar, usePlanillaGuia, usePrefillLoth } from "./hooks/use-cubicar-guia-loth";

/** Enter como Excel (a la celda siguiente); ↑ ↓ en la misma columna. */
function moverFoco(e: React.KeyboardEvent<HTMLInputElement>, caja: HTMLElement | null) {
  if (e.ctrlKey || e.metaKey || e.altKey || !caja || !["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
  const el = e.currentTarget;
  const celdas = [...caja.querySelectorAll<HTMLInputElement>("input[data-celda]")];
  const lista = e.key === "Enter" ? celdas : celdas.filter((c) => c.dataset.celda === el.dataset.celda);
  const paso = e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1;
  e.preventDefault();
  const destino = lista[lista.indexOf(el) + paso];
  destino?.focus();
  destino?.select();
  destino?.scrollIntoView({ block: "nearest" });
}

const CIFRA = "rounded-2xl border px-3 py-2";
const ROTULO = "block text-xs font-semibold text-[var(--text-secondary)]";

export default function LothGtfCubicarModal({
  g, onClose,
}: {
  g: Pick<Gtf, "id" | "gtfNumber" | "titularName" | "items">;
  onClose: () => void;
}) {
  const { prefill, error: errorCarga, recargar } = usePrefillLoth(g.id);
  const p = usePlanillaGuia(prefill, g.items);
  const rol = useMiRol();
  const puedeAplicar = rol === "admin" || rol === "owner" || rol === "superadmin";
  const [guardando, setGuardando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const onTecla = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => moverFoco(e, cajaRef.current), []);
  /* Lo guardado no se pierde al cerrar: sólo pregunta si cambió algo después de «Guardar». */
  const [foto, setFoto] = useState<string | null>(null);
  const cerrar = useCierreSeguro(p.tocadas > 0 && JSON.stringify(p.planilla) !== foto, onClose);

  const u = UNIDADES_FORMULA[p.formula];
  const c = p.calculo;
  const declarado = prefill?.smalianDeclaradoM3 ?? null;
  const existentes = (prefill?.existentes ?? []).filter((e) => e.estado !== "anulada");
  const pagada = existentes.find((e) => e.estado === "aplicada") ?? null;
  const previa = existentes.find((e) => e.estado === "borrador") ?? pagada;
  const total = p.planilla?.filas.length ?? 0;
  const sinMedida = c ? c.filas.filter((f) => f.falta).length : 0;
  const listo = !!c && c.completas > 0 && c.conError === 0 && !c.errorLote;

  /* Derivado, nunca dato: lo declarado (m³ Smalian) pasado a PT con el factor de la plaza. */
  const comparacion = useMemo(() => {
    if (!c || declarado == null || declarado <= 0 || c.neto <= 0) return null;
    const base = p.formula === "oxapampina" ? ptSugeridoDeM3(declarado) : declarado;
    return { base, menos: (1 - c.neto / base) * 100 };
  }, [c, declarado, p.formula]);

  const guardar = useMemo(
    () => (guardando && p.planilla && c ? paraGuardar(p.planilla, c, p.formula) : null),
    [guardando, p.planilla, c, p.formula],
  );

  return (
    <AdminModal
      open
      onClose={() => void cerrar()}
      variant="info"
      className="sm:max-w-[66rem]"
      icon={Ruler}
      title="Cubicar en Oxapampina"
      description={`GTF ${g.gtfNumber}${g.titularName ? ` · ${g.titularName}` : ""}`}
      claveVentana="loth-gtf-cubicar"
      footer={
        <ModalFooter
          error={c?.errorLote ?? null}
          nota={
            c && (
              <span aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className="font-mono text-lg font-bold text-[var(--text-primary)]">{fmtVolumen(c.neto, p.formula)}</span>
                <span>{c.completas} de {total} trozas</span>
                {c.bruto > c.neto && <span>· bruto {fmtVolumen(c.bruto, p.formula)}</span>}
                {sinMedida > 0 && <span className="font-semibold text-[var(--data-warning-ink)]">· {sinMedida} sin medida: no van</span>}
                {c.conError > 0 && <span className="font-semibold text-[var(--data-error-ink)]">· {c.conError} con error</span>}
              </span>
            )
          }
        >
          <Btn variant="secondary" onClick={() => void cerrar()}>Cerrar</Btn>
          <Btn variant="primary" disabled={!listo} onClick={() => setGuardando(true)} data-accion="guardar-en-la-cuenta">
            <Save className="h-4 w-4" /> Guardar en la cuenta
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {errorCarga ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--data-error-500)] p-3 text-sm font-semibold text-[var(--data-error-ink)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {errorCarga}
            <Btn size="sm" onClick={recargar}>Reintentar</Btn>
          </div>
        ) : !prefill || !p.planilla || !c ? (
          <div className="space-y-2" aria-busy="true" aria-label="Cargando las trozas de la guía">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />)}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className={`${CIFRA} border-[var(--rule-base)] bg-[var(--surface-sunken)]`} data-cifra="serfor">
                <span className={ROTULO}>SERFOR (Smalian) · lo que declara la guía</span>
                <span className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">
                  {declarado != null ? fmtVolumen(declarado, "smalian") : "sin volumen declarado"}
                </span>
              </div>
              <div className={`${CIFRA} border-[var(--accent)] bg-[var(--accent)]/5`} data-cifra="neta">
                <span className={ROTULO}>{u.nombre} neta · lo que se paga</span>
                <span className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{fmtVolumen(c.neto, p.formula)}</span>
                {c.bruto > c.neto && (
                  <span className="ml-2 text-sm tabular-nums text-[var(--text-secondary)]">
                    de {fmtVolumen(c.bruto, p.formula)} bruto (−{fmtVolumen(c.bruto - c.neto, p.formula)})
                  </span>
                )}
              </div>
            </div>
            {comparacion && (
              <p className="flex flex-wrap items-center gap-1 text-sm text-[var(--text-secondary)]" data-cifra="derivada">
                {p.formula === "oxapampina"
                  ? <>≈ {fmtNum(comparacion.base, 0)} PT si se pasara lo declarado a PT (×424): </>
                  : <>Frente a lo declarado: </>}
                <b className="tabular-nums text-[var(--text-primary)]">
                  {fmtNum(Math.abs(comparacion.menos), 1)} % {comparacion.menos >= 0 ? "menos" : "más"}
                </b>
                <InfoTip
                  title="Es un derivado"
                  what="La guía declara m³ Smalian (la cifra de SERFOR). La Oxapampina se mide en pie tablar con otra fórmula: para compararlas se pasa lo declarado a PT con el factor de la plaza (1 m³ = 424 PT)."
                  affects="Sólo orienta: lo que se paga es la Oxapampina neta, no esta comparación."
                  example="20,303 m³ × 424 ≈ 8 608 PT; la Oxapampina bruta de las mismas trozas da 5 364 PT."
                />
              </p>
            )}

            {existentes.length > 0 && (
              <div className="space-y-1.5" data-vista="cubicaciones-de-la-guia">
                {pagada && (
                  <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    Esta guía ya se pagó con {pagada.codigo}: otra cubicación de las mismas trozas la pagaría dos veces.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {existentes.map((e) => (
                    <button key={e.id} type="button" onClick={() => setAbierta(e.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--rule-base)] px-3 text-sm hover:border-[var(--accent)]">
                      <b className="font-mono text-[var(--text-primary)]">{e.codigo}</b>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_CUB[e.estado].clase}`}>{ESTADO_CUB[e.estado].label}</span>
                      {e.personaNombre && <span className="text-[var(--text-secondary)]">{e.personaNombre}</span>}
                      {e.monto != null && <span className="font-semibold tabular-nums text-[var(--text-primary)]">{formatCurrency(e.monto)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                value={p.formula}
                onChange={p.setFormula}
                size="sm"
                label="Fórmula con la que se cubica la guía"
                options={FORMULAS_TROZAS.map((f) => ({ value: f, label: UNIDADES_FORMULA[f].etiqueta }))}
              />
              <InfoTip
                title="Cómo se descuenta"
                what="Por troza: el largo que no sirve se resta del largo; el hueco se resta como un cilindro de ese Ø con el largo que queda; el castigo % va al final. Al pie, lo del lote: por especie y un % general."
                affects="Cada fórmula es su propia planilla: cambiar no convierte lo que tipeaste. Una troza sin medidas no se guarda."
                example="20″ y 20″, 10′ = 163,27 PT; hueco 6″ (14,69 PT) → 148,58 PT neto."
              />
              {prefill.sinMedidas > 0 && (
                <span className="text-sm text-[var(--text-tertiary)]">{prefill.sinMedidas} trozas de la guía sin D1/D2/largo: no se prellenan.</span>
              )}
            </div>

            {total === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-secondary)]">Esta guía no trae trozas con medidas.</p>
            ) : (
              <div ref={cajaRef} role="table" aria-label="Trozas de la guía: medidas y descuentos"
                className="@container/cubicar divide-y divide-[var(--rule-soft)] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <div role="rowgroup" className="bg-[var(--surface-sunken)]"><CabeceraCubicar formula={p.formula} /></div>
                {p.planilla.filas.map((f, i) => (
                  <FilaCubicarGuia key={f.codigo ?? i} i={i} fila={f} calculo={c.filas[i]} formula={p.formula} onSet={p.set} onTecla={onTecla} />
                ))}
              </div>
            )}

            {c.especies.length > 0 && (
              <PieDescuentos formula={p.formula} especies={c.especies} lineas={c.lineas} lote={p.planilla.lote} onLote={p.setLote} />
            )}
          </>
        )}
      </ModalBody>

      {guardar && prefill && c && (
        <GuardarEnLaCuentaModal
          rows={guardar.rows}
          formula={p.formula}
          diametros={2}
          previaId={previa?.id ?? null}
          aboveModals
          vinculo={{
            origen: "loth",
            origenId: g.id,
            gtfNumber: prefill.gtfNumber,
            descuentos: c.descuentoLote,
            descuentosPorTroza: guardar.descuentosPorTroza,
            sentidoInicial: "compra",
          }}
          onGuardada={(cub) => { setGuardando(false); setFoto(JSON.stringify(p.planilla)); recargar(); setAbierta(cub.id); }}
          onCerrar={() => setGuardando(false)}
        />
      )}
      {abierta && (
        <ValorizarCubicacionModal id={abierta} puedeAplicar={puedeAplicar} aboveModals onCambio={recargar} onCerrar={() => setAbierta(null)} />
      )}
    </AdminModal>
  );
}
