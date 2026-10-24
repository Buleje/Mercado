"use client";

/**
 * Lo que se ve de «marcar filas» en el cubicador de madera (Brandon,
 * 2026-10-19): el botón «Marcar filas» de la banda de filtros (de la fila X a
 * la Y) y la barra al pie con la cuenta de lo marcado y «Eliminar». La lógica
 * vive en `hooks/use-marcar-filas.ts`.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Leaf, ListChecks, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { ResumenDeMarcadas } from "@/lib/forestal/seleccion-filas";
import CtpBarraSeleccion from "./ctp-barra-seleccion";

const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-base tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

const aNumero = (v: string): number | null => (v.trim() === "" ? null : Number(v.trim()));

/** «Marcar filas» → de la fila __ a la __, en cualquier sentido. */
export function MarcarFilasPorRango({ total, onMarcar }: {
  /** Filas del lote entero: el N° de la tabla va de 1 a esto. */
  total: number;
  /** Devuelve el error a mostrar, o `null` si marcó. */
  onMarcar: (desde: number | null, hasta: number | null) => string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState<string | null>(null);
  /* El botón cae a la izquierda o a la derecha según cómo se parta la banda
     (400 px: al final de la 3.ª línea). La cajita se abre hacia donde entra. */
  const [haciaIzquierda, setHaciaIzquierda] = useState(true);
  const cajaRef = useRef<HTMLDivElement>(null);
  const desdeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    desdeRef.current?.focus();
    const fuera = (e: PointerEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const err = onMarcar(aNumero(desde), aNumero(hasta));
    setError(err);
    if (!err) setAbierto(false);
  };

  return (
    <div ref={cajaRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHaciaIzquierda(r.right - Math.min(304, window.innerWidth - 32) >= 8);
          setAbierto((v) => !v);
          setError(null);
        }}
        aria-expanded={abierto}
        aria-label="Marcar filas"
        title="Marcar filas: de la N° tal a la N° tal"
        className={`inline-flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${abierto ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
      >
        <ListChecks className="h-4 w-4" aria-hidden />
        {/* Con la barra lateral abierta a 1280 la banda no entra en una fila:
            ícono + tooltip antes que partirla (ley de Brandon, regla 6). */}
        <span className="hidden @[64rem]:inline">Marcar filas</span>
      </button>
      {abierto && (
        <form
          onSubmit={enviar}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setAbierto(false); } }}
          aria-label="Marcar de una fila a otra"
          data-marcar-filas
          className={`absolute top-full z-20 mt-1 w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)] ${haciaIzquierda ? "right-0" : "left-0"}`}
        >
          <div className="mb-2 flex items-center gap-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">De una fila a otra</span>
            <InfoTip
              what="Escribe el N° de la tabla. Sirve en los dos sentidos: de la 50 a la 80 o de la 80 a la 50. Reemplaza lo que estaba marcado."
              affects="Lo marcado es también lo que sale en el PDF, el Excel y el Anexo 04."
              example="Shift+clic en dos casillas marca todo lo que hay entre ellas; Escape quita las marcas."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              Desde la fila
              <input ref={desdeRef} value={desde} onChange={(e) => setDesde(e.target.value)} inputMode="numeric" placeholder="1" aria-invalid={error != null} className={`mt-1 ${CAMPO}`} />
            </label>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              Hasta la fila
              <input value={hasta} onChange={(e) => setHasta(e.target.value)} inputMode="numeric" placeholder={String(total)} aria-invalid={error != null} className={`mt-1 ${CAMPO}`} />
            </label>
          </div>
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
          <button
            type="submit"
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <ListChecks className="h-4 w-4" aria-hidden /> Marcar
          </button>
        </form>
      )}
    </div>
  );
}

const fmtM3 = (v: number) => formatNumber(v, 3);
const fmtPt = (v: number) => formatNumber(v, 2);

/** La cuenta de lo marcado, al pie, con «Eliminar», «Poner especie» y «Quitar marcas». */
export function BarraFilasMarcadas({ resumen, onEliminar, onQuitar, onPonerEspecie }: {
  resumen: ResumenDeMarcadas;
  onEliminar: () => void;
  onQuitar: () => void;
  /** Abre la ventanita de «Poner especie» sobre lo marcado (24-10). */
  onPonerEspecie?: () => void;
}) {
  const { filas, piezas, pt, m3, especies } = resumen;
  return (
    <CtpBarraSeleccion
      cifras={[
        { label: filas === 1 ? "Fila" : "Filas", valor: String(filas) },
        { label: "Piezas", valor: String(piezas) },
        { label: "Pie tablar", valor: fmtPt(pt) },
        { label: "m³", valor: fmtM3(m3), fuerte: true },
      ]}
      accionLabel={`Eliminar ${filas} ${filas === 1 ? "fila" : "filas"}`}
      accionIcon={Trash2}
      accionPeligro
      onAccion={onEliminar}
      accionesSecundarias={onPonerEspecie ? [{ label: "Poner especie", icon: Leaf, onClick: onPonerEspecie }] : undefined}
      onLimpiar={onQuitar}
      limpiarLabel="Quitar marcas"
      detalle={
        <span className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-sm sm:flex-wrap sm:overflow-visible sm:pb-0" data-desglose-especies>
          {especies.map((e) => (
            <span key={e.especie ?? ""} className="shrink-0 whitespace-nowrap rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 text-[var(--text-secondary)]">
              <b className="font-semibold text-[var(--text-primary)]">{e.especie ?? "Sin especie"}</b>
              <span className="font-mono tabular-nums"> · {e.piezas} {e.piezas === 1 ? "pza" : "pzas"} · {fmtM3(e.m3)} m³</span>
            </span>
          ))}
          <InfoTip
            what="Lo marcado es también lo que sale en el PDF, el Excel y el Anexo 04. El m³ sale del pie tablar (÷ 424), igual que el total de la tabla."
            example="Shift+clic marca un tramo; Shift+Espacio en una celda marca su fila; Escape quita las marcas."
          />
        </span>
      }
    />
  );
}
