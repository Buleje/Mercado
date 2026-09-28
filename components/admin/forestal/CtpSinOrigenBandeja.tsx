"use client";

/**
 * Las producciones ya declaradas que no dicen de qué trozas salieron
 * (27-09 → ADR-447 el 28-09).
 *
 * Arriba cuánto falta; abajo una línea por arreglo con su botón, en el orden en
 * que se resuelven (`ArreglosSinOrigen`): corregir las llegadas, recibir la
 * guía, acomodar trozas, declarar apertura y, aparte, lo que decide el dueño.
 * Las corridas que ya tienen madera se vinculan EN TANDA, grupo por grupo
 * (`CtpOrigenEnTandaModal`). Cuenta el servidor (44 en Blas), no el volumen de
 * entrada. Lo largo va en el ⓘ.
 *
 * El hook de la tanda vive acá: cerrar el modal no pierde lo desmarcado.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import type { DiagnosticoCorrida, DiagnosticoSinOrigen } from "@/lib/forestal/vincular-trozas";
import { useMiRol } from "@/hooks/use-mi-rol";
import { useOrigenEnTanda } from "@/hooks/use-origen-en-tanda";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";
import ArreglosSinOrigen from "./ctp-sin-origen-arreglos";
import { de } from "./ctp-sin-origen-comun";
import { resumenSinOrigen } from "./ctp-sin-origen-lineas";
import { puedeFirmarVinculo } from "./CtpVincularMixtoModal";

const CtpOrigenEnTandaModal = dynamic(() => import("./CtpOrigenEnTandaModal"), { ssr: false });

const LINK =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] underline underline-offset-2 hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]";

/** Una lectura de la tanda recién hecha no se repite (tras vincular, el hook ya releyó). */
const RELEER_TRAS_MS = 5_000;

export default function CtpSinOrigenBandeja({
  datos,
  cargando,
  error,
  onReleer,
  onCambio,
  onIr,
  onElegirAMano,
}: {
  datos: DiagnosticoSinOrigen | null;
  cargando: boolean;
  error: string | null;
  onReleer: () => void;
  /** Algo cambió en el libro (se vinculó, se corrigió, se declaró apertura): releer y avisar. */
  onCambio: (mensaje: string) => void;
  onIr?: (vista: string, filtro?: CtpIngresosFiltroRapido) => void;
  onElegirAMano?: (c: DiagnosticoCorrida) => void;
}) {
  /* Vincular es del dueño o un administrador (el servidor lo exige igual);
     `null` = el rol todavía no llegó: se muestra y el servidor decide. */
  const rol = useMiRol();
  const firma = rol == null || puedeFirmarVinculo(rol);
  const puedeEditar = rol == null || puedePedir("PATCH /api/admin/forestal/ctp", rol);

  const tanda = useOrigenEnTanda({ onCambio });
  const [abierta, setAbierta] = useState(false);
  const disparador = useRef<HTMLElement | null>(null);

  /* Cada diagnóstico nuevo (se arregló algo) rehace la tanda y lo que deja
     cada arreglo; si la tanda se acaba de leer (tras vincular), no se repite. */
  const { cargar, leidaEn, vinculando, fila } = tanda;
  const ocupado = vinculando != null || fila != null;
  useEffect(() => {
    if (!datos || ocupado) return;
    if (Date.now() - leidaEn < RELEER_TRAS_MS) return;
    void cargar();
    // Sólo cuando llega OTRO diagnóstico: `leidaEn` y `ocupado` no la disparan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  const abrir = useCallback(() => {
    disparador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAbierta(true);
    if (!ocupado) void cargar();
  }, [cargar, ocupado]);
  const cerrar = useCallback(() => {
    setAbierta(false);
    const el = disparador.current;
    /* AdminModal se abre por estado, sin trigger: el foco caería en <body>. */
    window.setTimeout(() => {
      if (el?.isConnected) el.focus();
    }, 0);
  }, []);

  if (!datos) {
    return error ? (
      <p role="alert" className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
        No se pudo revisar las producciones. {error}
        <button type="button" onClick={onReleer} className={LINK}>
          Reintentar
        </button>
      </p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando las producciones…
      </p>
    );
  }

  const r = resumenSinOrigen(datos);
  return (
    <div data-vista="ctp-sin-origen" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <CardTitle as="h4" className="text-base font-bold text-[var(--text-primary)]">
          {de(r.corridas, "corrida sin origen", "corridas sin origen")}
        </CardTitle>
        <span className="text-sm tabular-nums text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">{fmtPt(r.pt)} pt</b> · {fmtM3(r.m3)} m³
        </span>
        <InfoTip
          title="Corridas sin origen"
          what="Producciones ya declaradas que no dicen de qué trozas salieron. Cada línea es un arreglo, en el orden en que se resuelven."
          affects="Sin eso no puedes seguir una tabla hasta su guía. Al terminar cada arreglo, la lista se recalcula sola."
          example="«11 corridas figuran antes de que llegue su madera → Corregir la llegada de 8 guías»: deja 11 para vincular."
          ancho="w-96"
        />
        {(cargando || tanda.cargando) && <Loader2 aria-label="Actualizando" className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
        <button
          type="button"
          onClick={onReleer}
          disabled={cargando}
          aria-label="Volver a revisar"
          className="ml-auto grid h-11 w-11 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>
      {error && <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>}

      <ArreglosSinOrigen
        datos={datos}
        simulacion={tanda.datos?.simulacion ?? null}
        firma={firma}
        puedeEditar={puedeEditar}
        onVincular={abrir}
        onIr={onIr}
        onCambio={onCambio}
      />

      {abierta && (
        <CtpOrigenEnTandaModal
          open
          onClose={cerrar}
          estado={tanda}
          firma={firma}
          onElegirAMano={
            onElegirAMano
              ? (corridaId) => {
                  const c = datos.corridas.find((x) => x.corridaId === corridaId);
                  if (!c) return;
                  setAbierta(false);
                  onElegirAMano(c);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
