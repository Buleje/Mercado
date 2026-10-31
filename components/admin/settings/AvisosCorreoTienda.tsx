"use client";

import { AlertTriangle, Bell, BellOff, Loader2, Mail, RefreshCw } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { SectionCard } from "@/components/admin/settings/campos";
import { fmtDiaHora } from "@/components/superadmin/tenants/tenant-detalle-shared";
import { useAvisosCorreoTienda } from "@/components/admin/settings/use-avisos-correo-tienda";
import type { AvisosCorreoDeLaTienda } from "@/lib/avisos-correo-tipos";

const TITULO = "Avisos por correo";
const QUE_ES = "Los correos automáticos que te manda Buleje: cada pedido, el stock bajo, los reportes y los avisos de tu plan. Prende o apaga cada uno.";
const ID_FILA = "aviso-correo-";
/* Sólo fuera de producción (24-10): la versión publicada es del 16-07 y no mira este
   interruptor; en el build que lo despliegue esta nota ya sería falsa, por eso no viaja. */
const EN_COPIA_LOCAL =
  process.env.NODE_ENV !== "production"
    ? "En esta copia de prueba: la versión publicada (16 de julio) todavía no lo respeta; lo hará desde el próximo despliegue."
    : undefined;

function resumen(a: AvisosCorreoDeLaTienda): string {
  if (!a.correo) return "No salen: falta el correo";
  if (a.pausado) return "Pausados: no te llega ninguno";
  const activos = a.tipos.filter((t) => t.activo).length;
  return `Te llegan ${activos} de ${a.tipos.length}`;
}

function ultimoCambio(a: AvisosCorreoDeLaTienda): string {
  if (!a.cambio) return "Nadie los cambió todavía: todos encendidos por defecto.";
  return `Último cambio: ${a.cambio.por ?? "la plataforma"} · ${fmtDiaHora(a.cambio.en)}`;
}

/**
 * Configuración › Datos del negocio › «Avisos por correo» (24-10): el dueño
 * prende y apaga los correos automáticos que le llegan, con el mismo estado que
 * el interruptor del superadmin. El encargado lo ve sin poder cambiarlo; cajero
 * y almacenero no lo ven (403 → no se dibuja).
 */
export function AvisosCorreoTienda() {
  const { avisos, estado, errorGuardar, guardando, recargar, cambiarGeneral, cambiarTipo } = useAvisosCorreoTienda();

  if (estado === "sin-permiso") return null;
  if (!avisos) {
    return (
      <SectionCard title={TITULO} desc={QUE_ES}>
        {estado === "error" ? (
          <div className="flex min-h-12 items-center gap-3">
            <p className="text-sm text-[var(--data-error-ink)]">No se pudieron cargar tus avisos por correo.</p>
            <Button variant="secondary" onClick={() => void recargar()} className="ml-auto">
              <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
            </Button>
          </div>
        ) : (
          <p className="flex min-h-12 items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando tus avisos…
          </p>
        )}
      </SectionCard>
    );
  }

  const bloqueado = !avisos.puedeCambiar || guardando !== null;

  return (
    <SectionCard
      title={TITULO}
      desc={QUE_ES}
      accion={
        avisos.puedeCambiar && (
          <Button variant={avisos.pausado ? "primary" : "secondary"} onClick={() => void cambiarGeneral(!avisos.pausado)} disabled={guardando !== null}>
            {guardando === "general" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : avisos.pausado ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            {avisos.pausado ? "Reanudar todos" : "Pausar todos"}
          </Button>
        )
      }
    >
      {/* A dónde llegan */}
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1">
        <Mail className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <span className="min-w-0 truncate text-sm font-bold text-[var(--text-primary)]">{avisos.correo ?? "Sin correo"}</span>
        <InfoTip
          title="Correo de los avisos"
          what="Es el correo con el que creaste tu cuenta. Los avisos salen desde Buleje hacia ese correo, no desde el «Correo del negocio»."
          affects="Para cambiarlo, escríbele a soporte."
        />
        <span className={avisos.pausado || !avisos.correo ? "ml-auto text-sm font-semibold text-[var(--data-warning-ink)]" : "ml-auto text-sm text-[var(--text-secondary)]"}>
          {resumen(avisos)}
        </span>
      </div>

      {/* Uno por uno */}
      <ul className={`divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:divide-[var(--rule-base)] ${avisos.pausado ? "opacity-70" : ""}`}>
        {avisos.tipos.map((t) => (
          <li key={t.tipo} className="flex min-h-12 items-center gap-2 px-3">
            <label htmlFor={`${ID_FILA}${t.tipo}`} className={`min-w-0 truncate text-sm font-semibold text-[var(--text-primary)] ${bloqueado ? "cursor-not-allowed" : "cursor-pointer"}`}>
              {t.nombre}
            </label>
            <InfoTip
              title={t.nombre}
              what={t.descripcion}
              affects={t.ultimoEnvio ? `Último envío: ${fmtDiaHora(t.ultimoEnvio)}` : "Todavía no hay envíos registrados."}
            />
            {guardando === t.tipo && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-hidden />}
            <Interruptor
              variante="solo"
              id={`${ID_FILA}${t.tipo}`}
              label={t.nombre}
              enabled={t.activo}
              disabled={bloqueado}
              onChange={(v) => void cambiarTipo(t.tipo, v)}
              className="ml-auto"
            />
          </li>
        ))}
      </ul>

      {errorGuardar && (
        <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-[var(--data-error-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {errorGuardar}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--text-tertiary)]">
        <span>
          {avisos.pausado
            ? "Mientras estén pausados no sale ninguno, aunque esté encendido."
            : avisos.puedeCambiar
              ? "Se guarda al instante."
              : "Sólo el dueño o el administrador los cambia."}
        </span>
        <InfoTip
          title="Cuándo vale el cambio"
          what="Tu elección queda guardada al instante y vale desde el próximo correo."
          affects={ultimoCambio(avisos)}
          example={EN_COPIA_LOCAL}
        />
      </div>
    </SectionCard>
  );
}
