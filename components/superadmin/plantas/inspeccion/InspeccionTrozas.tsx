"use client";

/**
 * Trozas: el inspector recorre el patio escaneando (o tipeando el código
 * pintado) y la pantalla dice cuántas de las que el libro tenía al abrir la
 * inspección encontró, cuáles faltan y cuáles sobran. Es el mismo conteo que
 * usa la planta («Contar el patio»), contra la foto CONGELADA del libro.
 */
import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  anotarDesconocido,
  anotarTroza,
  quitarLectura,
  resumirConteo,
  type ResumenConteo,
  type TrozaDelConteo,
} from "@/lib/forestal/conteo-patio";
import { LABEL_BLOQUEO } from "@/lib/forestal/consumo-trozas";
import { senalDeLectura } from "@/lib/forestal/conteo-patio-senal";
import EscanerTrozas, { nombreDeTroza } from "@/components/admin/forestal/EscanerTrozas";
import ListasDelConteo from "@/components/admin/forestal/patio-conteo-listas";
import { AVISO_AMBAR, TARJETA } from "@/components/admin/forestal/ctp-conteo-pasos";
import { m3 } from "../formato";
import { conteoNuevo } from "./inspeccion-datos";
import type { Inspeccion } from "./use-inspeccion";

function Contador({ resumen, enCamara = false }: { resumen: ResumenConteo; enCamara?: boolean }) {
  const sobran = resumen.sorpresas.length;
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "font-bold tabular-nums leading-none text-[var(--text-primary)]",
          enCamara ? "text-3xl" : "text-5xl",
        )}
        data-inspeccion-progreso={enCamara ? undefined : true}
      >
        {resumen.contadas}{" "}
        <span
          className={cn(
            "font-semibold text-[var(--text-secondary)]",
            enCamara ? "text-xl" : "text-2xl",
          )}
        >
          de {resumen.total} encontradas
        </span>
      </p>
      <p className="text-base font-bold tabular-nums text-[var(--text-secondary)]">
        {resumen.faltan.length} faltan{" · "}
        <span
          className={
            sobran > 0
              ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
              : undefined
          }
        >
          {sobran} {sobran === 1 ? "sobra" : "sobran"}
        </span>
        {" "}
        {!enCamara && (
          <InfoTip
            title="Trozas esperadas"
            what="Las que el libro tenía al abrir la inspección: las sueltas en el patio y también las apartadas en lotes de aserrío."
            affects="Por eso pueden ser más que las «en patio» de la ficha de la planta."
            example="Ficha: 120 en patio + 8 apartadas en un lote → esperas 128."
          />
        )}
      </p>
    </div>
  );
}

function Avance({ resumen }: { resumen: ResumenConteo }) {
  const pct = resumen.total > 0 ? Math.round((resumen.contadas / resumen.total) * 100) : 0;
  return (
    <section className={cn(TARJETA, "space-y-3")} aria-live="polite">
      <Contador resumen={resumen} />
      {resumen.total > 0 && (
        <>
          <div
            role="progressbar"
            aria-label="Avance del conteo"
            aria-valuemin={0}
            aria-valuemax={resumen.total}
            aria-valuenow={resumen.contadas}
            className="h-4 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          >
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm tabular-nums text-[var(--text-secondary)]">
            {m3(resumen.m3.encontrado)} de {m3(resumen.m3.esperado)} encontrados · faltan{" "}
            {m3(resumen.m3.faltan)}
          </p>
        </>
      )}
    </section>
  );
}

