"use client";

/**
 * «Cubicar Oxapampa» — la planilla con que el aserradero mide cada troza de una
 * guía en pulgadas y pies y saca su pie tablar (Brandon, 2026-09-26: «la
 * cubicación smaliana de la guía es sólo para proceso interno, la oxapampina
 * es con la que trabajo con dueños, compras, ventas, flete»).
 *
 * Una fila por troza, celdas D1″ · D2″ · L′ como Excel (Enter/Tab avanzan,
 * ↑ ↓ cambian de fila, coma o punto decimal), el PT de cada fila en vivo con
 * la MISMA `ptOxapampa` que congela el servidor, y el total abajo. Si la guía
 * no trajo D1/D2 en cm, se pueden cargar acá (sólo sobre vacío).
 *
 * Se abre desde la ficha de la guía (encima de ella: `aboveModals`) y desde el
 * menú «Más» de la guía. «Guardar» manda sólo lo que cambió.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Ruler, Save, Search } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import { Btn, ModalBody, ModalFooter, useAtajoGuardar, useCierreSeguro } from "./ctp-shared";
import type { TrozaDeFicha } from "./CtpGuiaFichaModal";
import { CabeceraPlanilla, FilaOxapampa } from "./ctp-cubicar-oxapampa-fila";
import { usePlanillaOxapampa, type ResultadoPlanilla } from "./hooks/use-planilla-oxapampa";

const PASTILLA =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]";
const pastilla = (activo: boolean) =>
  `${PASTILLA} ${
    activo
      ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent-ink)]"
      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
  }`;

/** Enter/Tab como Excel: a la celda siguiente (y a la fila siguiente); ↑ ↓ en la misma columna. */
function moverFoco(e: React.KeyboardEvent<HTMLInputElement>, caja: HTMLElement | null) {
  if (e.ctrlKey || e.metaKey || e.altKey || !caja) return;
  if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const el = e.currentTarget;
  const celdas = [...caja.querySelectorAll<HTMLInputElement>("input[data-celda]:not(:disabled)")];
  let destino: HTMLInputElement | undefined;
  if (e.key === "Enter") {
    destino = celdas[celdas.indexOf(el) + (e.shiftKey ? -1 : 1)];
  } else {
    const columna = celdas.filter((c) => c.dataset.celda === el.dataset.celda);
    destino = columna[columna.indexOf(el) + (e.key === "ArrowDown" ? 1 : -1)];
  }
  e.preventDefault();
  if (!destino) return;
  destino.focus();
  destino.select();
  destino.scrollIntoView({ block: "nearest" });
}

