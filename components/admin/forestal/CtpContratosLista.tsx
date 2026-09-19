"use client";

/**
 * La lista de contratos del libro (ADR-421).
 *
 * Una fila por papel: el código —que es la llave con la que se trabaja—, de
 * quién es, qué tipo de permiso es y hasta cuándo vale. Elegir uno abre su
 * balance.
 *
 * Dual-render: tabla en escritorio, tarjetas abajo de 640px. En el celular una
 * tabla de seis columnas obliga a hacer scroll lateral para leer el titular, y
 * el titular es la mitad de la identidad del contrato.
 */

import { useMemo, useState } from "react";
import { ChevronRight, FileSignature, Search } from "@buleje/design-system/icons";
import { DataTable, EmptyState } from "@buleje/design-system";
import type { Contrato } from "@/lib/forestal/contratos";
import { ESTADO_CLASE, ESTADO_LABEL, TIPO_LABEL, vigenciaTexto } from "./contratos-ui";

/* Sin constantes de padding ni de tipografía: `DataTable` pinta `thead`, `td`
   y `tfoot` con variantes descendientes (`[&_tbody_td]:px-3`) que le GANAN por
   especificidad a la clase puesta en el hijo. Lo único que hay que decir acá es
   la alineación —el DS la respeta explícitamente— y el color del texto. */
const TD = "text-[var(--text-secondary)]";

function EstadoChip({ contrato }: { contrato: Contrato }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${ESTADO_CLASE[contrato.estado]}`}
    >
      {ESTADO_LABEL[contrato.estado]}
    </span>
  );
}

export default function CtpContratosLista({
  contratos,
  onElegir,
}: {
  contratos: Contrato[];
  onElegir: (c: Contrato) => void;
}) {
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contratos;
    return contratos.filter((c) =>
      [c.codigo, c.alias ?? "", c.titularNombre, c.region ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [contratos, busqueda]);

  if (contratos.length === 0) {
    return (
      <EmptyState
        icon={FileSignature}
        title="Todavía no hay contratos cargados"
        description="Un contrato es el papel bajo el que se trabaja: el permiso, la concesión o el plan que ampara la madera. Cuando el libro tenga códigos escritos, acá arriba aparece la banda para crearlos de una."
      />
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
        <Search className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código, alias, titular o región…"
          aria-label="Buscar un contrato"
          className="h-12 min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none"
        />
      </label>

      {/* ── Escritorio (≥640px) ── */}
      <DataTable wrapperClassName="hidden rounded-2xl bg-[var(--surface-raised)] sm:block">
        <thead>
          <tr>
            <th scope="col">Código del permiso</th>
            <th scope="col">Titular</th>
            <th scope="col">Tipo</th>
            <th scope="col">Estado</th>
            <th scope="col">Vigencia</th>
            <th scope="col" className="text-right">
              Balance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {visibles.map((c) => (
            <tr key={c.id} className="transition-colors hover:bg-[var(--surface-sunken)]">
              <td className={TD}>
                {/* El código ES el enlace al balance: en el libro se habla del
                      contrato por su código, no por una columna «acción». */}
                <button
                  type="button"
                  onClick={() => onElegir(c)}
                  className="whitespace-nowrap text-left font-mono text-sm font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
                >
                  {c.codigo}
                </button>
                {c.alias && (
                  <span className="block text-xs text-[var(--text-tertiary)]">{c.alias}</span>
                )}
              </td>
              <td className={TD}>
                <span className="font-semibold text-[var(--text-primary)]">{c.titularNombre}</span>
                {c.region && (
                  <span className="block text-xs text-[var(--text-tertiary)]">{c.region}</span>
                )}
              </td>
              <td className={TD}>{c.tipo ? TIPO_LABEL[c.tipo] : "—"}</td>
              <td className={TD}>
                <EstadoChip contrato={c} />
              </td>
              <td className={TD}>{vigenciaTexto(c.vigenciaDesde, c.vigenciaHasta)}</td>
              <td className={`${TD} text-right`}>
                <button
                  type="button"
                  onClick={() => onElegir(c)}
                  aria-label={`Ver el balance de ${c.codigo}`}
                  className="inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  Ver balance <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      {/* ── Celular (<640px): una tarjeta por contrato ── */}
      <ul className="space-y-2 sm:hidden">
        {visibles.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onElegir(c)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
            >
              <span className="min-w-0">
                <span className="block break-all font-mono text-sm font-bold text-[var(--text-primary)]">
                  {c.codigo}
                </span>
                <span className="block text-sm font-medium text-[var(--text-secondary)]">
                  {c.titularNombre}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <EstadoChip contrato={c} />
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {c.tipo ? TIPO_LABEL[c.tipo] : "Tipo sin definir"}
                  </span>
                </span>
                <span className="block text-xs text-[var(--text-tertiary)]">
                  {vigenciaTexto(c.vigenciaDesde, c.vigenciaHasta)}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {visibles.length === 0 && (
        <p className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-8 text-center text-base text-[var(--text-tertiary)]">
          Ningún contrato coincide con «{busqueda}».
        </p>
      )}
    </div>
  );
}
