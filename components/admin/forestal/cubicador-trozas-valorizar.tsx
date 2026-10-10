"use client";

/**
 * Una cubicación guardada abierta (ADR-478; ADR-483 suma la madera aserrada y
 * los descuentos): quién, cuándo, cuánto y sus medidas congeladas —trozas,
 * piezas o líneas por especie—, y lo que se puede hacer según su estado:
 *   - borrador → «Valorizar y descontar» (dueño/admin) o borrarla;
 *   - aplicada → a qué adelantos fue, lo que quedó en su cuenta y el valor de
 *     venta del despacho (ADR-484), y «Anular» (todo vuelve como estaba);
 *   - anulada  → el motivo.
 * `soloLectura` es lo que abre «Ver medidas» desde la entrega del adelanto.
 */
import { useState } from "react";
import { AlertTriangle, Ban, Loader2, Ruler, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/currency";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import { fmtVolumen, unidadDe } from "@/lib/forestal/cubicacion-cuenta";
import { lineasDeEspecie, unidadesComercial } from "@/lib/forestal/cubicacion-comercial";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import { MedidasAserrada, ResumenDescuentos } from "./cubicacion-comercial-medidas";
import MedidasCongeladas from "./cubicador-trozas-medidas";
import ValorizarPrecios from "./cubicador-trozas-precios";
import { ACuentaHecha } from "./cubicador-trozas-a-cuenta";
import { anularCubicacionTrozas, borrarCubicacionTrozas, ESTADO_CUB, medidasDe, useCubicacionTrozas, type CubicacionTrozas } from "./hooks/use-cubicaciones-trozas";

const ERROR = "flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

export default function ValorizarCubicacionModal({
  id, puedeAplicar, soloLectura = false, aboveModals = false, onCambio, onCerrar,
}: {
  id: string;
  /** Dueño o admin: valoriza, descuenta, anula y borra. */
  puedeAplicar: boolean;
  soloLectura?: boolean;
  /** Se abre desde otro modal (la ficha del adelanto). */
  aboveModals?: boolean;
  onCambio?: (c: CubicacionTrozas | null) => void;
  onCerrar: () => void;
}) {
  const { cub, setCub, cuenta: cuentaPersona, cargando, error: errorCarga } = useCubicacionTrozas(id);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acciones = puedeAplicar && !soloLectura;

  const cambio = (c: CubicacionTrozas) => {
    /* La respuesta de aplicar/anular puede venir sin las medidas: se conservan las que ya se ven. */
    const conMedidas = { ...c, trozas: c.trozas ?? cub?.trozas, piezas: c.piezas ?? cub?.piezas, lineas: c.lineas ?? cub?.lineas };
    setCub(conMedidas);
    onCambio?.(conMedidas);
  };
  const anular = async () => {
    if (!cub || motivo.trim().length < 3 || enviando) return;
    setEnviando(true); setError(null);
    const r = await anularCubicacionTrozas(cub.id, motivo.trim());
    setEnviando(false);
    if (r.ok) { cambio(r.data); setAnulando(false); } else setError(r.mensaje);
  };
  const borrar = async () => {
    if (!cub || enviando || !window.confirm(`¿Borrar ${cub.codigo}? No movió plata; las medidas siguen en tu patio.`)) return;
    setEnviando(true); setError(null);
    const r = await borrarCubicacionTrozas(cub.id);
    setEnviando(false);
    if (r.ok) { onCambio?.(null); onCerrar(); } else setError(r.mensaje);
  };

  const u = cub ? unidadesComercial(cub.formula) : null;
  const estado = cub ? ESTADO_CUB[cub.estado] : null;
  const aserrada = cub?.material === "aserrada";
  /* «34 trozas» · «50 piezas» (la aserrada rápida sin piezas contadas no dice cuántas). */
  const cuenta = !cub ? "" : aserrada
    ? (cub.nTrozas > 0 ? `${cub.nTrozas} ${cub.nTrozas === 1 ? "pieza" : "piezas"} · ` : "")
    : `${cub.nTrozas} ${cub.nTrozas === 1 ? "troza" : "trozas"} · `;
  const nMedidas = aserrada ? (cub?.piezas?.length ?? 0) + (cub?.lineas?.length ?? 0) : (cub?.trozas?.length ?? 0);
  /* Las líneas por especie con los descuentos de cada troza/pieza, antes de los del lote. */
  const lineas = cub ? lineasDeEspecie({ material: cub.material ?? "troza", modo: cub.modo ?? "pieza", formula: cub.formula, trozas: medidasDe(cub) }) : [];
  const nombres = cub?.descuentos?.porEspecie?.length ? Object.fromEntries(lineas.map((l) => [l.clave, l.nombre])) : undefined;
  const antesDelLote = nMedidas > 0 && lineas.length > 0 ? lineas.reduce((s, l) => s + l.volumen, 0) : null;
  return (
    <AdminModal
      open
      onClose={onCerrar}
      aboveModals={aboveModals}
      title={cub ? `${cub.codigo} · ${cub.personaNombre ?? "sin persona"}` : "Cubicación"}
      description={cub && u ? `${fechaConDia(cub.fecha)} · ${cuenta}${fmtVolumen(cub.volumen, cub.formula)} · ${u.nombre}` : undefined}
      icon={Ruler}
      variant="wide"
      claveVentana="cubicador-trozas-valorizar"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {acciones && cub?.estado === "borrador" && (
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => void borrar()} disabled={enviando}>
              <Trash2 className="h-4 w-4" /> Borrar
            </button>
          )}
          {acciones && cub?.estado === "aplicada" && !anulando && (
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAnulando(true)} data-accion="anular-cubicacion">
              <Ban className="h-4 w-4" /> Anular
            </button>
          )}
          <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>Cerrar</button>
        </div>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`} data-vista="cubicacion-trozas">
        {cargando ? (
          <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        ) : errorCarga || !cub || !u || !estado ? (
          <p role="alert" className={ERROR}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorCarga ?? "No se encontró."}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-2.5 py-1 font-bold ${estado.clase}`}>{estado.label}</span>
              <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 font-semibold text-[var(--text-secondary)]">
                {cub.sentido === "venta" ? "Se la entregaste" : "Te la trajo"}
              </span>
              {cub.origen === "despacho" && (
                <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 font-semibold text-[var(--text-secondary)]">Del despacho</span>
              )}
              {!aserrada && cub.diametros === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-50)] px-2.5 py-1 font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                  medido con 1 Ø
                  <InfoTip what="Cada troza se midió con un solo diámetro al medio." affects="Con las dos puntas, como en la guía, el volumen sale hasta 21 % más bajo." />
                </span>
              )}
              {cub.gtfNumber && <span className="font-mono text-[var(--text-secondary)]">GTF {cub.gtfNumber}</span>}
              {cub.monto != null && <span className="ml-auto text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(cub.monto)}</span>}
            </div>
            {cub.notas && <p className="text-sm text-[var(--text-secondary)]">{cub.notas}</p>}
            <ResumenDescuentos bruto={cub.volumenBruto} neto={cub.volumen} descuentos={cub.descuentos} formula={cub.formula} nombres={nombres} antesDelLote={antesDelLote} />

            {cub.estado === "borrador" && acciones && <ValorizarPrecios cub={cub} cuenta={cuentaPersona} onAplicada={cambio} />}
            {cub.estado === "borrador" && !acciones && !soloLectura && (
              <p className="rounded-2xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Guardada sin descontar. El precio y el descuento del adelanto los pone el dueño o el admin.
              </p>
            )}

            {cub.estado !== "borrador" && cub.porEspecie?.length ? (
              <ul className="divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-soft)] text-sm">
                {cub.porEspecie.map((l) => (
                  <li key={l.clave} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                    <span className="flex-1 font-semibold text-[var(--text-primary)]">{l.nombre}</span>
                    <span className="tabular-nums text-[var(--text-tertiary)]">
                      {aserrada ? (l.n > 0 ? `${l.n} pzs · ` : "") : `${l.n} · `}{fmtVolumen(l.volumen, cub.formula)}{l.precio != null && ` × ${formatCurrency(l.precio)} por ${unidadDe(cub.formula)}`}
                    </span>
                    <span className="w-28 text-right font-bold tabular-nums text-[var(--text-primary)]">{l.monto != null ? formatCurrency(l.monto) : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {cub.imputacion?.length ? (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-[var(--text-secondary)]">
                  {cub.estado === "anulada" ? "Se había descontado de" : "Se descontó de"}
                </p>
                <ul className="space-y-1.5">
                  {cub.imputacion.map((i) => (
                    <li key={i.adelantoId} className="flex flex-wrap items-center gap-x-3 rounded-xl border border-[var(--rule-soft)] px-3 py-2 text-sm">
                      <span className="font-mono font-bold text-[var(--text-primary)]">{i.codigoOperacion ?? "Adelanto"}</span>
                      <span className="text-[var(--text-tertiary)]">{fmtVolumen(i.volumen, cub.formula)}</span>
                      {i.excedido && <span className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" title="La liquidación de la cuenta no salda lo excedido: págaselo aparte una sola vez">quedó excedido: le debes la diferencia (págala aparte)</span>}
                      <span className={`ml-auto font-bold tabular-nums ${cub.estado === "anulada" ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"}`}>
                        − {formatCurrency(i.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {cub.estado !== "borrador" && <ACuentaHecha cub={cub} />}

            {cub.estado === "anulada" && (
              <p className="text-sm text-[var(--text-secondary)]">
                Anulada{cub.anuladaAt ? ` el ${fechaConDia(cub.anuladaAt.slice(0, 10))}` : ""}{cub.motivoAnulacion ? `: ${cub.motivoAnulacion}` : ""}. {cub.aCuenta ? "Sus adelantos y su cuenta volvieron" : "El saldo de los adelantos volvió"} a como estaba.
              </p>
            )}

            {anulando && (
              <div className="space-y-2 rounded-2xl border border-[var(--data-error-500)]/40 p-3">
                <label htmlFor="cub-motivo" className="block text-sm font-semibold text-[var(--text-secondary)]">
                  ¿Por qué la anulas? {cub.aCuenta ? "Sus adelantos y su cuenta vuelven" : "El saldo de sus adelantos vuelve"} a como estaba{cub.valorVenta?.estado === "puesto" ? ", y el valor de venta del despacho se vacía si nadie lo cambió" : ""}.
                </label>
                <input id="cub-motivo" autoFocus value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el precio estaba mal"
                  className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]" />
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className={BOTON_SECUNDARIO} onClick={() => { setAnulando(false); setMotivo(""); }}>No anular</button>
                  <button type="button" disabled={motivo.trim().length < 3 || enviando} onClick={() => void anular()} data-accion="confirmar-anular"
                    className={`${BOTON_SECUNDARIO} border-[var(--data-error-500)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]`}>
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Anular {cub.codigo}
                  </button>
                </div>
              </div>
            )}
            {error && <p role="alert" className={ERROR}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

            {nMedidas > 0 ? (
              <details open={soloLectura} className="group">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  Medidas ({nMedidas})
                </summary>
                <div className="mt-2">
                  {aserrada || cub.formula === "tablar"
                    ? <MedidasAserrada piezas={cub.piezas} lineas={cub.lineas} />
                    : <MedidasCongeladas trozas={cub.trozas ?? []} formula={cub.formula} diametros={cub.diametros} />}
                </div>
              </details>
            ) : null}
          </>
        )}
      </div>
    </AdminModal>
  );
}
