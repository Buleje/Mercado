"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2, RefreshCw, Tablet, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { Button, Interruptor } from "@/components/ui-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import QrImagen from "@/components/tv/QrImagen";
import { logger } from "@/lib/logger";
import { DIAS_VENCE_KIOSKO, DIAS_VENCE_POR_DEFECTO } from "@/lib/rrhh/kiosko";
import { useKioskoAjustes } from "./use-kiosko-ajustes";

/**
 * Kiosko de asistencia (`lib/rrhh/kiosko.ts`) — la tarjeta del dueño en
 * Equipo › Asistencia: encender la marcación, exigir o no la foto, generar o
 * revocar el enlace de la tablet y ver su QR para abrirlo en ella. El enlace
 * se muestra UNA vez y queda atado a la primera tablet que lo abre
 * (`lib/rrhh/kiosko-aparato.ts`): no se imprime, porque un QR impreso al
 * alcance de todos dejaba marcar desde cualquier celular (security 10-10 H1).
 */

const FECHA = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" });
const fecha = (iso: string | null) => (iso ? FECHA.format(new Date(iso)) : "—");

export default function KioskoAsistenciaAjustes() {
  const { resumen, cargando, guardando, error, recien, cambiarActivo, cambiarSinFoto, generar, revocar } = useKioskoAjustes();
  const [dias, setDias] = useState<number>(DIAS_VENCE_POR_DEFECTO);
  const [copiado, setCopiado] = useState(false);

  const copiar = (url: string) => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      })
      .catch((err: unknown) => logger.warn("[kiosko-ajustes] no se pudo copiar", { error: String(err) }));
  };

  const enlace = resumen?.enlace ?? null;
  const pedirOtro = () => {
    if (enlace && !window.confirm("El enlace anterior deja de servir y la tablet se suelta: tendrás que abrir el nuevo en ella. ¿Generar uno nuevo?")) return;
    void generar(dias);
  };
  const quitar = () => {
    if (window.confirm("La tablet ya no podrá marcar con ese enlace. ¿Revocarlo?")) void revocar();
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" aria-busy={cargando}>
      <div className="flex items-center gap-2">
        <CardTitle>Kiosko de asistencia</CardTitle>
        <InfoTip
          what="Cada trabajador marca su entrada y su salida en la tablet del local, mostrando el QR de su fotocheck (o escribiendo su DNI). Cada marca guarda una foto y la IP."
          affects="La marca entra a la hoja de asistencia como «kiosko», con la tardanza según el horario del puesto. Dos marcas de la misma persona en menos de 2 minutos cuentan una sola vez. El enlace queda atado a la primera tablet que lo abre: en un celular no marca."
          example="Ana muestra su fotocheck a las 07:52 → «¡Listo, Ana! Entrada 07:52». Su foto queda en Cámaras › Asistencia."
        />
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
        </p>
      ) : resumen ? (
        <>
          <Interruptor
            label="Marcación en el kiosko"
            desc={resumen.activo ? "Encendida: la tablet puede marcar." : "Apagada: nadie puede marcar en la tablet."}
            enabled={resumen.activo}
            onChange={cambiarActivo}
            disabled={guardando}
          />
          <Interruptor
            label="Marcar sin foto"
            desc={
              resumen.permitirSinFoto
                ? "Permitido: si la cámara falla, se marca igual (queda anotado «sin foto»)."
                : "No: sin foto no hay marca. La foto es la prueba de quién marcó."
            }
            enabled={resumen.permitirSinFoto}
            onChange={cambiarSinFoto}
            disabled={guardando}
          />

          {enlace ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <Link2 className="h-4 w-4" aria-hidden />
                Enlace …{enlace.termina ?? "????"}
              </span>
              <span className={enlace.estado === "vencido" ? "font-semibold text-[var(--data-error-700)]" : undefined}>
                {enlace.estado === "vencido" ? `Venció el ${fecha(enlace.venceEn)}` : `Vence el ${fecha(enlace.venceEn)}`}
              </span>
              <span className="text-[var(--text-tertiary)]">
                Creado el {fecha(enlace.creadoEn)}
                {enlace.creadoPor ? ` por ${enlace.creadoPor}` : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <Tablet className="h-4 w-4" aria-hidden />
                {enlace.aparato
                  ? `Atado a ${enlace.aparato.nombre ?? "una tablet"} desde el ${fecha(enlace.aparato.desde)}`
                  : "Sin tablet: se ata a la primera que lo abra"}
              </span>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">Todavía no hay enlace para la tablet.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              Vence en
              <select
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                className="h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
              >
                {DIAS_VENCE_KIOSKO.map((d) => (
                  <option key={d} value={d}>
                    {d} días
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" onClick={pedirOtro} disabled={guardando}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {enlace ? "Generar otro enlace" : "Generar enlace"}
            </Button>
            {enlace && (
              <Button type="button" variant="ghost" onClick={quitar} disabled={guardando}>
                <Trash2 className="h-4 w-4" aria-hidden /> Revocar
              </Button>
            )}
          </div>

          {recien && enlace?.aparato && (
            <p className="flex items-center gap-2 text-sm text-[var(--data-success-700)]" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Listo: el enlace quedó atado a {enlace.aparato.nombre ?? "la tablet"}.
            </p>
          )}
          {recien && enlace && !enlace.aparato && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 sm:flex-row">
              <QrImagen texto={recien} lado={176} alt="QR del enlace del kiosko" className="h-44 w-44 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-semibold text-[var(--data-warning-ink)]">
                  Escanéalo con la tablet del local: queda atado a la primera que lo abra. No lo imprimas ni lo compartas.
                </p>
                <code className="break-all rounded bg-[var(--surface-sunken)] px-2 py-1 text-xs text-[var(--text-secondary)]">{recien}</code>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => copiar(recien)}>
                    <Copy className="h-4 w-4" aria-hidden /> {copiado ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                {!resumen.activo && <p className="text-xs text-[var(--text-tertiary)]">Enciende la marcación para que la tablet pueda abrirlo.</p>}
              </div>
            </div>
          )}
        </>
      ) : null}

      {error && (
        <p className="text-sm text-[var(--data-error-700)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
