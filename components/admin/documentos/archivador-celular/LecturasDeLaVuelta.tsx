"use client";

import type { ComponentType } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, CheckCircle2, Loader2, TriangleAlert, Undo2, XCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import type { Lectura, ModoArchivador } from "./use-modo-archivador";

type Tono = "bien" | "info" | "ojo" | "mal" | "neutro";

const TONO: Record<Tono, string> = {
  bien: "border-[var(--data-success-500)] bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15",
  info: "border-[var(--data-info-500)] bg-[var(--data-info-100)] text-[var(--data-info-ink)] dark:bg-[var(--data-info-500)]/15",
  ojo: "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15",
  mal: "border-[var(--data-error-500)] bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15",
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

const ENVIO: Partial<Record<Lectura["envio"], string>> = {
  cola: "se guarda en unos segundos",
  enviando: "guardando…",
  listo: "guardado",
};

/** Qué decir de una lectura: tono, ícono, título y la línea de detalle. */
function describir(l: Lectura): { tono: Tono; Icono: ComponentType<{ className?: string }>; titulo: string; detalle: string } {
  const v = l.veredicto;
  const envio = ENVIO[l.envio];
  if (l.envio === "deshecho") return { tono: "neutro", Icono: Undo2, titulo: "Deshecho", detalle: "Quedó sin registrar" };
  switch (v.estado) {
    case "guardar":
      return { tono: "bien", Icono: CheckCircle2, titulo: "Registrado", detalle: `Va aquí · ${envio ?? "guardado"}` };
    case "ya-estaba":
      return { tono: "info", Icono: CheckCircle, titulo: "Ya estaba registrado", detalle: "Va aquí" };
    case "otro-lugar":
      return {
        tono: "ojo",
        Icono: TriangleAlert,
        titulo: envio ? "Registrado, pero no va aquí" : "No va aquí",
        detalle: `Va en ${v.dondeVa}${v.papel.registrado && !envio ? " · ya estaba registrado" : ""}`,
      };
    case "sin-lugar":
      return {
        tono: "ojo",
        Icono: AlertCircle,
        titulo: envio ? "Registrado sin archivador" : "Su carpeta no dice dónde va",
        detalle: envio ?? "Anota el archivador en su carpeta",
      };
    default:
      return { tono: "mal", Icono: XCircle, titulo: "No es un papel de este negocio", detalle: v.texto || "No se entendió el QR" };
  }
}

function Acciones({ l, m, grande }: { l: Lectura; m: ModoArchivador; grande?: boolean }) {
  const v = l.veredicto;
  const puedeIgual = l.envio === "no" && (v.estado === "otro-lugar" || v.estado === "sin-lugar") && !v.papel.registrado;
  const puedeDeshacer = l.envio === "cola" || l.envio === "enviando" || l.envio === "listo";
  const clase = button({ variant: "secondary", className: cn("shrink-0 gap-1.5", !grande && "px-3") });
  return (
    <>
      {puedeIgual && (
        <button type="button" onClick={() => m.registrarIgual(l.n)} className={clase} data-qa="registrar-igual">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Registrar igual
        </button>
      )}
      {puedeDeshacer && (
        <button
          type="button"
          onClick={() => m.deshacer(l.n).catch((err: unknown) => { console.warn("[archivador] no se pudo deshacer", err); toast.error("No se pudo deshacer: revisa la conexión"); })}
          className={clase}
          title="Era el papel de al lado: quitar el registro"
          data-qa="deshacer-lectura"
        >
          {l.envio === "enviando" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
          {grande ? "Deshacer" : <span className="sr-only">Deshacer</span>}
        </button>
      )}
    </>
  );
}

const codigoDe = (l: Lectura) => (l.veredicto.estado === "desconocido" ? null : formatoCodigoDocumento(l.veredicto.papel.codigo));
const nombreDe = (l: Lectura) => (l.veredicto.estado === "desconocido" ? null : l.veredicto.papel.nombre);

/** La última lectura, grande: se mira de reojo mientras se guarda el papel. */
export function UltimaLectura({ l, m }: { l: Lectura; m: ModoArchivador }) {
  const d = describir(l);
  const codigo = codigoDe(l);
  return (
    <div role="status" aria-live="polite" data-qa="ultima-lectura" data-estado={l.veredicto.estado} className={cn("space-y-2 rounded-xl border-2 p-3", TONO[d.tono])}>
      <div className="flex items-start gap-2">
        <d.Icono className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">{d.titulo}</p>
          {codigo && <p className="font-mono text-lg font-bold tabular-nums">{codigo}</p>}
          {nombreDe(l) && <p className="line-clamp-2 text-sm">{nombreDe(l)}</p>}
          <p className="text-sm">{d.detalle}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 empty:hidden">
        <Acciones l={l} m={m} grande />
      </div>
    </div>
  );
}

/** Lo leído antes en esta vuelta, en filas cortas (la más nueva arriba). */
export function LecturasAnteriores({ lecturas, m }: { lecturas: readonly Lectura[]; m: ModoArchivador }) {
  if (lecturas.length === 0) return null;
  return (
    <ul className="divide-y divide-[var(--rule-base)] rounded-xl border border-[var(--rule-base)]" data-qa="lecturas-anteriores">
      {lecturas.map((l) => {
        const d = describir(l);
        return (
          <li key={l.n} className="flex items-center gap-2 px-3 py-2">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", TONO[d.tono])}>
              <d.Icono className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                {codigoDe(l) && <span className="font-mono tabular-nums">{codigoDe(l)} · </span>}
                {nombreDe(l) ?? d.titulo}
              </span>
              <span className="block truncate text-xs text-[var(--text-secondary)]">{d.titulo} · {d.detalle}</span>
            </span>
            <Acciones l={l} m={m} />
          </li>
        );
      })}
    </ul>
  );
}
