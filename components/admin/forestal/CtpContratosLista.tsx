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
import { resumirBalance, type BalanceContrato, type Contrato } from "@/lib/forestal/contratos";
import { ESTADO_CLASE, ESTADO_LABEL, soles, TIPO_LABEL, vigenciaTexto } from "./contratos-ui";

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

/**
 * Las cuatro celdas de plata de una fila.
 *
 * «Puesto» es lo que salió del bolsillo (madera + gastos + fletes + adelantos)
 * y «Ganancia neta» es lo vendido menos eso. Sin ninguna venta cargada la
 * ganancia va «—», NO en negativo: un contrato con gastos y sin despachos no
 * perdió esa plata, todavía no vendió — la madera está en el patio. Y si hay
 * ingresos sin precio, se avisa: el «puesto» está incompleto y el número
 * de abajo saldría mejor de lo que es.
 */
function CeldasDePlata({ balance }: { balance?: BalanceContrato }) {
  if (!balance) {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <td key={i} className={`${TD} text-right text-[var(--text-tertiary)]`}>
            —
          </td>
        ))}
      </>
    );
  }
  const r = resumirBalance(balance);
  const m3 = balance.madera.m3 ?? 0;
  return (
    <>
      <td className={`${TD} text-right`}>
        {m3 > 0 ? (
          <>
            <span className="whitespace-nowrap font-mono font-bold tabular-nums text-[var(--text-primary)]">
              {m3.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³
            </span>
            <span className="block whitespace-nowrap text-xs text-[var(--text-tertiary)]">
              {balance.madera.documentos} {balance.madera.documentos === 1 ? "ingreso" : "ingresos"}
            </span>
          </>
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        )}
      </td>
      <td className={`${TD} text-right`}>
        <span className="whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
          {r.egresos > 0 ? soles(r.egresos) : "—"}
        </span>
        {(balance.madera.sinValorizar ?? 0) > 0 && (
          <span
            title={`${balance.madera.sinValorizar} ingresos de madera todavía no tienen precio: lo puesto es mayor que esto`}
            className="block whitespace-nowrap text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          >
            faltan {balance.madera.sinValorizar} precios
          </span>
        )}
      </td>
      <td className={`${TD} text-right`}>
        <span className="whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
          {balance.ventas.documentos > 0 ? soles(balance.ventas.monto) : "—"}
        </span>
        {balance.ventas.documentos > 0 && (
          <span className="block whitespace-nowrap text-xs text-[var(--text-tertiary)]">
            {balance.ventas.documentos} {balance.ventas.documentos === 1 ? "despacho" : "despachos"}
          </span>
        )}
      </td>
      <td className={`${TD} text-right`}>
        {r.ganancia == null ? (
          <span
            title="Todavía no hay ningún despacho con precio de venta cargado: no hay con qué comparar lo puesto."
            className="whitespace-nowrap text-[var(--text-tertiary)]"
          >
            sin ventas
          </span>
        ) : (
          <>
            <span
              className={`whitespace-nowrap font-mono font-bold tabular-nums ${
                r.ganancia >= 0
                  ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              }`}
            >
              {soles(r.ganancia)}
            </span>
            {r.margenPct != null && (
              <span className="block whitespace-nowrap text-xs text-[var(--text-tertiary)]">
                {r.margenPct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de lo vendido
              </span>
            )}
          </>
        )}
      </td>
    </>
  );
}

export default function CtpContratosLista({
  balances,
  contratos,
  onElegir,
}: {
  contratos: Contrato[];
  /** El balance de cada contrato por id. Ausente = todavía cargando. */
  balances?: Record<string, BalanceContrato>;
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
            {/* La plata del contrato. Tres columnas y no una: «ganó tanto» sin
                mostrar lo puesto ni lo vendido es un número que nadie puede
                discutir — y el que discute un balance es el dueño del permiso. */}
            <th scope="col" className="text-right">Madera</th>
            <th scope="col" className="text-right">Puesto</th>
            <th scope="col" className="text-right">Vendido</th>
            <th scope="col" className="text-right">Ganancia neta</th>
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
              <CeldasDePlata balance={balances?.[c.id]} />
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
