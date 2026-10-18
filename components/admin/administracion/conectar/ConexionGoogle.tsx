"use client";

/**
 * ConexionGoogle — conectar tu cuenta de Google (ADR-501 §5): las actividades
 * con aviso «Google Calendar» se copian a tu calendario y las tareas y notas
 * con fecha a Google Tasks (lista «Buleje»). Keep no tiene cómo conectarse
 * para una cuenta personal.
 */
import { useCallback, useEffect, useState } from "react";
import { Link2Off, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle, LoadingState } from "@buleje/design-system";
import { toast } from "sonner";
import { TARJETA } from "@/components/admin/planificacion/piezas/clases";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import type { ConexionGoogleDTO } from "@/lib/agenda/tipos";
import { desconectarGoogle, leerGoogle, sincronizarGoogle, URL_CONECTAR_GOOGLE } from "../agenda-api";
import { CLASE_CHIP_ESTADO } from "../comun/ListaOcurrencias";
import { fechaCorta } from "../comun/fechas";

const ESTADO: Record<ConexionGoogleDTO["estado"], { rotulo: string; chip: string }> = {
  activa: { rotulo: "Conectada", chip: "bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15" },
  revocada: { rotulo: "Se cortó el permiso", chip: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15" },
  error: { rotulo: "Con error", chip: "bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15" },
};

/** «sábado 18/10 a las 14:05», en hora de Lima. */
function momento(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return iso;
  return `${fechaCorta(limaDateKey(iso))} a las ${formatTime(iso)}`;
}

function GoogleG() {
  return (
    <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--data-6)]">
      G
    </span>
  );
}

export function ConexionGoogle() {
  const { confirm } = useConfirm();
  const [conexion, setConexion] = useState<ConexionGoogleDTO | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sinConfigurar, setSinConfigurar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await leerGoogle();
    setConexion(r.ok ? (r.data ?? null) : null);
    setSinConfigurar(!r.ok && !!r.sinConfigurar);
    setError(r.ok || r.status === 404 || r.sinConfigurar ? null : r.error);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const conectar = () => window.location.assign(URL_CONECTAR_GOOGLE);

  const sincronizar = async () => {
    setOcupado(true);
    const r = await sincronizarGoogle();
    setOcupado(false);
    if (!r.ok) return void toast.error(r.error);
    const { enviados, sinCambios, fallidos } = r.data;
    const texto = `${enviados} enviadas, ${sinCambios} sin cambios${fallidos > 0 ? `, ${fallidos} con error` : ""}`;
    if (fallidos > 0) toast.warning(texto);
    else toast.success(texto);
    void cargar();
  };

  const desconectar = async () => {
    const ok = await confirm({
      title: "¿Desconectar Google?",
      description: "Lo que ya se copió a tu Google Calendar se queda allá, pero ya no se actualiza. Puedes volver a conectarla cuando quieras.",
      intent: "danger",
      confirmLabel: "Desconectar",
    });
    if (!ok) return;
    setOcupado(true);
    const r = await desconectarGoogle();
    setOcupado(false);
    if (!r.ok && r.status !== 404) return void toast.error(r.error);
    toast.success("Google quedó desconectado");
    void cargar();
  };

  return (
    <section className={cn(TARJETA, "space-y-3 px-4 py-3")} aria-label="Google Calendar">
      <div className="flex flex-wrap items-center gap-2">
        <GoogleG />
        <CardTitle>Google Calendar y Tasks</CardTitle>
        <InfoTip
          title="Conectar Google"
          what="Las actividades que avisan por «Google Calendar» se copian a tu calendario apenas las guardas. Las tareas y las notas con fecha van a Google Tasks, en una lista «Buleje»."
          affects="Google Keep no se puede conectar con una cuenta personal (su API es sólo para empresas de Google Workspace); por eso las notas van a Tasks, que se ve dentro de Google Calendar."
          example="Conectas tu Gmail, prendes «Google Calendar» en «Registrar gastos e ingresos» y te sale cada día a las 19:00 en el celular."
          side="bottom"
        />
      </div>

      {conexion === undefined ? (
        <LoadingState message="Mirando la conexión…" />
      ) : conexion === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className={cn("min-w-0 flex-[1_1_16rem] text-sm", error ? "text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]")}>
            {sinConfigurar
              ? "Falta activar Google en el servidor: lo hace quien administra el sistema. Mientras tanto, usa el enlace de calendario de abajo."
              : (error ?? "Todavía no conectaste tu cuenta de Google.")}
          </p>
          <button
            type="button"
            className={button({ variant: "primary" })}
            onClick={conectar}
            disabled={sinConfigurar}
            title={sinConfigurar ? "Google no está activado en este servidor" : undefined}
          >
            Conectar Google Calendar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-[1_1_16rem] space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-[var(--text-primary)]">{conexion.email}</span>
              <span className={cn(CLASE_CHIP_ESTADO, ESTADO[conexion.estado].chip)}>{ESTADO[conexion.estado].rotulo}</span>
            </div>
            <span className="block text-sm text-[var(--text-tertiary)]">
              {conexion.ultimaSync ? `Última copia: ${momento(conexion.ultimaSync)}` : "Todavía no se copió nada"}
              {conexion.tareas ? " · con Google Tasks" : ""}
            </span>
            {conexion.ultimoError && <span className="block text-sm text-[var(--data-error-ink)]">{conexion.ultimoError}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {conexion.estado === "activa" ? (
              <button type="button" className={button({ variant: "secondary" })} onClick={() => void sincronizar()} disabled={ocupado}>
                <RefreshCw className={cn("size-4", ocupado && "motion-safe:animate-spin")} aria-hidden="true" />
                Copiar ahora
              </button>
            ) : (
              <button type="button" className={button({ variant: "primary" })} onClick={conectar}>
                Volver a conectar
              </button>
            )}
            <button type="button" className={button({ variant: "ghost" })} onClick={() => void desconectar()} disabled={ocupado}>
              <Link2Off className="size-4" aria-hidden="true" />
              Desconectar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
