"use client";

/**
 * La ficha de la guía — todo lo que el libro sabe de ella, y el botón para
 * recibirla (ADR-350).
 *
 * El papel imprimible ya existía (ADR-348) y sirve para el expediente. Lo que
 * faltaba es la pantalla donde se REVISA antes de recibir: sus casilleros, sus
 * asientos del libro y su lista de trozas, con «Recepcionar» ahí mismo.
 *
 * Recibir en otra pantalla que la que se revisa termina en guías recibidas sin
 * mirar. Acá se ve lo que falta —los casilleros vacíos se muestran vacíos— y se
 * decide con eso a la vista.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, FileText, Loader2, PackageCheck, Scale } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import { completitudFicha, seccionesDeGuia, type LineaConGuia } from "@/lib/forestal/guia-ficha";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { formatDate, productLabel, StatusBadge, type WoodEntry, type WoodEntryStatus } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Una pieza de la guía, como la devuelve el endpoint de trozas. */
export interface TrozaDeFicha {
  id: string;
  codificacion?: string | null;
  codigoPlanta?: string | null;
  especieComun?: string | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  largoM?: number | null;
  volumenM3?: number | string | null;
  fechaRecepcion?: string | null;
  noRecepcionada?: boolean | null;
  consumidaEnId?: string | null;
}

const n4 = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? fmtM3(n) : "—";
};

