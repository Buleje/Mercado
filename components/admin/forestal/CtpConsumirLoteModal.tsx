"use client";

/**
 * El acta del consumo, antes de firmarla (ADR-340 · rediseñado en ADR-345).
 *
 * Consumir es irreversible en el día a día: esas piezas salen del patio y entran
 * al libro con una fecha. Así que lo último que se ve antes de apretar es la
 * lista completa —pieza por pieza, con su guía y su volumen— y no un contador.
 * Es la misma tabla que después va a poder mirar un fiscalizador.
 *
 * Acá se termina de decidir, no sólo se confirma: se corrige la fecha, se saca
 * la pieza que se coló y se escribe la observación que va al libro. Un modal que
 * sólo dice sí/no obliga a cerrar, volver a la tabla y buscar la fila.
 */

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import {
  AlertTriangle,
  CalendarDays,
  Flame,
  Layers,
  Loader2,
  PackageOpen,
  Scale,
  Search,
  TreePine,
  X,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  agruparPorGuia,
  avisosSeleccion,
  cuposDeGuia,
  motivoDeCupo,
  totalesSeleccion,
  type TrozaConsumible,
} from "@/lib/forestal/consumo-trozas";
import { pieTablarDe, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Lo que el modal devuelve cuando se firma. */
export interface ConfirmacionConsumo {
  /** Día del consumo, `AAAA-MM-DD` — puede haberse corregido acá. */
  fecha: string;
  /** Observación para el casillero (11) del libro. */
  observaciones: string | null;
  /** Las piezas que se agregan al lote (las que ya estaban entran igual). */
  trozaIds: string[];
}

const fmtDia = (dia: string) => {
  const d = new Date(`${dia}T12:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? dia
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().trim();

const CAMPO =
  "h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Una cifra del acta. Cuatro juntas responden «¿qué estoy por firmar?». */
function Cifra({
  icon: Icon,
  label,
  valor,
  detalle,
}: {
  icon: typeof Flame;
  label: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{valor}</p>
      {detalle && <p className="text-sm text-[var(--text-tertiary)]">{detalle}</p>}
    </div>
  );
}

export default function CtpConsumirLoteModal({
  lote,
  trozas,
  fecha,
  yaEnElLote,
  guardando,
  error,
  onConfirmar,
  onCuadrar,
  onClose,
}: {
  lote: LoteAserrio;
  /** Las piezas elegidas — ya filtradas por el picker. */
  trozas: TrozaConsumible[];
  /** Día del consumo que traía el filtro, `AAAA-MM-DD`. */
  fecha: string;
  /** Las que el lote ya tenía apartadas: entran sí o sí, no se sacan de acá. */
  yaEnElLote: ReadonlySet<string>;
  guardando: boolean;
  error: string | null;
  onConfirmar: (datos: ConfirmacionConsumo) => void;
  /** Abre el cuadre de una guía que se contradice a sí misma (ADR-353). */
  onCuadrar?: (woodEntryId: string, gtfNumber: string | null) => void;
  onClose: () => void;
}) {
  const [dia, setDia] = useState(fecha);
  const [observaciones, setObservaciones] = useState("");
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");

  /** Lo que va a entrar de verdad tras sacar las que se descartaron acá. */
  const finales = useMemo(() => trozas.filter((t) => !quitadas.has(t.id)), [trozas, quitadas]);
  const totales = useMemo(() => totalesSeleccion(finales), [finales]);
  const porGuia = useMemo(() => agruparPorGuia(finales), [finales]);
  const avisos = useMemo(() => avisosSeleccion(finales), [finales]);
  /**
   * El tope de I2, ANTES de firmar (ADR-353).
   *
   * El servidor rechaza el acta que se pasa del volumen que la guía declara. Que
   * eso aparezca recién al apretar «Consumir» —después de elegir seis trozas— es
   * llegar tarde: acá se ve mientras se arma, con la guía culpable señalada.
   */
  const cupos = useMemo(() => cuposDeGuia(finales), [finales]);
  const excesos = useMemo(() => cupos.filter((c) => c.exceso > 0), [cupos]);

  const listadas = useMemo(() => {
    const q = norm(busqueda);
    if (!q) return finales;
    return finales.filter((t) =>
      [t.codigoPlanta, t.codificacion, t.especieComun, t.gtfNumber].some((c) => norm(c).includes(q)),
    );
  }, [finales, busqueda]);
  const { visibles, rango, porPagina, setPorPagina, ir } = usePaginacion(listadas);

  const futura = dia > hoyISO();
  /* Con un exceso, el acta NO se puede firmar: el servidor la va a rechazar y
     apretar para enterarse es el camino que este aviso viene a evitar. */
  const listo = finales.length > 0 && !guardando && !futura && excesos.length === 0;

  const firmar = () => {
    if (!listo) return;
    onConfirmar({
      fecha: dia,
      observaciones: observaciones.trim() || null,
      /* Sólo las que se AGREGAN: las que el lote ya tenía las toma el servidor
         de todos modos, mandarlas otra vez sería pedir dos veces lo mismo. */
      trozaIds: finales.filter((t) => !yaEnElLote.has(t.id)).map((t) => t.id),
    });
  };

  /* Ctrl+Enter firma: la mano del operador está en el teclado del patio, no en
     el mouse. Escape y click afuera los maneja el modal. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        firmar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="info"
      icon={Flame}
      title={`Consumir ${finales.length} troza${finales.length === 1 ? "" : "s"} en el lote ${lote.code}`}
      description={`Entran a la sierra el ${fmtDia(dia)} · ${lote.speciesCommon}`}
      footer={
        <ModalFooter
          error={error}
          nota={
            <span className="font-mono tabular-nums">
              {totales.piezas} pza · {fmtM3(totales.volumenM3)} m³ ·{" "}
              {pieTablarDe(totales.volumenM3).toLocaleString("es-PE")} pt · {totales.guias} guía
              {totales.guias === 1 ? "" : "s"}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </Btn>
          <Btn variant="primary" onClick={firmar} disabled={!listo} title="Ctrl + Enter">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            Consumir
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {/* Las cuatro cifras del acta, antes que cualquier tabla. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cifra
            icon={PackageOpen}
            label="Piezas"
            valor={totales.piezas.toLocaleString("es-PE")}
            detalle={
              quitadas.size > 0
                ? `${quitadas.size} ${quitadas.size === 1 ? "sacada" : "sacadas"} acá`
                : `${yaEnElLote.size} ya en el lote`
            }
          />
          <Cifra icon={TreePine} label="Volumen" valor={`${fmtM3(totales.volumenM3)} m³`} detalle={`${pieTablarDe(totales.volumenM3).toLocaleString("es-PE")} pt`} />
          <Cifra icon={Layers} label="Especies" valor={String(totales.especies)} detalle={lote.speciesCommon} />
          <Cifra
            icon={CalendarDays}
            label="Guías de origen"
            valor={String(totales.guias)}
            detalle={totales.guias === 1 ? "respalda el consumo" : "respaldan el consumo"}
          />
        </div>

        <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Al consumir, estas piezas dejan el patio y quedan en el libro con la fecha elegida. Se abre la corrida del lote{" "}
          <b className="font-mono text-[var(--text-primary)]">{lote.code}</b> con esta materia prima;{" "}
          <b>lo producido se declara después</b>, en Producción.
        </p>

        {/* Fecha y observación se deciden acá: cerrar el modal para corregir la
            fecha del filtro y volver a elegir todo era el camino largo. */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <label className="text-sm">
            <span className="font-bold text-[var(--text-secondary)]">Fecha del consumo</span>
            <input
              type="date"
              value={dia}
              max={hoyISO()}
              onChange={(e) => setDia(e.target.value)}
              aria-label="Fecha del consumo"
              className={`${CAMPO} mt-1`}
            />
          </label>
          <label className="text-sm">
            <span className="font-bold text-[var(--text-secondary)]">
              Observación <span className="font-normal text-[var(--text-tertiary)]">(casillero 11 del libro)</span>
            </span>
            <input
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              maxLength={500}
              placeholder="Turno, sierra, quién cargó…"
              aria-label="Observación del consumo"
              className={`${CAMPO} mt-1`}
            />
          </label>
        </div>

        {futura && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Esa fecha todavía no llegó: el libro registra lo que ya pasó.
          </p>
        )}

        {/* Lo que no va a entrar, con su causa y qué hacer (ADR-353). Cuando el
            problema es que el documento se contradice, el arreglo va ACÁ: mandar
            a otra pestaña por un botón que podemos poner al lado es fricción. */}
        {excesos.map((c) => (
          <div
            key={c.woodEntryId}
            className="flex flex-wrap items-start gap-2 rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{motivoDeCupo(c)}</span>
            {c.descuadrado && onCuadrar && (
              <Btn variant="secondary" onClick={() => onCuadrar(c.woodEntryId, c.gtfNumber)} disabled={guardando}>
                <Scale className="h-4 w-4" /> Cuadrar la guía
              </Btn>
            )}
          </div>
        ))}

        {avisos.map((a) => (
          <p
            key={a}
            className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {a}
          </p>
        ))}

        {/* De qué guías sale: es lo que el libro registra como consumo (Sección 2). */}
        <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
          <div className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Consumo por guía · lo que va a la Sección 2 del libro
          </div>
          <DataTable className="w-full text-sm">
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {porGuia.map((g) => {
                const cupo = cupos.find((c) => c.woodEntryId === g.woodEntryId);
                const pasado = (cupo?.exceso ?? 0) > 0;
                return (
                  <tr key={g.woodEntryId} className={pasado ? "bg-[var(--data-error-500)]/8" : undefined}>
                    <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{g.gtfNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{g.especie ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {g.piezas} pza
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">
                      <span className={pasado ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"}>
                        {fmtM3(g.volumenM3)} m³
                      </span>
                      {/* El cupo al lado del pedido: es la comparación que
                          decide, y separada en dos lugares no se hace. */}
                      {cupo?.disponible != null && (
                        <div className="text-xs font-normal text-[var(--text-tertiary)]">
                          de {fmtM3(cupo.disponible)} sin consumir
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {porGuia.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                    Sacaste todas las piezas: no hay nada que consumir.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </div>

        {/* Pieza por pieza: es lo que se cuenta en la pila. Con la lupa y el
            tope de filas del resto del libro (ADR-344). */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Con cuatro piezas a la vista, un buscador es una caja vacía más. */}
          {finales.length >= 8 && (
          <label className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar una pieza del acta…"
              aria-label="Buscar una pieza del acta"
              className={`${CAMPO} pl-9`}
            />
          </label>
          )}
          {quitadas.size > 0 && (
            <button
              type="button"
              onClick={() => setQuitadas(new Set())}
              className="text-sm font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
            >
              {quitadas.size === 1 ? "Devolver la que saqué" : `Devolver las ${quitadas.size} que saqué`}
            </button>
          )}
        </div>

        <TablaCtp>
          <TheadCtp>
            <tr>
              <th className="px-3 py-2 font-bold">Cód. planta</th>
              <th className="px-3 py-2 font-bold">Codificación</th>
              <th className="px-3 py-2 font-bold">Especie</th>
              <th className="px-3 py-2 font-bold">Guía</th>
              <th className="px-3 py-2 text-right font-bold">Volumen</th>
              {/* El `sr-only` va en el texto, no en la celda: sobre un `th` lo
                  saca del flujo y la columna se desarma. */}
              <th className="px-3 py-2"><span className="sr-only">Sacar del acta</span></th>
            </tr>
          </TheadCtp>
          <TbodyCtp>
            {visibles.length === 0 && (
              <FilaVacia cols={6}>
                {finales.length === 0 ? "No queda ninguna pieza en el acta." : "Ninguna pieza coincide con la búsqueda."}
              </FilaVacia>
            )}
            {visibles.map((t) => {
              const fija = yaEnElLote.has(t.id);
              return (
                <tr key={t.id} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{t.codigoPlanta ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codificacion ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[var(--text-tertiary)]">{t.gtfNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                    {t.volumenM3 != null ? fmtM3(Number(t.volumenM3)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {fija ? (
                      /* Ya está apartada en el lote: el servidor la consume igual.
                         Un botón que no la sacara de verdad sería una mentira. */
                      <span
                        className="rounded-lg bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                        title="Ya estaba apartada en el lote: se quita desde la ficha del lote"
                      >
                        en el lote
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setQuitadas((prev) => new Set(prev).add(t.id))}
                        aria-label={`Sacar del acta la troza ${t.codigoPlanta ?? t.codificacion ?? ""}`}
                        title="Sacar del acta"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </TbodyCtp>
        </TablaCtp>

        <CtpPaginacion
          rango={rango}
          porPagina={porPagina}
          onPorPagina={setPorPagina}
          onIr={ir}
          sustantivo="pieza"
          extra={
            <span className="font-mono tabular-nums">
              {fmtM3(totales.volumenM3)} m³ entran a la sierra
            </span>
          }
        />
      </ModalBody>
    </AdminModal>
  );
}
