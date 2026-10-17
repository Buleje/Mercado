"use client";

/**
 * Una guía en la cola «Por imprimir» del monte (16-10), pensada para el celular
 * a 400 px: el N° de guía grande, «Usa la hoja N° …» resaltado, por cada hoja
 * «Imprimir directo» (ESC/P a la matricial) y «PDF (tamaño real)», y después
 * «Ya la imprimí» + la foto con el N° de la hoja. Botones de 56 px.
 */

import { useState } from "react";
import { FileDown, Printer, CheckCircle2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { ETIQUETA_HOJA, correlativoDeGuia, rutaSalida, type TrabajoCola } from "@/lib/forestal/gtf-cola-monte";
import type { HojaSalida } from "@/lib/forestal/gtf-salida-tipos";
import { avisoRecortados, bajarSalida, descargarBlob } from "@/lib/forestal/gtf-cola-monte-imprimir";
import { useFotoHojaMonte } from "./hooks/use-foto-hoja-monte";
import { useImprimirDirecto } from "./hooks/use-imprimir-directo";
import { AvisoImpresionDirecta, AvisoRecortes } from "./gtf-impresion-directa";
import type { CambioTrabajo, Respuesta } from "./hooks/use-cola-monte";
import ConfirmarHojaMonte, { BotonFoto } from "./gtf-cola-monte-confirmar";
import { PastillaEstadoMonte, botonMonte, cuandoLima } from "./gtf-cola-monte-ui";

type Formato = "pdf" | "escp";

export default function TarjetaTrabajoMonte({
  t,
  cambiar,
  resaltado = false,
}: {
  t: TrabajoCola;
  cambiar: (id: string, c: CambioTrabajo) => Promise<Respuesta<unknown>>;
  resaltado?: boolean;
}) {
  const foto = useFotoHojaMonte(t, cambiar);
  const directo = useImprimirDirecto();
  const [bajando, setBajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recortesPdf, setRecortesPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState(false);
  const hoja = correlativoDeGuia(t.numeroGuia) ?? t.numeroGuia;
  const conConfirmar = t.estado !== "pendiente" || !!t.fotoDocId || !!foto.vista;

  const sacar = async (h: HojaSalida, formato: Formato) => {
    setBajando(`${h}-${formato}`);
    setError(null);
    setAviso(null);
    setRecortesPdf(null);
    directo.limpiar();
    const url = rutaSalida({ gtfId: t.gtfId, formato, perfilId: t.perfilId, hoja: h, formaId: t.formaId });
    const nombre = `guia-${t.numeroGuia}-${h}.${formato === "pdf" ? "pdf" : "prn"}`;
    /* ESC/P por el cable USB: el permiso se pide dentro del toque, antes de bajar la hoja. */
    if (formato === "escp") {
      await directo.imprimir(url, nombre);
      return setBajando(null);
    }
    const r = await bajarSalida(url, nombre);
    setBajando(null);
    if (!r.ok) return setError(r.mensaje);
    descargarBlob(r.blob, r.nombre);
    setAviso("PDF en Descargas: Imprimir → Tamaño real / 100 %, sin márgenes.");
    setRecortesPdf(avisoRecortados(r.recortados));
  };

  const marcarImpresa = async () => {
    setMarcando(true);
    setError(null);
    const r = await cambiar(t.id, { accion: "impresa" });
    setMarcando(false);
    if (!r.ok) setError(r.mensaje);
  };

  const confirmar = async (numeroHoja: string) => {
    const r = await cambiar(t.id, { accion: "confirmar", numeroHoja });
    return r.ok ? null : r.mensaje;
  };

  return (
    <article
      id={`trabajo-${t.id}`}
      className={cn(
        "space-y-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-sm",
        resaltado && "ring-2 ring-[var(--accent)]",
      )}
      data-qa="tarjeta-monte"
    >
      {/* La pastilla va arriba, con la fecha: al lado del N° lo partía en dos renglones a 400 px. */}
      <header className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">Guía · {cuandoLima(t.creadoEn)}</p>
          <PastillaEstadoMonte estado={t.estado} conFoto={!!t.fotoDocId} className="shrink-0" />
        </div>
        <p className="break-all font-mono text-2xl font-black tabular-nums text-[var(--text-primary)]">{t.numeroGuia}</p>
        {t.titular && <p className="truncate text-sm text-[var(--text-secondary)]">{t.titular}</p>}
      </header>

      <div className="rounded-xl bg-[var(--accent)]/10 px-4 py-3 text-center">
        {/* Una reimpresión va en OTRA hoja (la de este N° se dañó): el N° es el de la guía, y el control lo anota. */}
        <p className="text-sm font-bold text-[var(--text-secondary)]">{t.reimpresion ? "Reimprímela en otra hoja · guía N°" : "Usa la hoja N°"}</p>
        <p className="font-mono text-4xl font-black tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]" data-qa="hoja-a-usar">{hoja}</p>
      </div>

      {t.reimpresion && (
        <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" data-qa="reimpresion-monte">
          Reimpresión: {t.reimpresion}
        </p>
      )}
      {t.estado === "observada" && t.observacion && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-50)] px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" data-qa="observacion-monte">
          Observada: {t.observacion}
        </p>
      )}

      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          Imprimir
          <InfoTip
            title="Cómo imprimir"
            what="«Imprimir directo» manda la hoja a la matricial por el cable USB (Chrome de Android + adaptador OTG). La 1.ª vez Chrome te pide elegir la impresora."
            affects="Si no se puede (iPhone, sin cable), te deja bajar el .prn o abrirlo en RawBT. El PDF sirve para cualquier impresora."
            example="PDF: Imprimir → Tamaño real / 100 %, sin márgenes."
          />
        </p>
        {t.hojas.map((h) => (
          <div key={h} className="space-y-1.5">
            {t.hojas.length > 1 && <p className="text-xs font-bold text-[var(--text-secondary)]">{ETIQUETA_HOJA[h]}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={bajando !== null} onClick={() => void sacar(h, "escp")} className={botonMonte("marca")} data-qa={`imprimir-directo-${h}`}>
                <Printer className="h-5 w-5 shrink-0" aria-hidden /> {bajando === `${h}-escp` ? "Imprimiendo…" : "Imprimir directo"}
              </button>
              <button type="button" disabled={bajando !== null} onClick={() => void sacar(h, "pdf")} className={botonMonte("claro")} data-qa={`pdf-${h}`}>
                <FileDown className="h-5 w-5 shrink-0" aria-hidden /> {bajando === `${h}-pdf` ? "Bajando…" : "PDF (tamaño real)"}
              </button>
            </div>
          </div>
        ))}
        {(error ?? aviso) && (
          <p role={error ? "alert" : "status"} className={cn("text-sm font-bold", error ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]")}>
            {error ?? aviso}
          </p>
        )}
        <AvisoRecortes texto={recortesPdf} />
        <AvisoImpresionDirecta d={directo} />
      </div>

      {t.estado === "pendiente" && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={marcando} onClick={() => void marcarImpresa()} className={botonMonte("oscuro")} data-qa="ya-la-imprimi">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> {marcando ? "Guardando…" : "Ya la imprimí"}
          </button>
          {!conConfirmar && <BotonFoto foto={foto} texto="Subir foto" />}
        </div>
      )}
      {conConfirmar && <ConfirmarHojaMonte t={t} foto={foto} onConfirmar={confirmar} />}
    </article>
  );
}
