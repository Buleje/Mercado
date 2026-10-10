"use client";

/**
 * Un archivo dentro de un casillero (o suelto en la carpeta): miniatura, nombre,
 * peso, su vencimiento —el MISMO dato que el filtro «Por vencer» del Drive— y
 * ver / quitar. En un alta todavía no subió: dice «se sube al guardar».
 */

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, Eye, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Trash2 } from "@buleje/design-system/icons";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { formatNumber } from "@/lib/format";
import type { ArchivoVista } from "./modelo";
import type { EstadoSubida } from "../hooks/use-plan-documentos";

const ICONO_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-40";

export function peso(b: number): string {
  if (b >= 1024 * 1024) return `${formatNumber(b / 1024 / 1024, 1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function IconoTipo({ mime }: { mime: string }) {
  const Icono = mime.startsWith("image/") ? ImageIcon : /sheet|excel|csv/.test(mime) ? FileSpreadsheet : FileText;
  return <Icono className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden="true" />;
}

export default function ArchivoFila({
  archivo,
  ocupado,
  onVer,
  onQuitar,
  onVence,
}: {
  archivo: ArchivoVista;
  ocupado: boolean;
  onVer: () => void;
  onQuitar: () => void;
  onVence: (fecha: string | null) => void;
}) {
  const id = useId();
  /* El vencimiento se guarda cuando la fecha está entera, no en cada tecla:
     al tipear el año, el campo pasa por 0002, 0020, 0202 antes de 2026, y cada
     uno era un PATCH con una fecha absurda. Lo elegido en el calendario llega
     entero de una vez; lo tipeado se confirma al salir del campo. */
  const [borrador, setBorrador] = useState(archivo.vence ?? "");
  /* Lo último que se mandó: el blur que sigue a una fecha ya confirmada no la
     vuelve a mandar mientras la vista todavía no trajo el valor nuevo. */
  const enviado = useRef<string | null>(archivo.vence ?? null);
  useEffect(() => {
    setBorrador(archivo.vence ?? "");
    enviado.current = archivo.vence ?? null;
  }, [archivo.vence]);
  const reloj = useRef<number | null>(null);
  useEffect(() => () => { if (reloj.current) window.clearTimeout(reloj.current); }, []);
  const confirmar = (v: string) => {
    if (reloj.current) window.clearTimeout(reloj.current);
    reloj.current = null;
    const valor = v || null;
    if (valor === enviado.current) return;
    enviado.current = valor;
    onVence(valor);
  };
  /* Tipeando, el campo pasa por fechas que nadie quiso (vacío al borrar un
     tramo, el mes nuevo con el día viejo): se espera a que la mano pare. Salir
     del campo confirma en el acto, también el vaciado. */
  const entera = (v: string) => /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(v);
  const programar = (v: string) => {
    if (reloj.current) window.clearTimeout(reloj.current);
    reloj.current = entera(v) ? window.setTimeout(() => confirmar(v), 900) : null;
  };
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--surface-sunken)] p-1.5">
      <button
        type="button"
        onClick={onVer}
        title={`Ver «${archivo.nombre}»`}
        aria-label={`Ver «${archivo.nombre}»`}
        className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]"
      >
        {archivo.documentId && !archivo.pendiente ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura del Drive (ruta propia con caché), next/image no aporta
          <img src={urlMiniatura(archivo.documentId)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <IconoTipo mime={archivo.mimeType} />
        )}
      </button>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={archivo.nombre}>
          {archivo.nombre}
        </p>
        <p className="truncate text-xs text-[var(--text-tertiary)]">
          {peso(archivo.size)}
          {archivo.pendiente && !archivo.error ? " · se sube al guardar" : ""}
        </p>
        {archivo.error && (
          <p className="flex items-center gap-1 text-xs font-semibold text-[var(--data-error-ink)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {archivo.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <label htmlFor={`${id}-vence`} className="text-xs font-semibold text-[var(--text-secondary)]">
          Vence
        </label>
        <input
          id={`${id}-vence`}
          type="date"
          value={borrador}
          disabled={ocupado}
          title="Si el papel vence (DNI, vigencia de poder), Documentos te avisa antes"
          onChange={(e) => {
            setBorrador(e.target.value);
            programar(e.target.value);
          }}
          onBlur={(e) => confirmar(e.target.value)}
          className="h-9 w-[9.5rem] rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        <button type="button" onClick={onVer} className={ICONO_BTN} title="Ver" aria-label={`Ver «${archivo.nombre}»`}>
          <Eye className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onQuitar}
          disabled={ocupado}
          className={`${ICONO_BTN} hover:text-[var(--data-error-ink)]`}
          title={archivo.pendiente ? "Quitar de la lista" : "Mandar a la papelera de Documentos (se puede recuperar)"}
          aria-label={`Quitar «${archivo.nombre}»`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

const TEXTO_SUBIDA: Record<EstadoSubida, string> = {
  "en-cola": "en cola",
  comprimiendo: "achicando la foto",
  subiendo: "subiendo",
  listo: "listo",
  error: "no subió",
};

/** Un archivo viajando al Drive: su nombre y en qué va. */
export function FilaSubida({ nombre, estado, motivo, onDescartar }: { nombre: string; estado: EstadoSubida; motivo?: string; onDescartar: () => void }) {
  const error = estado === "error";
  return (
    <li
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${
        error ? "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10" : "border-[var(--rule-soft)] bg-[var(--surface-raised)]"
      }`}
    >
      {error ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden="true" />
      ) : estado === "listo" ? (
        <Check className="h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden="true" />
      ) : (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent-ink)]" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]" title={nombre}>
        {nombre}
      </span>
      <span className="shrink-0 text-[var(--text-secondary)]">{error ? motivo ?? TEXTO_SUBIDA.error : TEXTO_SUBIDA[estado]}</span>
      {error && (
        <button type="button" onClick={onDescartar} className="shrink-0 font-semibold text-[var(--text-secondary)] underline underline-offset-2">
          Cerrar
        </button>
      )}
    </li>
  );
}
