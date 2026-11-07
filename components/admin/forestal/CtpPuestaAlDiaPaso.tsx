"use client";

/**
 * Un renglón de «Para poner al día» (`CtpPermisoPuestaAlDia`): la marca del
 * estado, el paso con su cifra y el botón que abre el arreglo.
 *
 * El estado se ve sin leer (círculo con número, ✓, reloj o alerta) y además se
 * dice en texto al lector de pantalla. Lo hecho se tacha. El botón principal
 * es sólo el del paso actual; los demás van en el secundario.
 */

import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  Check,
  Clock,
  Coins,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type { ClavePaso, PasoPuestaAlDia } from "@/lib/forestal/puesta-al-dia-del-permiso";
import { Btn } from "./ctp-shared";

const ICONO: Record<ClavePaso, LucideIcon> = {
  fecha: CalendarClock,
  trozas: ArrowLeftRight,
  precio: Coins,
  descontar: Layers,
};

const MARCA = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold";

function Marca({ paso }: { paso: PasoPuestaAlDia }) {
  switch (paso.estado) {
    case "hecho":
      return (
        <span className={`${MARCA} bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)]`}>
          <Check className="h-4 w-4" aria-hidden />
          <span className="sr-only">Hecho:</span>
        </span>
      );
    case "cargando":
      return (
        <span className={`${MARCA} border border-[var(--rule-base)] text-[var(--text-tertiary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="sr-only">Revisando:</span>
        </span>
      );
    case "espera":
      return (
        <span className={`${MARCA} border border-dashed border-[var(--rule-strong)] text-[var(--text-secondary)]`}>
          <Clock className="h-4 w-4" aria-hidden />
          <span className="sr-only">Esperando al paso anterior:</span>
        </span>
      );
    case "revisar":
    case "error":
      return (
        <span className={`${MARCA} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]`}>
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span className="sr-only">{paso.estado === "error" ? "No se pudo revisar:" : "Para revisar:"}</span>
        </span>
      );
    default:
      return (
        <span className={`${MARCA} border-2 border-[var(--accent-dark)] text-[var(--text-primary)]`}>
          {paso.numero}
          <span className="sr-only">. Pendiente:</span>
        </span>
      );
  }
}

function Accion({
  paso,
  esActual,
  firma,
  onAbrir,
  onReintentar,
}: {
  paso: PasoPuestaAlDia;
  esActual: boolean;
  firma: boolean;
  onAbrir: () => void;
  onReintentar: () => void;
}) {
  if (paso.estado === "error") {
    return (
      <Btn onClick={onReintentar} className="shrink-0">
        <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
      </Btn>
    );
  }
  if (!paso.accion) return null;
  if (paso.soloAdmin && !firma) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <Lock className="h-4 w-4" aria-hidden /> Pídele a un administrador
      </span>
    );
  }
  const Icono = ICONO[paso.clave];
  return (
    <Btn
      variant={esActual && paso.estado === "pendiente" ? "primary" : "secondary"}
      onClick={onAbrir}
      className="shrink-0"
      aria-label={`${paso.accion} — paso ${paso.numero}`}
    >
      <Icono className="h-4 w-4" aria-hidden /> {paso.accion}
    </Btn>
  );
}

export default function CtpPuestaAlDiaPaso({
  paso,
  esActual,
  firma,
  onAbrir,
  onReintentar,
}: {
  paso: PasoPuestaAlDia;
  /** El «n de 4»: fondo hundido y el único botón principal. */
  esActual: boolean;
  /** Quien mira puede firmar los pasos de admin/dueño. */
  firma: boolean;
  onAbrir: () => void;
  onReintentar: () => void;
}) {
  const Icono = ICONO[paso.clave];
  const hecho = paso.estado === "hecho";
  return (
    <li
      aria-current={esActual ? "step" : undefined}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 ${esActual ? "bg-[var(--surface-sunken)]" : ""}`}
    >
      <Marca paso={paso} />
      <div className="min-w-0 grow basis-[14rem]">
        <p
          className={`flex flex-wrap items-center gap-x-2 text-sm ${
            hecho ? "text-[var(--text-tertiary)] line-through" : "font-semibold text-[var(--text-primary)]"
          }`}
        >
          <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          {hecho ? paso.nombre : paso.titulo}
          {paso.estado === "espera" && (
            <span className="rounded-full border border-dashed border-[var(--rule-strong)] px-2 text-xs font-bold text-[var(--text-secondary)]">
              Espera al paso anterior
            </span>
          )}
        </p>
        {paso.detalle && <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{paso.detalle}</p>}
      </div>
      <Accion paso={paso} esActual={esActual} firma={firma} onAbrir={onAbrir} onReintentar={onReintentar} />
    </li>
  );
}
