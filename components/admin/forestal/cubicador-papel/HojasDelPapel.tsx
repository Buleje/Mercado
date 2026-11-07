"use client";

/**
 * «Papel»: la foto o el PDF de la hoja ya llena, guardada en el Archivo y
 * vinculada a la cubicación. Se toma con la cámara del celular o se sube; se
 * ve, se cambia (versión nueva, la anterior queda en el historial del Archivo)
 * o se quita (a la papelera). Una cubicación de varias hojas lleva varias.
 */
import { useRef, useState } from "react";
import { ArrowUpRight, Camera, Eye, FileText, Loader2, RefreshCw, Trash2, Upload } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import { limaDateKey } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { urlDelPapel, urlEnElArchivo } from "./papel-api";
import type { PapelDeCubicacion } from "./use-papel";

const BOTON = button({ variant: "secondary", className: "rounded-xl px-3" });
const PRINCIPAL = button({ variant: "primary", className: "rounded-xl px-3" });
const ICONO = button({ variant: "ghost", size: "icon", className: "rounded-xl" });
const ACEPTA = "image/*,application/pdf";

export default function HojasDelPapel({ papel, cubicacionId }: { papel: PapelDeCubicacion; cubicacionId: string }) {
  const camara = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const reemplazo = useRef<HTMLInputElement>(null);
  const [aCambiar, setACambiar] = useState<DbDocument | null>(null);
  const { hojas, cargando, error, ocupado, codigo } = papel;
  const libre = ocupado === null && codigo !== null;

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>, fn: (f: File) => Promise<void>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void fn(f);
  };
  const quitar = (d: DbDocument) => {
    if (window.confirm(`¿Quitar «${d.name}»? Va a la papelera del Archivo y de ahí se recupera.`)) void papel.quitar(d);
  };

  return (
    <div className="space-y-2" data-vista="papel-del-cubicador">
      <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => alElegir(e, papel.subir)} data-entrada="papel-camara" />
      <input ref={archivo} type="file" accept={ACEPTA} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => alElegir(e, papel.subir)} data-entrada="papel-archivo" />
      <input ref={reemplazo} type="file" accept={ACEPTA} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => alElegir(e, async (f) => { if (aCambiar) await papel.cambiar(aCambiar, f); setACambiar(null); })} />

      {cargando && hojas.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Buscando el papel en el Archivo…</p>
      ) : hojas.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no subiste el papel de esta cubicación.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-soft)]">
          {hojas.map((d) => {
            const imagen = d.mimeType.startsWith("image/");
            const url = urlDelPapel(d);
            const enCurso = ocupado === `cambiar:${d.id}` || ocupado === `quitar:${d.id}`;
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2" data-papel={d.id}>
                <a href={url} target="_blank" rel="noopener" className="shrink-0 overflow-hidden rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)]" aria-label={`Ver ${d.name}`}>
                  {imagen ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- la foto sale del Archivo con la cookie del panel */
                    <img src={url} alt="" className="h-14 w-14 object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center"><FileText className="h-6 w-6 text-[var(--text-tertiary)]" /></span>
                  )}
                </a>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{d.name}</span>
                  <span className="block text-xs text-[var(--text-tertiary)]">{fechaConDia(limaDateKey(d.uploadedAt))}{d.updatedAt.slice(0, 16) !== d.uploadedAt.slice(0, 16) ? " · cambiada" : ""}</span>
                </span>
                {enCurso ? <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" /> : (
                  <span className="flex shrink-0 items-center">
                    <a href={url} target="_blank" rel="noopener" className={ICONO} title="Ver el papel" aria-label="Ver el papel"><Eye className="h-4 w-4" /></a>
                    <button type="button" className={ICONO} disabled={!libre} title="Cambiar por otra foto o PDF" aria-label="Cambiar el papel"
                      onClick={() => { setACambiar(d); reemplazo.current?.click(); }}><RefreshCw className="h-4 w-4" /></button>
                    <button type="button" className={ICONO} disabled={!libre} title="Quitar (va a la papelera del Archivo)" aria-label="Quitar el papel"
                      onClick={() => quitar(d)}><Trash2 className="h-4 w-4" /></button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={PRINCIPAL} disabled={!libre} onClick={() => camara.current?.click()} data-accion="papel-tomar-foto">
          {ocupado === "subir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {hojas.length ? "Foto de otra hoja" : "Tomar foto"}
        </button>
        <button type="button" className={BOTON} disabled={!libre} onClick={() => archivo.current?.click()} data-accion="papel-subir">
          <Upload className="h-4 w-4" /> Subir foto o PDF
        </button>
        {hojas.length > 0 && codigo && (
          <a href={urlEnElArchivo(cubicacionId, codigo)} className="ml-auto inline-flex h-12 items-center gap-1 text-sm font-bold text-[var(--accent-dark)] hover:underline dark:text-[var(--accent)]">
            Ver en el Archivo <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </div>
  );
}
