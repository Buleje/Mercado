"use client";

import { Mail, Bell, BellOff, Loader2, CalendarDays, AlertTriangle, RefreshCw, Pencil } from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert, LoadingState } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ChipEstado } from "@/components/superadmin/tenants/TenantDetalleChip";
import { fmtDia, fmtDiaHora } from "@/components/superadmin/tenants/tenant-detalle-shared";
import { useAvisosCorreo } from "@/components/superadmin/tenants/useAvisosCorreo";

interface TenantDetalleAvisosProps {
  slug: string;
  /** Abre la edición de la cabecera con el foco en el correo. */
  onEditarCorreo: () => void;
  /** Refresca la lista (el bloque de avisos de la tarjeta). */
  onUpdated?: () => void;
  /** Sube al guardar el nombre/correo en la cabecera: vuelve a pedir el estado. */
  recargarCon?: unknown;
}

const CAJA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]";

/** Pestaña «Avisos por correo»: a qué correo le llegan los avisos automáticos de la tienda y cuáles salen. */
export function TenantDetalleAvisos({ slug, onEditarCorreo, onUpdated, recargarCon }: TenantDetalleAvisosProps) {
  const { avisos, cargando, error, errorGuardar, guardando, recargar, cambiarGeneral, cambiarTipo } = useAvisosCorreo(slug, onUpdated, recargarCon);

  if (cargando && !avisos) return <LoadingState message="Cargando avisos por correo…" />;
  if (error && !avisos) {
    return (
      <ErrorAlert
        title="No se pudo ver los avisos"
        description={error}
        action={
          <button type="button" onClick={() => void recargar()} className={button({ variant: "secondary", size: "md" })}>
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
        }
      />
    );
  }
  if (!avisos) return null;

  const sinCorreo = !avisos.correo?.trim();
  const aplican = avisos.tipos.filter((x) => x.aplica);

  return (
    <div className="space-y-6">
      {/* 1. A dónde llegan */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CardTitle>Correo que recibe los avisos</CardTitle>
          <InfoTip
            title="Correo de los avisos"
            what="Es el correo de la dueña o dueño de la tienda. Los avisos automáticos (pedidos, stock bajo, reportes…) salen desde la plataforma hacia ese correo."
            affects={avisos.smtpPropio ? `La tienda configuró su propio servidor (${avisos.smtpPropio}), pero hoy los avisos salen igual desde la plataforma.` : "Se cambia con el lápiz de la cabecera."}
          />
        </div>
        {sinCorreo ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> No hay correo: los avisos no salen.
            </p>
            <button type="button" onClick={onEditarCorreo} className={button({ variant: "secondary", size: "md" })}>
              <Pencil className="h-4 w-4" /> Agregar correo
            </button>
          </div>
        ) : (
          <div className={`${CAJA} flex items-center gap-3 p-4`}>
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{avisos.correo}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {avisos.pausado ? "Pausados: no le llega ningún aviso" : `Le llegan ${avisos.activos} de ${avisos.total} tipos de aviso`}
              </p>
            </div>
            {avisos.esGmail && <ChipEstado tono="acento">Gmail</ChipEstado>}
          </div>
        )}
      </section>

      {/* 2. Interruptor general */}
      <section className={`${CAJA} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex min-w-0 items-center gap-3">
          {avisos.pausado ? (
            <BellOff className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden="true" />
          ) : (
            <Bell className="h-5 w-5 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden="true" />
          )}
          <p className="text-sm font-semibold text-[var(--text-primary)]">Avisos por correo</p>
          <ChipEstado tono={avisos.pausado ? "alerta" : "ok"}>{avisos.pausado ? "Pausados" : "Activos"}</ChipEstado>
        </div>
        <button
          type="button"
          onClick={() => void cambiarGeneral(!avisos.pausado)}
          disabled={guardando !== null}
          className={button({ variant: avisos.pausado ? "primary" : "secondary", size: "md" })}
        >
          {guardando === "general" ? <Loader2 className="h-4 w-4 animate-spin" /> : avisos.pausado ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          {avisos.pausado ? "Habilitar de nuevo" : "Deshabilitar todos"}
        </button>
      </section>

      {errorGuardar && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">
          {errorGuardar}
        </p>
      )}

      {/* 3. Uno por uno */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CardTitle>Qué avisos salen</CardTitle>
          <InfoTip
            title="Tipos de aviso"
            what="Cada interruptor prende o apaga un tipo de correo. Pausar todos no borra lo que elegiste aquí: al habilitar de nuevo vuelven estos mismos."
            example={`Esta tienda usa ${aplican.length} de ${avisos.tipos.length} tipos; los otros se ven atenuados.`}
          />
        </div>
        {avisos.pausado && (
          <p className="text-xs text-[var(--text-secondary)]">Mientras estén pausados no sale ninguno, aunque esté encendido.</p>
        )}
        <div className={`space-y-2 ${avisos.pausado ? "opacity-70" : ""}`}>
          {avisos.tipos.map((x) => (
            <Interruptor
              key={x.tipo}
              label={x.nombre}
              enabled={x.activo}
              disabled={!x.aplica || guardando !== null}
              onChange={(v) => void cambiarTipo(x.tipo, v)}
              desc={
                <>
                  {x.descripcion}
                  <span className="mt-0.5 block text-[var(--text-tertiary)]">
                    {!x.aplica ? "Esta tienda no usa ese módulo" : x.ultimoEnvio ? `Último envío: ${fmtDiaHora(x.ultimoEnvio)}` : "Sin envíos registrados"}
                  </span>
                </>
              }
            />
          ))}
        </div>
      </section>

      {/* 4. Google conectado (Agenda) */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CardTitle>Cuentas de Google en la Agenda</CardTitle>
          <InfoTip title="Google en la Agenda" what="Cuentas de Google que la tienda conectó para su calendario. No cambian a qué correo llegan los avisos." />
        </div>
        {avisos.google.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Ninguna.</p>
        ) : (
          <ul className={`${CAJA} divide-y divide-[var(--rule-soft)] dark:divide-[var(--rule-base)]`}>
            {avisos.google.map((g) => (
              <li key={g.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{g.email}</span>
                <ChipEstado tono={g.estado === "activa" ? "ok" : "neutro"}>{g.estado}</ChipEstado>
                <span className="w-full pl-7 text-xs text-[var(--text-tertiary)] sm:w-auto sm:pl-0">
                  {g.ultimaSync ? `Sincronizó el ${fmtDia(g.ultimaSync)}` : "Sin sincronizar"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-[var(--text-tertiary)]">
        {avisos.cambiadoEn
          ? `Último cambio: ${avisos.cambiadoPor ?? "superadmin"} · ${fmtDiaHora(avisos.cambiadoEn)}`
          : "Nadie los cambió todavía: todos encendidos por defecto."}
      </p>
    </div>
  );
}
