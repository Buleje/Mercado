"use client";

/**
 * «Libros para el contador»: el mes, el libro (ventas 14.1, compras 8.1,
 * kardex 13.1), sus totales, las primeras filas y la descarga en Excel o TXT.
 * Todo sale de `GET /api/admin/contabilidad/libros`; esta vista no calcula nada.
 */
import { useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Loader2 } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { limaDateKey } from "@/lib/utils";
import type { LibroId } from "@/lib/contabilidad/libros/comun";
import { useLibrosContador } from "./use-libros-contador";
import { LIBROS, mesAnterior } from "./libros-contador-config";
import { NotasLibro, TablaLibro, TotalesLibro } from "./VistaPreviaLibro";

const BOTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:opacity-60";

export default function LibrosContador() {
  const hoy = limaDateKey().slice(0, 7);
  const [periodo, setPeriodo] = useState(() => mesAnterior(limaDateKey()));
  const [libro, setLibro] = useState<LibroId>("ventas");
  const { estado, bajando, errorDescarga, descargar } = useLibrosContador(libro, periodo);
  const actual = LIBROS.find((l) => l.value === libro);

  return (
    <section className="space-y-4" data-vista="libros-contador">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <SectionTitle>Libros para el contador</SectionTitle>
          <InfoTip
            title="Libros para el contador"
            what="El registro de ventas (formato 14.1), el de compras (8.1) y el kardex valorizado (13.1) del mes, con las columnas que pide SUNAT."
            affects="Solo lee. Es un documento de trabajo: tu contador lo cruza con la propuesta del SIRE o lo pasa a su sistema; no es el TXT oficial del PLE ni del SIRE."
            example="Eliges setiembre, miras el total de ventas y tocas «Excel» para mandárselo a tu contador."
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
          Mes
          <input
            type="month"
            value={periodo}
            max={hoy}
            onChange={(e) => e.target.value && setPeriodo(e.target.value)}
            className="h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <SegmentedControl<LibroId>
          value={libro}
          onChange={setLibro}
          options={LIBROS.map((l) => ({ value: l.value, label: `${l.label} ${l.formato}` }))}
          label="Libro"
        />
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={bajando !== null || estado.fase !== "lista"}
            onClick={() => void descargar("xlsx")}
            className={`${BOTON} bg-[var(--accent-dark)] text-white shadow-sm hover:brightness-110`}
            title={`Bajar el ${actual?.ayuda ?? "libro"} en Excel, con todas las columnas y una hoja de notas`}
          >
            {bajando === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />}
            Excel
          </button>
          <button
            type="button"
            disabled={bajando !== null || estado.fase !== "lista"}
            onClick={() => void descargar("txt")}
            className={`${BOTON} border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]`}
            title="TXT de trabajo separado por «|» (no es el archivo oficial del PLE ni del SIRE)"
          >
            {bajando === "txt" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
            TXT de trabajo
          </button>
        </div>
      </div>

      {errorDescarga && (
        <p role="alert" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--data-error-700)]">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {errorDescarga}
        </p>
      )}

      {estado.fase === "cargando" && (
        <p className="inline-flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Armando el libro…
        </p>
      )}
      {estado.fase === "error" && (
        <p role="alert" className="inline-flex items-center gap-2 py-6 text-sm font-medium text-[var(--data-error-700)]">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {estado.mensaje}
        </p>
      )}
      {estado.fase === "lista" && (
        <>
          <TotalesLibro datos={estado.datos} />
          <TablaLibro datos={estado.datos} />
          <NotasLibro notas={estado.datos.notas} />
        </>
      )}
    </section>
  );
}
