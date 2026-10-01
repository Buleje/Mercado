"use client";

/**
 * La ficha de un permiso (ADR-421 + ADR-432): quién es el papel arriba y, en
 * tres secciones, lo que pasó bajo él.
 *
 *  · «Volumen» (por defecto): lo ingresado, lo consumido, lo producido por
 *    especie y por tipo, lo despachado y lo que no cuadra.
 *  · «Trazabilidad»: el hilo guía de ingreso → corridas → despachos.
 *  · «Plata»: el balance que ya existía, sin cambios.
 *
 * Cada sección pide sus datos recién cuando se abre (Volumen y Trazabilidad
 * comparten una respuesta). La identidad del papel sale de la que haya llegado
 * primero —o de la lista, que ya estaba cargada— para que el encabezado no
 * espere a una suma.
 *
 * La sección vive en la URL (`?seccion=`, `ficha-del-permiso-url`), así que un
 * link abre la ficha en la misma sección.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Coins,
  FileSpreadsheet,
  Layers,
  Loader2,
  Printer,
  RefreshCw,
  Route,
} from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { logger } from "@/lib/logger";
import { useBalanceContrato, useVolumenContrato } from "@/hooks/use-contratos";
import type { Contrato } from "@/lib/forestal/contratos";
import {
  exportarFichaDelPermiso,
  imprimirFichaDelPermiso,
} from "@/lib/forestal/permiso-ficha-export";
import type { VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";
import CtpContratoBalance from "./CtpContratoBalance";
import CtpPermisoTraza from "./CtpPermisoTraza";
import CtpPermisoVolumen from "./CtpPermisoVolumen";
import { ESTADO_CLASE, ESTADO_LABEL, TIPO_LABEL, vigenciaTexto } from "./contratos-ui";
import {
  escribirSeccionEnUrl,
  SECCION_FICHA_DEFAULT,
  seccionDeUrl,
  type SeccionFicha,
} from "./ficha-del-permiso-url";

/**
 * Identidad del CTP para el papel/Excel, best-effort (2026-09-25): si el
 * fetch falla el documento igual sale, sólo sin el bloque de identidad —
 * mismo criterio que el reporte de cumplimiento (`CtpCompliancePanel.tsx`).
 */
async function obtenerFichaCtp() {
  return fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => body?.ficha ?? null)
    .catch((err) => {
      logger.warn("[ficha-del-permiso] no se pudo traer la ficha del CTP", { error: String(err) });
      return null;
    });
}

/* El ícono sólo desde `sm`: a 400 px, con íconos, las tres no entran en la
   fila y el control empujaba el borde de la tarjeta (medido). */
const ICONO = "hidden h-4 w-4 sm:block";
const OPCIONES: { value: SeccionFicha; label: string; icon: React.ReactNode }[] = [
  { value: "volumen", label: "Volumen", icon: <Layers className={ICONO} /> },
  { value: "trazabilidad", label: "Trazabilidad", icon: <Route className={ICONO} /> },
  { value: "plata", label: "Plata", icon: <Coins className={ICONO} /> },
];

/** La sección: de la URL al montar, al día con el «atrás», y escrita al cambiar. */
function useSeccionDeFicha(): [SeccionFicha, (s: SeccionFicha) => void] {
  const [seccion, setSeccion] = useState<SeccionFicha>(
    () => seccionDeUrl() ?? SECCION_FICHA_DEFAULT,
  );
  useEffect(() => {
    const onPop = () => setSeccion(seccionDeUrl() ?? SECCION_FICHA_DEFAULT);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const irA = (s: SeccionFicha) => {
    setSeccion(s);
    escribirSeccionEnUrl(s);
  };
  return [seccion, irA];
}

function ErrorDeCarga({
  error,
  onReintentar,
  onVolver,
}: {
  error: string;
  onReintentar: () => void;
  onVolver?: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{error}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReintentar}
          className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] hover:bg-primary/10"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
        {onVolver && (
          <button
            type="button"
            onClick={onVolver}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la lista
          </button>
        )}
      </div>
    </div>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 px-1 py-8 text-sm text-[var(--text-tertiary)]"
    >
      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> {texto}
    </p>
  );
}

