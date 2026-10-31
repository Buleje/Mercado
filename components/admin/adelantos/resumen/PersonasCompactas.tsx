"use client";

/**
 * Cuenta por persona en corto (25-10): las 5 cuentas más grandes, una línea
 * cada una, y un enlace a Personas. El Resumen dice qué hacer («Hoy toca»);
 * la cuenta entera de cada uno vive en Personas.
 *
 * «Ver las N y liquidar» despliega la cuenta completa ahí mismo
 * (`CuentasPorPersona`), porque Liquidar vive en ella: la Caja de Mi Plata y
 * «Por pagar» mandan `?accion=liquidar&persona=` a esta vista. Si llega ese
 * pedido, arranca desplegada y la cuenta completa lo atiende como siempre.
 */

import { useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronRight, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useCuentasPersonas } from "@/hooks/use-cuentas-personas";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import CuentasPorPersona from "../cuentas/CuentasPorPersona";
import { leerPedidoLiquidar } from "../cuentas/liquidar-por-url";
import { fmtMon } from "../shared";
import BotonPlegar from "./BotonPlegar";

const A_LA_VISTA = 5;
const ID_PANEL = "adelantos-resumen-cuentas";

const conSaldo = (p: CuentaPersona) =>
  Math.abs(p.neto) > 0.005 || Object.values(p.otrasMonedas ?? {}).some((v) => Math.abs(v) > 0.005);

/** «Te debe S/ 600» / «Le debes S/ 120» — y las otras monedas aparte (ADR-118). */
function textoCuenta(p: CuentaPersona): { texto: string; teDebe: boolean } {
  const partes: string[] = [];
  if (Math.abs(p.neto) > 0.005) partes.push(fmtMon(Math.abs(p.neto)));
  for (const [moneda, v] of Object.entries(p.otrasMonedas ?? {})) {
    if (Math.abs(v) > 0.005) partes.push(fmtMon(Math.abs(v), moneda));
  }
  const teDebe = p.neto > 0.005 || (Math.abs(p.neto) <= 0.005 && Object.values(p.otrasMonedas ?? {}).some((v) => v > 0.005));
  return { texto: `${teDebe ? "Te debe" : "Le debes"} ${partes.join(" · ")}`, teDebe };
}

export default function PersonasCompactas({ onGoTab }: { onGoTab: (tab: string) => void }) {
  const [abierto, setAbierto] = useState(() => leerPedidoLiquidar() !== null);
  /* El «atrás» o un enlace dentro del panel pueden traer el pedido de liquidar con la vista ya montada. */
  useEffect(() => {
    // Diferido: el popstate puede llegar mientras Next dibuja su Router (ver use-vistas-permitidas, 30-10).
    const releer = () =>
      queueMicrotask(() => {
        if (leerPedidoLiquidar()) setAbierto(true);
      });
    window.addEventListener("popstate", releer);
    return () => window.removeEventListener("popstate", releer);
  }, []);

  const { personas, loading } = useCuentasPersonas();
  const conCuenta = useMemo(
    () => personas.filter(conSaldo).sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto)),
    [personas],
  );

  const plegar = (
    <BotonPlegar
      abierto={abierto}
      onAlternar={() => setAbierto((v) => !v)}
      controla={ID_PANEL}
      texto={conCuenta.length > 0 ? `Ver las ${conCuenta.length} y liquidar` : "Ver y liquidar"}
      textoAbierto="Ver en corto"
      ayuda={abierto ? "Vuelve a las 5 cuentas más grandes" : "Abre la cuenta de cada persona: adelantos, madera y Liquidar"}
    />
  );

  if (abierto) {
    return (
      <div id={ID_PANEL} className="space-y-2">
        <div className="flex justify-end">{plegar}</div>
        <CuentasPorPersona onGoTab={onGoTab} />
      </div>
    );
  }

  if (!loading && conCuenta.length === 0) return null;
  const resto = conCuenta.length - Math.min(conCuenta.length, A_LA_VISTA);

  return (
    <section id={ID_PANEL} aria-label="Cuenta por persona" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Cuenta por persona</CardTitle>
          <InfoTip
            title="Cuenta por persona"
            what={<span>Las {A_LA_VISTA} cuentas más grandes: adelantos y madera de cada uno, en una cifra.</span>}
            affects={<span>La cuenta entera de cada persona, sus papeles y su historial están en Personas.</span>}
            example={<span>Le adelantaste S/ 1,000 y le debes S/ 300 por una guía: sale «Te debe S/ 700».</span>}
          />
        </div>
        {plegar}
      </div>

      {loading && conCuenta.length === 0 ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {conCuenta.slice(0, A_LA_VISTA).map((p) => {
            const { texto, teDebe } = textoCuenta(p);
            return (
              <li key={p.clave} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                {/* Mismos tonos que la cuenta completa: el base no pasa AA a 14 px. */}
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${
                    teDebe
                      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      : "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                  }`}
                >
                  {texto}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onGoTab("personas")}
        className="mt-2 inline-flex h-12 items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
      >
        <Scale className="h-4 w-4" aria-hidden />
        {resto > 0 ? `Y ${resto} más: ver todas en Personas` : "Ver todas en Personas"}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}