function Seccion({ titulo, rango, children }: { titulo: string; rango?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)]">
      <CardTitle as="h3" className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl bg-[var(--surface-sunken)] px-3 py-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        {rango && <span className="text-xs text-[var(--text-tertiary)]">{rango}</span>}
      </CardTitle>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default function CtpGuiaFichaModal({
  guia,
  trozas,
  cargandoTrozas,
  recepcionando,
  error,
  onRecepcionar,
  onVerDocumento,
  onCuadrar,
  onClose,
}: {
  guia: GuiaIngreso<WoodEntry>;
  /** Las piezas de todos sus asientos. `null` mientras cargan. */
  trozas: TrozaDeFicha[] | null;
  cargandoTrozas: boolean;
  recepcionando: boolean;
  error: string | null;
  /** Recepciona la guía entera: fecha sus piezas, la fecha y la valida (ADR-339). */
  onRecepcionar: () => void;
  onVerDocumento: () => void;
  /** Abre el cuadre cuando el documento se contradice a sí mismo (ADR-353). */
  onCuadrar?: () => void;
  onClose: () => void;
}) {
  const [verTodas, setVerTodas] = useState(false);
  const secciones = useMemo(
    () => seccionesDeGuia(guia as unknown as GuiaIngreso<LineaConGuia>),
    [guia],
  );
  const completitud = useMemo(() => completitudFicha(secciones), [secciones]);

  /* El mismo cálculo que el chip de la tabla: un solo criterio de descuadre en
     todo el libro, o la ficha diría que cuadra lo que el listado marca en rojo. */
  const cuadre = cuadreDeIngreso(guia.volumenM3, guia.trozasM3, guia.trozasCount);
  const piezas = trozas ?? [];
  const { visibles, rango, porPagina, setPorPagina, ir } = usePaginacion(piezas);
  const recibidas = piezas.filter((t) => t.fechaRecepcion || t.noRecepcionada).length;
  /** Una guía ya recibida no se vuelve a recibir: el botón lo dice, no lo esconde. */
  const yaRecepcionada = guia.status !== "pendiente" && guia.trozasDecididas >= guia.trozasCount;

  return (
    <AdminModal
      open
      onClose={recepcionando ? () => {} : onClose}
      variant="info"
      icon={FileText}
      title={`Guía ${guia.gtfNumber}`}
      description={`${guia.providerName} · ${guia.lineas.length} asiento${guia.lineas.length === 1 ? "" : "s"} · ${fmtM3(guia.volumenM3)} m³`}
      footer={
        <ModalFooter
          error={error}
          nota={
            <span className="font-mono tabular-nums">
              {completitud.llenos}/{completitud.total} casilleros · {guia.trozasCount} pieza
              {guia.trozasCount === 1 ? "" : "s"}
              {guia.trozasCount > 0 && ` · ${guia.trozasDecididas}/${guia.trozasCount} recibidas`}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={recepcionando}>
            Cerrar
          </Btn>
          <Btn variant="secondary" onClick={onVerDocumento} disabled={recepcionando}>
            <FileText className="h-4 w-4" /> Ver el documento
          </Btn>
          <Btn variant="primary" onClick={onRecepcionar} disabled={recepcionando || yaRecepcionada}>
            {recepcionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            {yaRecepcionada ? "Ya recepcionada" : "Recepcionar guía"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {/* Qué es esto y en qué estado está, antes de cualquier casillero. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
          {guia.statusMixto ? (
            <span className="font-bold text-[var(--text-secondary)]">
              Asientos en {Object.keys(guia.porEstado).length} estados distintos
            </span>
          ) : (
            <StatusBadge status={guia.status as WoodEntryStatus} />
          )}
          <span className="text-[var(--text-secondary)]">
            Ingresada el <b className="text-[var(--text-primary)]">{formatDate(guia.entryDate)}</b>
          </span>
          <span className="text-[var(--text-secondary)]">
            Folio{" "}
            <b className="font-mono text-[var(--text-primary)]">
              {guia.libroDesde == null
                ? "—"
                : guia.libroHasta && guia.libroHasta !== guia.libroDesde
                  ? `${guia.libroDesde}–${guia.libroHasta}`
                  : guia.libroDesde}
            </b>
          </span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {fmtM3(guia.volumenM3)} m³ · {pieTablarDe(guia.volumenM3).toLocaleString("es-PE")} pt
          </span>
        </div>

        {/* El descuadre del documento, ANTES de recibirlo (ADR-353). Recibir una
            guía que no cuadra consigo misma deja la sorpresa para el consumo,
            que es donde ya no se entiende de dónde salió. */}
        {descuadra(cuadre) && (
          <div className="flex flex-wrap items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              <b>Esta guía no cuadra consigo misma.</b> Declara{" "}
              <span className="font-mono tabular-nums">{fmtM3(guia.volumenM3)} m³</span> por especie y su lista de
              trozas suma <span className="font-mono tabular-nums">{fmtM3(guia.trozasM3 ?? 0)} m³</span>. Se puede
              recibir igual —el documento es el que es— pero no se va a poder consumir hasta cuadrarla.
            </span>
            {onCuadrar && (
              <Btn variant="secondary" onClick={onCuadrar} disabled={recepcionando}>
                <Scale className="h-4 w-4" /> Cuadrar
              </Btn>
            )}
          </div>
        )}

        {completitud.faltan.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <b>Faltan {completitud.faltan.length} casilleros</b> del formato:{" "}
              {completitud.faltan.slice(0, 6).join(" · ")}
              {completitud.faltan.length > 6 ? ` y ${completitud.faltan.length - 6} más` : ""}. Se pueden completar
              editando el ingreso; recepcionar no los exige.
            </span>
          </p>
        )}

        {/* ── Las especies del papel: un asiento por especie (ADR-312) ── */}
        <Seccion titulo={`Detalle del producto · ${guia.especies.length} especie(s)`} rango="casilleros (37a) a (37g)">
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-3 py-2 font-bold">N° libro</th>
                <th className="px-3 py-2 font-bold">Especie</th>
                <th className="px-3 py-2 font-bold">Producto</th>
                <th className="px-3 py-2 text-right font-bold">Piezas</th>
                <th className="px-3 py-2 text-right font-bold">Volumen</th>
                <th className="px-3 py-2 font-bold">Estado</th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {guia.lineas.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{l.libroNro ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="font-bold text-[var(--text-primary)]">{l.speciesCommonName}</span>
                    {l.speciesScientificName && (
                      <span className="ml-2 text-xs italic text-[var(--text-tertiary)]">{l.speciesScientificName}</span>
                    )}
                    {l.speciesCites && (
                      <span className="ml-2 rounded-full bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">
                        CITES
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{productLabel(l.productType)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {l.pieces ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {n4(l.volumeM3)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={l.status} />
                  </td>
                </tr>
              ))}
            </TbodyCtp>
          </TablaCtp>
        </Seccion>

        {/* ── Los casilleros del documento ── */}
        {secciones.map((s) => (
          <Seccion key={s.titulo} titulo={s.titulo} rango={s.rango}>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {s.campos.map((c) => (
                <div key={c.label}>
                  <dt className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                    {c.casillero && <span className="mr-1 font-mono">({c.casillero})</span>}
                    {c.label}
                  </dt>
                  {/* Vacío se dibuja vacío: un campo que desaparece hace creer
                      que la guía no lo necesita. */}
                  <dd className={c.valor ? "text-sm text-[var(--text-primary)]" : "text-sm text-[var(--text-tertiary)]"}>
                    {c.valor ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </Seccion>
        ))}

        {/* ── La lista de trozas ── */}
        <Seccion titulo={`Lista de trozas · ${piezas.length}`} rango="anexo del casillero (35)">
          {cargandoTrozas ? (
            <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">Leyendo las piezas de la guía…</p>
          ) : (
            <>
              <TablaCtp>
                <TheadCtp>
                  <tr>
                    <th className="px-3 py-2 font-bold">N°</th>
                    <th className="px-3 py-2 font-bold">Codificación</th>
                    <th className="px-3 py-2 font-bold">Cód. planta</th>
                    <th className="px-3 py-2 font-bold">Especie</th>
                    <th className="px-3 py-2 font-bold">Medidas</th>
                    <th className="px-3 py-2 text-right font-bold">Volumen</th>
                    <th className="px-3 py-2 font-bold">Recepción</th>
                  </tr>
                </TheadCtp>
                <TbodyCtp>
                  {(verTodas ? piezas : visibles).length === 0 && (
                    <FilaVacia cols={7}>
                      Esta guía no tiene piezas cargadas. Se pueden agregar desde el ingreso, pieza por pieza o
                      importando la lista.
                    </FilaVacia>
                  )}
                  {(verTodas ? piezas : visibles).map((t, i) => (
                    <tr key={t.id} className="hover:bg-[var(--surface-sunken)]">
                      <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">
                        {verTodas ? i + 1 : rango.inicio + i + 1}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                        {t.codificacion ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codigoPlanta ?? "—"}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                        {t.d1Cm && t.d2Cm && t.largoM ? `${t.d1Cm} × ${t.d2Cm} cm · ${t.largoM} m` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                        {n4(t.volumenM3)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {t.noRecepcionada ? (
                          <span className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            No llegó
                          </span>
                        ) : t.fechaRecepcion ? (
                          <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                            {formatDate(t.fechaRecepcion)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">sin fechar</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </TbodyCtp>
              </TablaCtp>

              {!verTodas && piezas.length > 25 ? (
                <CtpPaginacion
                  rango={rango}
                  porPagina={porPagina}
                  onPorPagina={setPorPagina}
                  onIr={ir}
                  sustantivo="pieza"
                  extra={
                    <button
                      type="button"
                      onClick={() => setVerTodas(true)}
                      className="font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
                    >
                      ver las {piezas.length} de una
                    </button>
                  }
                />
              ) : (
                piezas.length > 0 && (
                  <p className="pt-2 text-sm text-[var(--text-tertiary)]">
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">{piezas.length} piezas</span>{" "}
                    · {recibidas} con decisión de recepción
                  </p>
                )
              )}
            </>
          )}
        </Seccion>
      </ModalBody>
    </AdminModal>
  );
}