export default function CtpContratoFicha({
  contratoId,
  inicial,
  onVolver,
}: {
  contratoId: string;
  /** El contrato como vino en la lista, si ya estaba: pinta el encabezado sin esperar. */
  inicial?: Contrato | null;
  onVolver: () => void;
}) {
  const [seccion, irA] = useSeccionDeFicha();
  const [bajandoFicha, setBajandoFicha] = useState(false);
  /* El botón vive en las tres secciones porque «Plata» también imprime el
     volumen (Brandon, 2026-09-25), pero «Plata» NO lo carga sola
     (`useVolumenContrato(contratoId, !plata)`: es la consulta más cara del
     libro y nadie la mira desde ahí). `accionPendiente` es lo que el click
     está esperando — se resuelve solo cuando `vol.volumen` (o `vol.error`)
     llega, así el botón nunca queda deshabilitado para siempre. */
  const [accionPendiente, setAccionPendiente] = useState<"imprimir" | "excel" | null>(null);
  const [errorFicha, setErrorFicha] = useState<string | null>(null);
  const plata = seccion === "plata";
  const bal = useBalanceContrato(contratoId, plata);
  const vol = useVolumenContrato(contratoId, !plata);
  const activa = plata ? bal : vol;
  const contrato = vol.contrato ?? bal.contrato ?? inicial ?? null;

  useEffect(() => {
    if (!accionPendiente) return;
    if (vol.volumen) {
      const accion = accionPendiente;
      const volumen = vol.volumen;
      setAccionPendiente(null);
      setErrorFicha(null);
      if (accion === "imprimir") void imprimirConVolumen(volumen);
      else void exportarConVolumen(volumen);
      return;
    }
    if (vol.error && !vol.cargando) {
      setAccionPendiente(null);
      setErrorFicha(vol.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accionPendiente, vol.volumen, vol.error, vol.cargando]);

  if (!contrato) {
    if (activa.error) {
      return (
        <ErrorDeCarga
          error={activa.error}
          onReintentar={() => void activa.recargar()}
          onVolver={onVolver}
        />
      );
    }
    return <Cargando texto="Abriendo el permiso…" />;
  }

  async function imprimirConVolumen(volumen: VolumenDelPermiso) {
    if (!contrato) return;
    const ficha = await obtenerFichaCtp();
    imprimirFichaDelPermiso({ contrato, volumen, ficha });
  }

  async function exportarConVolumen(volumen: VolumenDelPermiso) {
    if (!contrato) return;
    setBajandoFicha(true);
    try {
      const ficha = await obtenerFichaCtp();
      await exportarFichaDelPermiso({ contrato, volumen, ficha });
    } finally {
      setBajandoFicha(false);
    }
  }

  /* Con el volumen ya en memoria (Volumen/Trazabilidad, o Plata después de la
     primera vez) el click actúa al toque. Si no, pide el volumen ahora mismo
     y el efecto de arriba dispara la acción en cuanto llegue. */
  function handleImprimirFicha() {
    setErrorFicha(null);
    if (vol.volumen) {
      void imprimirConVolumen(vol.volumen);
      return;
    }
    setAccionPendiente("imprimir");
    if (!vol.cargando) void vol.recargar();
  }

  function handleExportarFicha() {
    setErrorFicha(null);
    if (vol.volumen) {
      void exportarConVolumen(vol.volumen);
      return;
    }
    setAccionPendiente("excel");
    if (!vol.cargando) void vol.recargar();
  }

  return (
    <div className="space-y-4" data-vista="ctp-ficha-permiso">
      {/* ── Identidad del papel + las tres secciones ── */}
      <header className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onVolver}
              className="mb-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Todos los contratos
            </button>
            <div className="flex items-center gap-1.5">
              <SectionTitle as="h2" className="font-mono break-all">
                {contrato.codigo}
              </SectionTitle>
              <InfoTip
                title="Ficha del permiso"
                what="Volumen: lo que entró, se consumió, se produjo y salió bajo este papel. Trazabilidad: de qué guía salió cada corrida y cada despacho. Plata: lo que se puso y lo que debería volver."
                affects="Todo se calcula al leer: nada se guarda como saldo."
              />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {contrato.alias ? `${contrato.alias} · ` : ""}
              <b className="text-[var(--text-primary)]">{contrato.titularNombre}</b>
              {contrato.region ? ` · ${contrato.region}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
              {contrato.tipo ? TIPO_LABEL[contrato.tipo] : "Tipo sin definir"} ·{" "}
              {vigenciaTexto(contrato.vigenciaDesde, contrato.vigenciaHasta)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 max-sm:w-full max-sm:items-start">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${ESTADO_CLASE[contrato.estado]}`}
              >
                {ESTADO_LABEL[contrato.estado]}
              </span>
              <button
                type="button"
                onClick={() => handleImprimirFicha()}
                disabled={accionPendiente !== null}
                title={
                  accionPendiente === "imprimir"
                    ? "Trayendo el volumen del permiso…"
                    : "Imprimir la ficha del permiso para SERFOR/OSINFOR (guarda como PDF)"
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {accionPendiente === "imprimir" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Printer className="h-4 w-4" aria-hidden />
                )}
                Papel
              </button>
              <button
                type="button"
                onClick={() => handleExportarFicha()}
                disabled={accionPendiente !== null || bajandoFicha}
                title={
                  accionPendiente === "excel"
                    ? "Trayendo el volumen del permiso…"
                    : "Bajar la ficha del permiso en Excel (guías, por especie, por tipo, corridas y despachos)"
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {accionPendiente === "excel" || bajandoFicha ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                )}
                Excel
              </button>
              <button
                type="button"
                onClick={() => void activa.recargar()}
                disabled={activa.cargando}
                aria-label="Volver a sumar esta sección"
                title="Volver a sumar esta sección"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${activa.cargando ? "animate-spin" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
            {errorFicha && (
              <p role="alert" className="text-xs font-semibold text-[var(--data-error-ink)]">
                No se pudo traer el volumen para imprimir/exportar: {errorFicha}
              </p>
            )}
            <SegmentedControl<SeccionFicha>
              value={seccion}
              onChange={irA}
              options={OPCIONES}
              size="lg"
              label={`Secciones de ${contrato.codigo}`}
            />
          </div>
        </div>
      </header>

      {plata ? (
        <CtpContratoBalance
          balance={bal.balance}
          resumen={bal.resumen}
          cargando={bal.cargando}
          error={bal.error}
          recargar={bal.recargar}
        />
      ) : vol.volumen ? (
        seccion === "volumen" ? (
          <CtpPermisoVolumen volumen={vol.volumen} onRecargar={() => void vol.recargar()} />
        ) : (
          <CtpPermisoTraza volumen={vol.volumen} onRecargar={() => void vol.recargar()} />
        )
      ) : vol.error ? (
        <ErrorDeCarga error={vol.error} onReintentar={() => void vol.recargar()} />
      ) : (
        <Cargando texto="Siguiendo la madera del permiso…" />
      )}
    </div>
  );
}
