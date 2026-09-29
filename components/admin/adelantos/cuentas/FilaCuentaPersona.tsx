"use client";

/**
 * Una fila de la cuenta unificada: las dos patas (Adelantos y aserrío/madera)
 * SIEMPRE por separado —esconderlas detrás del neto tapa, por ejemplo, que le
 * adelantaste plata Y le debés por una guía a la vez (ADR-412 §5)— y el neto
 * en palabras, grande, al final.
 */

import { useState } from "react";
import { ChevronDown, Scale } from "@buleje/design-system/icons";
import { leerNeto, type CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import { CONCEPTO_LABEL, type Concepto } from "@/lib/forestal/cuenta-corriente";
import { fmtMon, fmtMonedas } from "../shared";
import AccionesEstadoCuenta from "./AccionesEstadoCuenta";
import ControlVinculo from "./ControlVinculo";
import DetalleMovimientos from "./DetalleMovimientos";
import LiquidarCuentaModal from "./liquidar/LiquidarCuentaModal";

function chipsDe(persona: CuentaPersona): { clave: string; texto: string }[] {
  const chips: { clave: string; texto: string }[] = [];
  /* ADR-448: `teDebe`/`aFavorSuyo` son sólo lo dado. En pantalla se juntan
     las dos direcciones: «te debe» suma lo recibido que diste de más, y «le
     debes» es lo que te entregó de más + lo que te pagó antes o te prestó. */
  const a = persona.adelantos;
  const teDebe = a ? Math.round((a.teDebe + (a.recibidoExcedido ?? 0)) * 100) / 100 : 0;
  const leDebes = a ? (a.leDebes ?? a.aFavorSuyo) : 0;
  if (teDebe) chips.push({ clave: "adel-debe", texto: `Adelantos: te debe ${fmtMon(teDebe)}` });
  if (leDebes) chips.push({ clave: "adel-favor", texto: `Adelantos: le debes ${fmtMon(leDebes)}` });
  for (const [concepto, monto] of Object.entries(persona.madera?.porConcepto ?? {})) {
    if (!monto) continue;
    const label = CONCEPTO_LABEL[concepto as Concepto] ?? concepto;
    chips.push({ clave: `madera-${concepto}`, texto: `${label}: ${fmtMon(monto)}` });
  }
  if (Object.keys(persona.otrasMonedas).length > 0) {
    chips.push({ clave: "otras", texto: `Otras monedas: ${fmtMonedas(persona.otrasMonedas)}` });
  }
  return chips;
}

export default function FilaCuentaPersona({
  persona,
  forestal,
  candidatos,
  onVincular,
  onGoTab,
  puedeLiquidar,
  onCambio,
}: {
  persona: CuentaPersona;
  /** El tenant tiene la especialización forestal habilitada. */
  forestal: boolean;
  candidatos: CuentaPersona[];
  onVincular: (beneficiarioId: string, forestPartyId: string | null) => Promise<boolean>;
  onGoTab: (tab: string) => void;
  /** ADR-413: sólo admin y dueño pueden liquidar/anular. */
  puedeLiquidar: boolean;
  /**
   * Se liquidó o se anuló algo dentro del modal: la fila (esta lista entera,
   * `useCuentasPersonas().reload`) tiene que traer el saldo nuevo — sin esto
   * quedaba mostrando el importe de antes hasta recargar la página (revisión
   * en el navegador, LIQ-2026-0005).
   */
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  // El token base no pasa AA en 16px 800 (medido: contraste 2.03) — el
  // `-700`/`-500` es el mismo patrón que ya usa CtpCuentaCorriente.tsx.
  const color =
    persona.neto > 0.005
      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : persona.neto < -0.005
        ? "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
        : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
  const chips = chipsDe(persona);
  const sinCuentaForestal = forestal && Boolean(persona.beneficiarioId) && !persona.parteId;

  /**
   * ADR-413 §UI: el botón «Liquidar» aparece si hay algo que liquidar —
   * |neto| o lo que se podría CRUZAR, que puede ser plata aunque el neto dé
   * 0 (le adelantaste 800 Y te vendió madera por 800: nada que cobrar, pero
   * dos libretas que se pueden cerrar). Es una aproximación local con lo que
   * ya trae la fila — el máximo REAL (`maximoCompensable`, que exige el
   * vínculo explícito) lo calcula el modal con las partidas del servidor.
   */
  const teDebeAdelantos = persona.adelantos?.teDebe ?? 0;
  const aFavorSuyoMadera = Math.max(0, -(persona.madera?.saldo ?? 0));
  /* ADR-449: el cruce al revés — lo que te adelantó contra lo que te debe en
     la cuenta forestal (sus aserríos). Te adelantó 1 000 y le cobraste 1 000
     de aserrío: el neto da 0 y hay dos libretas que cerrar. */
  const teDebeMadera = Math.max(0, persona.madera?.saldo ?? 0);
  const recibidoAprox = persona.adelantos?.recibidoPendiente ?? 0;
  const maximoAprox = persona.parteId
    ? Math.max(Math.min(teDebeAdelantos, aFavorSuyoMadera), Math.min(recibidoAprox, teDebeMadera))
    : 0;
  const netoDistintoDeCero = Math.abs(persona.neto) > 0.005;
  const hayAlgoQueLiquidar = netoDistintoDeCero || maximoAprox > 0.005;
  /* Revisión ADR-449: después de «Dejar en cero» el neto es 0 y no hay nada que
     liquidar, pero la liquidación sigue viva y su «Anular» vive en el modal. */
  const tieneLiquidaciones = (persona.liquidacionesVivas ?? 0) > 0;
  /**
   * Si lo ÚNICO que hay para liquidar es un cruce (el neto ya da 0 — le
   * adelantaste 800 y te vendió madera por 800) y el vínculo no es explícito,
   * abrir el modal no serviría de nada: se deshabilita CON el motivo a la
   * vista. Si además hay un neto real, el botón sigue habilitado — adentro
   * del modal está el «Es la misma persona» (ADR-413 §4) para el cruce, y
   * mientras tanto se puede cobrar o pagar lo que es de una sola libreta.
   */
  const soloSeArreglaCruzando = !netoDistintoDeCero && maximoAprox > 0.005;
  const vinculoBloqueaElBoton = soloSeArreglaCruzando && persona.vinculo !== "id" && !tieneLiquidaciones;

  return (
    <li className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold text-[var(--text-primary)]">{persona.nombre}</p>
          {persona.documento && <p className="text-sm text-[var(--text-tertiary)]">{persona.documento}</p>}
          {(chips.length > 0 || sinCuentaForestal) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c.clave} className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                  {c.texto}
                </span>
              ))}
              {sinCuentaForestal && (
                <span className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-tertiary)]">
                  Sin cuenta forestal vinculada
                </span>
              )}
            </div>
          )}
        </div>
        {/* `shrink-0` cortaba el texto a 400px: un flex item que no puede
            encogerse desborda el ancho de la tarjeta en vez de envolver
            (revisión en el navegador: "…te debe S/ 17000.0" recortado contra
            el borde). `min-w-0` deja que se achique por debajo de su ancho
            natural y `break-words` envuelve incluso si algún token no tiene
            espacio donde cortar; en desktop sigue alineado a la derecha
            porque hay lugar de sobra para una sola línea. */}
        <p className={`min-w-0 break-words text-right text-base font-extrabold tabular-nums ${color}`}>{leerNeto(persona.neto, persona.nombre)}</p>
      </div>

      {/* flex-wrap: deja lugar para sumar acciones sin romper la fila. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Vincular decide contra qué cuenta se cruza la plata: sólo admin o
            dueño (revisión ADR-449), los mismos que liquidan. */}
        {puedeLiquidar && <ControlVinculo persona={persona} candidatos={candidatos} onVincular={onVincular} />}
        <AccionesEstadoCuenta persona={persona} />
        {puedeLiquidar && (hayAlgoQueLiquidar || tieneLiquidaciones) && (
          <button
            type="button"
            onClick={() => setLiquidando(true)}
            disabled={vinculoBloqueaElBoton}
            aria-label={
              vinculoBloqueaElBoton
                ? `Para liquidar a ${persona.nombre} hace falta confirmar que es la misma persona`
                : hayAlgoQueLiquidar
                  ? `Liquidar la cuenta de ${persona.nombre}`
                  : `Ver las liquidaciones de ${persona.nombre}`
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Scale className="h-3.5 w-3.5" aria-hidden /> {hayAlgoQueLiquidar ? "Liquidar" : "Liquidaciones"}
          </button>
        )}
        {vinculoBloqueaElBoton && <span className="text-xs text-[var(--text-tertiary)]">Falta confirmar el vínculo</span>}
        {persona.parteId && (
          <button
            type="button"
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
            {abierto ? "Ocultar movimientos" : "Ver movimientos"}
          </button>
        )}
      </div>

      {abierto && persona.parteId && <DetalleMovimientos movimientos={persona.madera?.movimientos ?? []} onGoTab={onGoTab} />}

      {liquidando && (
        <LiquidarCuentaModal persona={persona} onClose={() => setLiquidando(false)} onVincular={onVincular} onCambio={onCambio} />
      )}
    </li>
  );
}
