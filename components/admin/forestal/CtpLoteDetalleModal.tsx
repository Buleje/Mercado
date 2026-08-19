"use client";

/**
 * La ficha del lote de aserrío: qué piezas tiene y qué pasó con ellas (ADR-334).
 *
 * Es la pantalla que contesta la pregunta de un fiscalizador —«¿de qué trozas
 * salió esta corrida?»— sin salir del lote: cada pieza con su código de planta,
 * su codificación de origen, sus medidas y su volumen, y el total al pie que
 * tiene que coincidir con el volumen de entrada declarado en la corrida.
 *
 * Sólo se sacan piezas mientras el lote está ABIERTO (L-A3): un lote consumido
 * es parte del libro y moverle madera sería reescribir lo que pasó.
 */

import { useState } from "react";
import { AlertTriangle, Boxes, Loader2, Play, Trash2, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  ESTADO_LOTE,
  alertasDeLote,
  juzgarRendimientoLote,
  pieTablarDe,
  piezasLibres,
  rendimientoLote,
  salidaDelLote,
  volumenLibre,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";
import { Btn, ModalBody, ModalFooter, Seccion } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";
import { IconAction } from "@/components/admin/shared/module-primitives";

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

/** Un dato de la ficha. Los vacíos se muestran igual: acá el hueco es el dato. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sm:col-span-4">
      <dt className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export default function CtpLoteDetalleModal({
  lote,
  ahora,
  onQuitar,
  onEditarNota,
  onDeshacer,
  onProducir,
  onClose,
}: {
  lote: LoteAserrio;
  ahora: Date;
  onQuitar: (trozaId: string) => Promise<void>;
  onEditarNota: (notes: string | null) => Promise<void>;
  onDeshacer: () => Promise<void>;
  onProducir: () => void;
  onClose: () => void;
}) {
  const [nota, setNota] = useState(lote.notes ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const abierto = lote.status === "abierto";
  const estado = ESTADO_LOTE[lote.status];
  const libres = piezasLibres(lote);
  const rend = rendimientoLote(lote);
  const veredicto = juzgarRendimientoLote(rend);
  const alertas = alertasDeLote(lote, ahora);
  const salida = salidaDelLote(lote);
  const corridaMuerta = Boolean(lote.produccion && !lote.produccion.viva);
  /* Un lote de sesenta piezas no se lee de un scroll: mismo formato y misma
     paginación que el resto de las tablas del libro (ADR-344). */
  const { visibles: piezasEnPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(lote.trozas);
  const notaCambiada = (lote.notes ?? "") !== nota;

  async function correr(id: string, fn: () => Promise<void>) {
    setOcupado(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={Boxes}
      title={`${lote.code} · ${lote.speciesCommon}`}
      description={estado.hint}
      footer={
        <ModalFooter
          error={error}
          nota={
            <span className="font-mono tabular-nums">
              {lote.piezas} pza · {lote.volumenM3.toFixed(4)} m³ ·{" "}
              {pieTablarDe(lote.volumenM3).toLocaleString("es-PE")} pt
              {abierto && libres.length !== lote.piezas && ` · ${libres.length} libres`}
            </span>
          }
        >
          {(abierto || corridaMuerta) &&
            (confirmarBorrado ? (
              <>
                <span className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  ¿Deshacer? Sus piezas vuelven al patio.
                </span>
                <Btn variant="secondary" onClick={() => setConfirmarBorrado(false)}>
                  No
                </Btn>
                <Btn
                  variant="danger"
                  disabled={ocupado != null}
                  onClick={() => void correr("deshacer", onDeshacer)}
                >
                  {ocupado === "deshacer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Sí, deshacer
                </Btn>
              </>
            ) : (
              <Btn variant="danger" onClick={() => setConfirmarBorrado(true)}>
                <Trash2 className="h-4 w-4" /> Deshacer lote
              </Btn>
            ))}
          {abierto && (
            <Btn variant="primary" disabled={libres.length === 0} onClick={onProducir}>
              <Play className="h-4 w-4" /> Producir de este lote
            </Btn>
          )}
          <Btn variant="secondary" onClick={onClose}>
            Cerrar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody>
        {alertas.map((a) => (
          <p
            key={a.texto}
            className={`mb-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
              a.tono === "warning"
                ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {a.texto}
          </p>
        ))}

        <Seccion numero={1} title="El lote">
          <Dato label="Estado">{estado.label}</Dato>
          <Dato label="Especie">
            {lote.speciesCommon}
            {lote.speciesScientific && <> <span className="italic text-[var(--text-tertiary)]">{lote.speciesScientific}</span></>}
          </Dato>
          <Dato label="Armado">{fmt(lote.fechaApertura)}</Dato>
          <Dato label="Entró a la sierra">{fmt(lote.fechaConsumo)}</Dato>
          <Dato label="Corrida">
            {lote.produccion ? (
              <span className={corridaMuerta ? "line-through opacity-70" : ""}>
                N° {lote.produccion.lineNo} · {fmt(lote.produccion.entryDate)}
                {lote.produccion.productType && ` · ${lote.produccion.productType}`}
                {lote.produccion.quantity != null &&
                  ` · ${lote.produccion.quantity.toFixed(4)} ${lote.produccion.unit ?? ""}`}
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">Todavía no se aserró</span>
            )}
          </Dato>
          <Dato label="Rendimiento">
            {rend != null ? (
              <span className="font-mono tabular-nums">
                {rend}% <span className="font-sans font-normal text-[var(--text-tertiary)]">· {veredicto.texto}</span>
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">
                {lote.produccion ? "La corrida no declaró en m³" : "—"}
              </span>
            )}
          </Dato>
          {/* Dónde terminó la madera: el lote no muere en la corrida (ADR-337). */}
          <Dato label="Salida del producto">
            {salida ? (
              <span className="font-mono tabular-nums">
                {salida.salido} de {salida.producido} {salida.unidad ?? ""}
                <span className="font-sans font-normal text-[var(--text-tertiary)]">
                  {salida.enPatio > 0 ? ` · quedan ${salida.enPatio} en patio` : " · todo despachado"}
                </span>
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">Todavía no produjo</span>
            )}
          </Dato>
        </Seccion>

        <Seccion numero={2} title="Nota del lote" hint="Para qué se armó, en una línea">
          <div className="sm:col-span-12 flex flex-wrap items-start gap-2">
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              aria-label={`Nota del lote ${lote.code}`}
              placeholder="Sin nota"
              className="w-full sm:w-auto sm:flex-1 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
            <Btn
              variant="secondary"
              disabled={!notaCambiada || ocupado != null}
              onClick={() => void correr("nota", () => onEditarNota(nota.trim() || null))}
            >
              {ocupado === "nota" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar nota
            </Btn>
          </div>
        </Seccion>

        <Seccion numero={3} title={`Piezas del lote (${lote.piezas})`} hint="El total tiene que cuadrar con el volumen de entrada de la corrida">
          <div className="sm:col-span-12 space-y-2">
            <TablaCtp>
              <TheadCtp>
                <tr>
                  <th className="px-3 py-2 font-bold">Cód. planta</th>
                  <th className="px-3 py-2 font-bold">Codificación</th>
                  <th className="px-3 py-2 text-right font-bold">D1 × D2 (cm)</th>
                  <th className="px-3 py-2 text-right font-bold">Largo (m)</th>
                  <th className="px-3 py-2 text-right font-bold">Volumen</th>
                  <th className="px-3 py-2 font-bold">Estado</th>
                  {abierto && <th className="px-3 py-2 font-bold sr-only">Quitar</th>}
                </tr>
              </TheadCtp>
              <TbodyCtp>
                {lote.trozas.length === 0 && (
                  <FilaVacia cols={abierto ? 7 : 6}>
                    El lote está vacío. Cargalo desde Consumos eligiendo este lote.
                  </FilaVacia>
                )}
                {piezasEnPagina.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{t.codigoPlanta ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codificacion ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.d1Cm != null || t.d2Cm != null
                        ? `${t.d1Cm?.toFixed(0) ?? "—"} × ${t.d2Cm?.toFixed(0) ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.largoM != null ? t.largoM.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {t.volumenM3 != null ? `${t.volumenM3.toFixed(4)} m³` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {t.consumidaEnId ? (
                        abierto ? (
                          <span className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            Consumida por otra corrida
                          </span>
                        ) : (
                          "Aserrada"
                        )
                      ) : (
                        "En el lote"
                      )}
                    </td>
                    {abierto && (
                      <td className="px-3 py-2 text-right">
                        <IconAction
                          icon={X}
                          tone="muted"
                          label={`Sacar la troza ${t.codigoPlanta ?? t.codificacion ?? ""} del lote`}
                          busy={ocupado === t.id}
                          disabled={ocupado != null}
                          onClick={() => void correr(t.id, () => onQuitar(t.id))}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </TbodyCtp>
              {lote.trozas.length > 0 && (
                <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
                      Total {abierto ? `· ${libres.length} libres de ${lote.piezas}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {(abierto ? volumenLibre(lote) : lote.volumenM3).toFixed(4)} m³
                    </td>
                    <td colSpan={abierto ? 2 : 1} className="px-3 py-2 font-mono text-sm tabular-nums text-[var(--text-tertiary)]">
                      {pieTablarDe(abierto ? volumenLibre(lote) : lote.volumenM3).toLocaleString("es-PE")} pt
                    </td>
                  </tr>
                </tfoot>
              )}
            </TablaCtp>
            <CtpPaginacion
              rango={rango}
              porPagina={porPagina}
              onPorPagina={setPorPagina}
              onIr={ir}
              sustantivo="pieza"
            />
          </div>
        </Seccion>
      </ModalBody>
    </AdminModal>
  );
}
