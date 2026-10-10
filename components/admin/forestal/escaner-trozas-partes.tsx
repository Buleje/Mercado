"use client";

/**
 * Las piezas del escáner de trozas (`EscanerTrozas.tsx`): cómo se nombra una
 * troza, el renglón del resultado con sus candidatas y la cámara encima de lo
 * que haya abierto. Separadas para que el escáner quede en su lógica.
 */

import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2, XCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import EncimaDeRadix from "@/components/admin/shared/encima-de-radix";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { LABEL_BLOQUEO, motivoBloqueo, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveDeCodigo, type TrozaEscaneable } from "@/lib/forestal/leer-escaneo-troza";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

export type TrozaDelEscaner = TrozaEscaneable & {
  especieComun?: string | null;
  /** Para distinguir dos candidatas con el mismo código: de qué guía y cuánto. */
  gtfNumber?: string | null;
  volumenM3?: number | null;
};

/** Lo que separa a dos trozas con el mismo código: el otro código, la guía, el volumen. */
function senasDeCandidata(t: TrozaDelEscaner): string {
  const senas: string[] = [];
  if (
    t.codificacion &&
    t.codigoPlanta &&
    claveDeCodigo(t.codificacion) !== claveDeCodigo(t.codigoPlanta)
  ) {
    senas.push(t.codificacion);
  }
  if (t.gtfNumber) senas.push(`guía ${t.gtfNumber}`);
  if (t.volumenM3 != null) senas.push(`${fmtM3(Number(t.volumenM3))} m³`);
  return senas.join(" · ");
}

export type Tono = "ok" | "ya" | "no" | "varias";

export interface Aviso<T> {
  tono: Tono;
  mensaje: string;
  candidatas?: T[];
  /** Para que dos lecturas iguales seguidas se anuncien igual (aria-live). */
  n: number;
}

/** El motivo de T1 (ADR-326) en palabras: lo que usan despacho y sierra. */
export function bloqueoDeConsumo(t: TrozaConsumible): string | null {
  const m = motivoBloqueo(t);
  return m ? LABEL_BLOQUEO[m] : null;
}

/** Cómo se nombra una troza en el aviso: su marca de planta, si la tiene. */
export function nombreDeTroza(t: TrozaDelEscaner): string {
  const codigo = t.codigoPlanta?.trim() || t.codificacion?.trim() || t.id.slice(-6);
  return t.especieComun ? `${codigo} · ${t.especieComun}` : codigo;
}

const TONO: Record<Tono, { caja: string; Icono: typeof CheckCircle2 }> = {
  ok: {
    caja: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
    Icono: CheckCircle2,
  },
  ya: {
    caja: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
    Icono: AlertTriangle,
  },
  varias: {
    caja: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
    Icono: AlertTriangle,
  },
  no: {
    caja: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
    Icono: XCircle,
  },
};

export function LineaResultado<T extends TrozaDelEscaner>({
  aviso,
  onElegir,
}: {
  aviso: Aviso<T>;
  onElegir: (t: T) => void;
}) {
  const { caja, Icono } = TONO[aviso.tono];
  return (
    <div className={cn("rounded-xl border-2 px-3 py-2", caja)} data-escaner-resultado={aviso.tono}>
      <p className="flex items-start gap-2 text-base font-bold">
        <Icono className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <span className="min-w-0">{aviso.mensaje}</span>
      </p>
      {aviso.candidatas && aviso.candidatas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {aviso.candidatas.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onElegir(t)}
              className="inline-flex min-h-12 flex-col items-start justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-left text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
            >
              {nombreDeTroza(t)}
              {senasDeCandidata(t) && (
                <span className="font-normal text-[var(--text-secondary)]">
                  {senasDeCandidata(t)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La cámara del celular encima de lo que haya abierto (un `AdminModal` de Radix
 * incluido: sin `EncimaDeRadix` el lector se veía pero no recibía clics) y con
 * los tokens del PANEL — el portal cuelga del `body`, que lleva los de la tienda.
 */
export function CamaraEscaneo({
  onLectura,
  onCerrar,
  continuo = false,
  pie,
}: {
  onLectura: (texto: string) => void;
  onCerrar: () => void;
  continuo?: boolean;
  pie?: React.ReactNode;
}) {
  const tokens = usePanelTokens(true);
  return (
    <EncimaDeRadix titulo="Escanear trozas con la cámara">
      <div className="contents" style={tokens}>
        <BarcodeScanner continuo={continuo} onDetected={onLectura} onClose={onCerrar} pie={pie} />
      </div>
    </EncimaDeRadix>
  );
}
