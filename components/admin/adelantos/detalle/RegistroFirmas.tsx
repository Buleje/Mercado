"use client";

/**
 * El registro de firmas y huellas de un adelanto (ADR-491), en su ficha.
 *
 * Cada firma o huella queda como una fila que no se borra ni se cambia: quién
 * firmó, por dónde (la pantalla, su celular con el enlace, o la hoja vieja),
 * la hora de Lima, el monto que vio y el comienzo del sha256 del archivo (el
 * mismo que la puerta privada recalcula al servir la imagen). La vigente es la
 * última de cada tipo; las anteriores quedan como «Reemplazada».
 *
 * Las miniaturas pasan por `GET …/firmas/<id>/imagen` (privada, con sesión):
 * nunca por el bucket público.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileSignature, RefreshCw, Stamp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { rotuloDocumento } from "@/lib/adelantos/comprobante";
import type { CanalFirma, FirmaRegistrada, RegistroFirmasRespuesta } from "@/lib/adelantos/entregar-tipos";
import { fechaHoraLima } from "@/lib/adelantos/recibo-firmado";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { fmtMon } from "../shared";

const CANAL: Record<CanalFirma, string> = {
  PANTALLA: "En la pantalla",
  ENLACE: "Por enlace, en su celular",
  BACKFILL: "Hoja firmada anterior",
};

export default function RegistroFirmas({
  adelantoId,
  monto,
  moneda,
  version = 0,
  onCargado,
}: {
  adelantoId: string;
  monto: number;
  moneda: string;
  /** Sube cuando algo cambió afuera (firmó en la pantalla, se usó un enlace): se vuelve a leer. */
  version?: number;
  /** Para que la ficha sepa si ya hay firma vigente («Firmar de nuevo»). */
  onCargado?: (firmas: FirmaRegistrada[]) => void;
}) {
  const [firmas, setFirmas] = useState<FirmaRegistrada[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [recarga, setRecarga] = useState(0);
  /* `onCargado` cambia en cada render del padre: va por ref para leer de nuevo sólo por id, versión o «Reintentar». */
  const avisar = useRef(onCargado);
  useEffect(() => {
    avisar.current = onCargado;
  });

  useEffect(() => {
    let vivo = true;
    setFallo(false);
    void (async () => {
      try {
        const res = await fetch(`/api/adelantos/${encodeURIComponent(adelantoId)}/firmas`, { credentials: "include", cache: "no-store" });
        const j = res.ok ? await leerJson<RegistroFirmasRespuesta>(res) : null;
        if (!vivo) return;
        if (!j) {
          setFallo(true);
          return;
        }
        setFirmas(j.firmas);
        avisar.current?.(j.firmas);
      } catch (e) {
        logger.error("[adelantos] no se pudo leer el registro de firmas", { error: String(e) });
        if (vivo) setFallo(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [adelantoId, version, recarga]);

  const reintentar = useCallback(() => setRecarga((n) => n + 1), []);

  return (
    <section data-registro-firmas>
      <div className="mb-2 flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
          Firmas y huellas{firmas ? ` (${firmas.length})` : ""}
        </CardTitle>
        <InfoTip
          title="Registro de firmas"
          what="Cada firma o huella queda guardada y no se puede borrar ni cambiar. La vigente es la última de cada tipo; el recibo en PDF usa esa."
          affects="La huella es un dato sensible: sólo se guarda si la persona aceptó el aviso."
          example="Si firmó dos veces, la primera queda abajo como «Reemplazada», con su hora."
        />
      </div>

      {fallo ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--data-error)]">
          No se pudo leer el registro de firmas.
          <button type="button" onClick={reintentar} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-[var(--text-secondary)] hover:underline">
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </p>
      ) : !firmas ? (
        <div className="h-16 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" aria-label="Cargando las firmas" />
      ) : firmas.length === 0 ? (
        <p className="text-base text-[var(--text-tertiary)]">Todavía nadie firmó este adelanto.</p>
      ) : (
        <ul className="space-y-2">
          {firmas.map((f) => (
            <FilaFirma key={f.id} f={f} monto={monto} moneda={moneda} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaFirma({ f, monto, moneda }: { f: FirmaRegistrada; monto: number; moneda: string }) {
  const huella = f.tipo === "HUELLA";
  const otroMonto = f.monedaFirmada !== moneda || Math.abs(f.montoFirmado - monto) >= 0.005;
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-[var(--rule-soft)] px-3 py-2.5" data-firma={f.id} data-vigente={f.vigente || undefined}>
      <a href={f.src} target="_blank" rel="noopener noreferrer" title={`Ver la ${huella ? "huella" : "firma"} completa`} className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API, con sesión */}
        <img
          src={f.src}
          alt={`${huella ? "Huella" : "Firma"} de ${f.firmanteNombre}`}
          className={`${huella ? "h-14 w-11" : "h-12 w-20"} rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] object-contain`}
        />
      </a>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-[var(--text-primary)]">
          {huella ? <Stamp className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden /> : <FileSignature className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
          <span className="min-w-0 truncate">
            {huella ? "Huella" : "Firma"} · {f.firmanteNombre}
          </span>
          <span
            className={
              f.vigente
                ? "rounded-full bg-[var(--data-success)]/12 px-2 py-0.5 text-xs font-bold text-[var(--data-success-ink)]"
                : "rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-tertiary)]"
            }
          >
            {f.vigente ? "Vigente" : "Reemplazada"}
          </span>
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          {CANAL[f.canal]} · {fechaHoraLima(new Date(f.creadoEn))}
          {f.firmanteDocumento ? ` · ${rotuloDocumento(f.firmanteDocumento)}` : ""}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          <span className="font-mono" title={`sha256 ${f.sha256}`}>
            sha256 {f.sha256.slice(0, 10)}
          </span>
          {f.pedidoPor ? ` · anotó ${f.pedidoPor}` : ""}
          {otroMonto && (
            <span className="font-semibold text-[var(--data-warning-ink)]"> · firmó por {fmtMon(f.montoFirmado, f.monedaFirmada)}</span>
          )}
        </p>
      </div>
    </li>
  );
}
