"use client";

/**
 * Lo que declara el libro ANTES de escribirlo: la existencia que trae el
 * inventario y cómo va a quedar el aserradero (ingresó, se aserró, queda…).
 *
 * El libro dice qué PASÓ y el inventario qué HAY: van en bloques separados
 * para que la existencia no parezca un movimiento más. Sale del modal del
 * import (19-10), que pasaba las 800 líneas.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { FilaParseada, FormatoCtp } from "@/lib/forestal/ctp-formatos-serfor";
import { estadoDelLibro } from "@/lib/forestal/ctp-cadena-import";

type FilasDe = (f: FormatoCtp) => FilaParseada[] | undefined;

function resumirInv(filasDe: FilasDe, f: FormatoCtp) {
  const filas = filasDe(f)?.filter((x) => x.problemas.length === 0);
  if (!filas?.length) return null;
  return {
    m3: Math.round(filas.reduce((s, x) => s + (Number(x.datos.volumenM3) || 0), 0) * 1000) / 1000,
    piezas: filas.length,
    especies: new Set(filas.map((x) => String(x.datos.especie ?? "").trim().toLowerCase()).filter(Boolean)).size,
  };
}

export default function LoQueDeclaraElLibro({ filasDe, hay }: { filasDe: FilasDe; hay: boolean }) {
  if (!hay) return null;
  const invRolliza = resumirInv(filasDe, "inventarioTrozas");
  const invAserrada = resumirInv(filasDe, "inventarioAserrada");
  const inventario = invRolliza || invAserrada ? { rolliza: invRolliza, aserrada: invAserrada } : null;
  const estado = estadoDelLibro({
    ingresos: filasDe("ingresos"),
    consumos: filasDe("consumos"),
    produccion: filasDe("produccion"),
    salidas: filasDe("salidas"),
  });

  return (
    <>
    {/* ── Qué existencia declara el inventario ─────────────────────── */}
    {inventario && (
      <div className="space-y-2 rounded-xl border border-[var(--data-success)]/30 bg-[var(--data-success)]/5 p-4">
        <p className="text-base font-extrabold text-[var(--text-primary)]">Existencia que vas a cargar</p>
        <dl className="grid grid-cols-2 gap-3">
          {inventario.rolliza && (
            <div>
              <dt className="text-sm font-semibold text-[var(--text-tertiary)]">Rolliza en patio</dt>
              <dd className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                {formatNumber(inventario.rolliza.m3, { max: 3 })} m³
              </dd>
              <dd className="text-sm text-[var(--text-tertiary)]">
                {inventario.rolliza.piezas} trozas · {inventario.rolliza.especies} especies
              </dd>
            </div>
          )}
          {inventario.aserrada && (
            <div>
              <dt className="text-sm font-semibold text-[var(--text-tertiary)]">Aserrada en depósito</dt>
              <dd className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                {formatNumber(inventario.aserrada.m3, { max: 3 })} m³
              </dd>
              <dd className="text-sm text-[var(--text-tertiary)]">
                {inventario.aserrada.piezas} paquetes · {inventario.aserrada.especies} especies
              </dd>
            </div>
          )}
        </dl>
        {/* El número contra el que hay que cuadrarlo: sin decir de dónde
            sale, el operador no sabe si su inventario está bien. */}
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          Cotéjalo contra el SNIFFS.
          <InfoTip icono="ayuda" title="Contra qué se cuadra" what="Contra el «Saldo Inicial» del Cuadro Resumen 2 del SNIFFS (aserrada) y el saldo de trozas del Cuadro 1. Si no coinciden, falta o sobra algo en el conteo." />
        </p>
      </div>
    )}

    {/* ── Cómo va a quedar el aserradero ───────────────────────────── */}
    {estado && (estado.ingresadoM3 > 0 || estado.consumidoM3 > 0 || estado.producidoM3 > 0) && (
      <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-base font-extrabold text-[var(--text-primary)]">
          Lo que declara este libro
          {estado.lotes > 0 && (
            <span className="ml-2 text-sm font-semibold text-[var(--text-tertiary)]">
              · {estado.lotes} lote{estado.lotes === 1 ? "" : "s"} de producción
            </span>
          )}
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { t: "Ingresó", v: estado.ingresadoM3, sub: "materia prima" },
            { t: "Se aserró", v: estado.consumidoM3, sub: "consumido" },
            { t: "Queda en patio", v: estado.enPatioM3, sub: "rolliza disponible", ojo: estado.enPatioM3 < 0 },
            { t: "Se produjo", v: estado.producidoM3, sub: "aserrada" },
            { t: "Se despachó", v: estado.despachadoM3, sub: "con guía, a terceros" },
            ...(estado.consumoInternoM3 > 0
              ? [{ t: "Consumo interno", v: estado.consumoInternoM3, sub: "marcado C/I en el libro" }]
              : []),
            { t: "Queda en depósito", v: estado.enDepositoM3, sub: "sin despachar", ojo: estado.enDepositoM3 < 0 },
          ].map((k) => (
            <div key={k.t}>
              <dt className="text-sm font-semibold text-[var(--text-tertiary)]">{k.t}</dt>
              <dd
                className={`text-lg font-extrabold tabular-nums ${
                  k.ojo ? "text-[var(--data-error)]" : "text-[var(--text-primary)]"
                }`}
              >
                {formatNumber(k.v, { max: 3 })} m³
              </dd>
              <dd className="text-sm text-[var(--text-tertiary)]">{k.sub}</dd>
            </div>
          ))}
        </dl>
        {estado.aperturaNecesariaM3 > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[var(--data-warning)]/10 px-3 py-2 text-base font-semibold text-[var(--text-primary)]">
            Este libro arranca a mitad: faltan al menos{" "}
            <strong className="tabular-nums">
              {formatNumber(estado.aperturaNecesariaM3, { max: 3 })} m³
            </strong>{" "}
            de existencia inicial{" "}
            <span className="font-normal text-[var(--text-secondary)]">
              (mínimo estimado — el real lo declara el Saldo Inicial del Cuadro 2)
            </span>
            .
            <InfoTip
              icono="ayuda"
              title="Libro que arranca a mitad"
              what="Despacha producto aserrado antes de la primera corrida que declara, así que el depósito no puede empezar en cero."
              example="Baja el «Saldo Inicial» del Cuadro Resumen 2 del SNIFFS y cárgalo como existencia de apertura."
            />
          </p>
        )}
        {estado.rendimientoPct != null && (
          <p className="text-base text-[var(--text-secondary)]">
            Rendimiento del libro:{" "}
            <strong className="tabular-nums text-[var(--text-primary)]">{estado.rendimientoPct}%</strong>
            <span className="text-sm text-[var(--text-tertiary)]"> · un aserradero rinde entre 45 y 60%</span>
          </p>
        )}
      </div>
    )}
    </>
  );
}