export default function CtpCubicarOxapampaModal({
  contexto,
  trozas,
  aboveModals = false,
  onGuardado,
  onClose,
}: {
  /** «Guía 019-0000003 · Proveedor»: debajo del título. */
  contexto: string;
  /** Las piezas de la guía; `null` mientras cargan. */
  trozas: TrozaDeFicha[] | null;
  /** Abierto desde la ficha de la guía (otro modal). */
  aboveModals?: boolean;
  /** Se guardó algo: la lista de atrás relee sus trozas. */
  onGuardado?: (r: ResultadoPlanilla) => void;
  onClose: () => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [soloSinCubicar, setSoloSinCubicar] = useState(false);
  /* Apagada, los cm tipeados no viajan ni cuentan (se quedan en la fila). */
  const [conCm, setConCm] = useState(false);
  const p = usePlanillaOxapampa(trozas, { conCm });
  const cajaRef = useRef<HTMLDivElement>(null);

  const faltanCm = useMemo(
    () =>
      (trozas ?? []).filter((t) => !t.noRecepcionada && (t.d1Cm == null || t.d2Cm == null)).length,
    [trozas],
  );
  const sinCubicar = useMemo(
    () => (p.bases ? [...p.bases.values()].filter((b) => !((b.oxPt ?? 0) > 0)).length : 0),
    [p.bases],
  );

  /* «Sin cubicar» mira lo GUARDADO, no lo tipeado: una fila no se esconde
     mientras la estás llenando. */
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (trozas ?? [])
      .map((t, i) => ({ t, n: i + 1 }))
      .filter(({ t }) => {
        if (
          q &&
          !`${t.codificacion ?? ""} ${t.codigoPlanta ?? ""} ${t.especieComun ?? ""}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        if (soloSinCubicar && (p.bases?.get(t.id)?.oxPt ?? 0) > 0) return false;
        return true;
      });
  }, [trozas, buscar, soloSinCubicar, p.bases]);

  const onTecla = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => moverFoco(e, cajaRef.current),
    [],
  );

  /* Con teclado y mouse, el cursor arranca en la primera celda por medir. En el
     teléfono no: abrir el teclado solo tapa media planilla. */
  useEffect(() => {
    if (!p.listo || !window.matchMedia("(pointer: fine)").matches) return;
    const id = requestAnimationFrame(() => {
      const celdas = [
        ...(cajaRef.current?.querySelectorAll<HTMLInputElement>(
          'input[data-celda="d1"]:not(:disabled)',
        ) ?? []),
      ];
      (celdas.find((c) => c.value === "") ?? celdas[0])?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [p.listo]);

  const guardar = useCallback(async () => {
    const r = await p.guardar();
    if (r) onGuardado?.(r);
  }, [p, onGuardado]);

  const nCambios = p.cambios.length;
  const nErrores = p.errores.size;
  const puedeGuardar = nCambios > 0 && nErrores === 0 && !p.guardando;
  const bodyRef = useAtajoGuardar(() => void guardar(), puedeGuardar);
  /* Sobre lo TIPEADO, no sobre `cambios`: una fila en rojo no viaja, pero
     cerrar igual la pierde. */
  const cerrar = useCierreSeguro(p.sinGuardar > 0 && !p.guardando, onClose);

  return (
    <AdminModal
      open
      onClose={p.guardando ? () => {} : () => void cerrar()}
      aboveModals={aboveModals}
      variant="info"
      className="sm:max-w-[62rem]"
      icon={Ruler}
      title="Cubicar Oxapampa"
      description={contexto}
      claveVentana="ctp-cubicar-oxapampa"
      footer={
        <ModalFooter
          error={p.error}
          nota={
            <span aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
              <span className="font-mono text-lg font-bold text-[var(--text-primary)]">
                {fmtPt(p.total.pt)} PT
              </span>
              <span>
                {p.total.cubicadas} de {p.total.total} cubicadas
              </span>
              {p.aMedias > 0 && (
                <span className="font-semibold text-[var(--data-warning-ink)]">
                  · {p.aMedias} a medias
                </span>
              )}
              {nErrores > 0 ? (
                <span className="font-semibold text-[var(--data-error-ink)]">
                  · {nErrores === 1 ? "1 fila" : `${nErrores} filas`} con error
                </span>
              ) : nCambios > 0 ? (
                <span className="font-semibold text-[var(--accent-ink)]">
                  · {nCambios} sin guardar
                </span>
              ) : p.ultimo ? (
                <span className="font-semibold text-[var(--data-success-ink)]">
                  · Guardado{p.ultimo.rechazadas > 0 ? ` (${p.ultimo.rechazadas} con rechazo)` : ""}
                </span>
              ) : null}
            </span>
          }
        >
          <Btn variant="secondary" onClick={() => void cerrar()} disabled={p.guardando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={!puedeGuardar}>
            {p.guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {nCambios > 0 ? `Guardar (${nCambios})` : "Guardar"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={bodyRef} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-11 min-w-0 flex-1 basis-[14rem] items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar código o especie"
              aria-label="Buscar troza por código o especie"
              className="h-full w-full min-w-0 bg-transparent text-base text-[var(--text-primary)] outline-none dark:bg-transparent focus-visible:[box-shadow:none]! focus-visible:outline-none!"
            />
          </label>
          <button
            type="button"
            aria-pressed={soloSinCubicar}
            onClick={() => setSoloSinCubicar((v) => !v)}
            className={pastilla(soloSinCubicar)}
          >
            Sin cubicar <span className="font-mono text-xs tabular-nums">{sinCubicar}</span>
          </button>
          {faltanCm > 0 && (
            <button
              type="button"
              aria-pressed={conCm}
              onClick={() => setConCm((v) => !v)}
              className={pastilla(conCm)}
            >
              D1/D2 en cm{" "}
              <span className="font-mono text-xs tabular-nums">{faltanCm} sin medir</span>
            </button>
          )}
          <InfoTip
            title="Fórmula Oxapampa"
            what="Mide las dos puntas en pulgadas y el largo en pies: PT = (promedio de las puntas)² × largo ÷ 24.5. Es la medida con que trabajas con dueños, compras, ventas y flete; la de la guía (Smalian, m³) queda para el libro."
            affects="El PT queda guardado en cada troza; si corriges una medida, se recalcula. Enter o Tab pasan a la celda siguiente, ↑ ↓ cambian de fila. Vaciar las tres celdas borra la cubicación."
            example="18″ y 22″, 12′ → promedio 20″ → 20² × 12 ÷ 24.5 = 196 PT"
          />
        </div>

        {trozas == null || !p.listo ? (
          <div className="space-y-2" aria-busy="true" aria-label="Cargando las trozas">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
            ))}
          </div>
        ) : trozas.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
            Esta guía no tiene trozas cargadas.
          </p>
        ) : (
          <div
            ref={cajaRef}
            role="table"
            aria-label="Planilla Oxapampa: una fila por troza"
            className="@container/planilla divide-y divide-[var(--rule-soft)] overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
          >
            <div role="rowgroup" className="bg-[var(--surface-sunken)]">
              <CabeceraPlanilla conCm={conCm} />
            </div>
            {visibles.length === 0 && (
              <div role="row">
                <div
                  role="cell"
                  className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]"
                >
                  Ninguna troza con ese filtro.
                </div>
              </div>
            )}
            {visibles.map(({ t, n }) => {
              const base = p.bases?.get(t.id);
              const fila = p.filas[t.id];
              if (!base || !fila) return null;
              return (
                <FilaOxapampa
                  key={t.id}
                  n={n}
                  troza={t}
                  base={base}
                  fila={fila}
                  errores={p.errores.get(t.id)}
                  rechazos={p.rechazos.get(t.id)}
                  conCm={conCm}
                  onSet={p.set}
                  onTecla={onTecla}
                />
              );
            })}
          </div>
        )}
      </ModalBody>
    </AdminModal>
  );
}