/** Cerrada o anulada sin las lecturas en este equipo: lo que quedó en el acta. */
function ResumenGuardado({ t }: { t: NonNullable<Inspeccion["insp"]>["trozas"] }) {
  if (!t)
    return (
      <p className="text-sm text-[var(--text-tertiary)]">
        En esta inspección no se contó el patio.
      </p>
    );
  const filas: [string, string][] = [
    ["Esperadas", String(t.esperadas)],
    ["Encontradas", String(t.contadas)],
    ["Faltan", String(t.faltantes)],
    ["Sobran", String(t.sobrantes)],
    ["Volumen esperado", m3(t.m3Esperado)],
    ["Volumen encontrado", m3(t.m3Contado)],
  ];
  return (
    <dl className={cn(TARJETA, "grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3")}>
      {filas.map(([k, v]) => (
        <div key={k}>
          <dt className="text-sm text-[var(--text-tertiary)]">{k}</dt>
          <dd className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InspeccionTrozas({ s }: { s: Inspeccion }) {
  const insp = s.insp;
  const camaraAbierta = useRef(false);
  const vacio = useMemo(() => (insp ? conteoNuevo(insp) : null), [insp]);
  const conteo = s.conteo ?? vacio;
  const resumen = useMemo(() => (conteo ? resumirConteo(conteo) : null), [conteo]);
  if (!insp || !conteo || !resumen) return null;

  const yaContadas = new Set(conteo.lecturas.flatMap((l) => (l.trozaId ? [l.trozaId] : [])));
  const sinTrozas = conteo.trozas.length === 0;
  /* El servidor ya tiene un conteo y este equipo no sus lecturas (se contó en otro celular). */
  const enOtroEquipo = !s.conteo && (insp.trozas?.contadas ?? 0) > 0;

  if (!s.editable) {
    return s.conteo ? (
      <div className="space-y-4">
        <Avance resumen={resumen} />
        <ListasDelConteo resumen={resumen} />
      </div>
    ) : (
      <ResumenGuardado t={insp.trozas} />
    );
  }

  const ahora = () => new Date().toISOString();
  const onTroza = (t: TrozaDelConteo) => {
    s.cambiarConteo((c) => anotarTroza(c, t, ahora()));
    senalDeLectura(t.motivo ? "sobra" : "encontrada", { camaraAbierta: camaraAbierta.current });
  };
  const avisoAlTomar = (t: TrozaDelConteo) =>
    t.motivo
      ? {
          tono: "ya" as const,
          mensaje: `Sobra: troza ${nombreDeTroza(t)}. ${LABEL_BLOQUEO[t.motivo]}.`,
        }
      : { tono: "ok" as const, mensaje: `Troza ${nombreDeTroza(t)} encontrada.` };
  const onDesconocido = (codigo: string) => {
    s.cambiarConteo((c) => anotarDesconocido(c, codigo, ahora()));
    senalDeLectura("sobra");
    return `Sobra: ${codigo} no es de ninguna troza del libro.`;
  };

  return (
    <div className="space-y-4">
      {enOtroEquipo && (
        <p className={AVISO_AMBAR} role="note">
          Este patio ya se empezó a contar en otro equipo ({insp.trozas?.contadas} encontradas). Lo
          que escanees acá empieza un conteo nuevo que reemplaza a ese.
        </p>
      )}
      {sinTrozas && (
        <p className={AVISO_AMBAR} role="note">
          El libro no tenía trozas en el patio al abrir la inspección. Lo que escanees se anota como
          «sobra».
        </p>
      )}
      {conteo.truncado && (
        <p className={AVISO_AMBAR} role="note">
          El libro tenía más trozas de las que se pueden contar acá: alguna «sobra» puede ser una
          troza que sí está.
        </p>
      )}
      <Avance resumen={resumen} />
      <EscanerTrozas
        trozas={conteo.trozas}
        onTroza={onTroza}
        yaElegidas={yaContadas}
        accion="encontrada"
        mostrarCuenta={false}
        avisoAlTomar={avisoAlTomar}
        onDesconocido={onDesconocido}
        camaraGrande
        pieCamara={
          <div
            ref={(el) => {
              camaraAbierta.current = el != null;
            }}
          >
            <Contador resumen={resumen} enCamara />
          </div>
        }
      />
      <ListasDelConteo
        resumen={resumen}
        onQuitar={(l) => s.cambiarConteo((c) => quitarLectura(c, l))}
      />
    </div>
  );
}
