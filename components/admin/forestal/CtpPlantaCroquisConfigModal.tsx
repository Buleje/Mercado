"use client";

/**
 * Configurar el croquis del aserradero: medidas del terreno en metros, la
 * imagen del plano y la lista de máquinas. Lo guarda el dueño o el
 * administrador (PUT `/planta/croquis`); las máquinas nuevas entran «fuera» y
 * se arrastran a su lugar en el plano. La imagen se sube primero al bucket
 * privado (POST `/planta/croquis/imagen` → `imagenRef`) y se ata al guardar.
 * Con un PDF del plano, el servidor además recorta el fondo al terreno por los
 * ejes en metros y propone los componentes de la leyenda: se revisan acá y se
 * crean como zonas al guardar (POST `/planta/croquis/zonas`, en lote).
 */

import { useState } from "react";
import { Check, Loader2, Plus, Settings2, Trash2, X, ImagePlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import type { MaquinaPlanta, PlantaCroquis } from "@/lib/forestal/planta-zona-types";
import { aplicarMaquinasPdf, type PropuestaCroquisPdf } from "@/lib/forestal/croquis-desde-pdf";
import { Btn, CampoGrid, Field, I, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { useCroquisPdf, type ExistentesPdf } from "./hooks/use-croquis-pdf";
import CtpPlantaCroquisPdfRevision from "./CtpPlantaCroquisPdfRevision";

export default function CtpPlantaCroquisConfigModal({ croquis, onClose, onGuardar, onZonasCreadas }: {
  croquis: PlantaCroquis | null;
  onClose: () => void;
  onGuardar: (c: PlantaCroquis, imagen?: { imagenRef: string | null }) => Promise<boolean>;
  /** Tras crear las zonas del PDF: recargar el plano. */
  onZonasCreadas?: () => void;
}) {
  const [ancho, setAncho] = useState(String(croquis?.anchoM ?? ""));
  const [alto, setAlto] = useState(String(croquis?.altoM ?? ""));
  /** Imagen nueva: `imagenRef` del POST (string), sacarla (null) o no tocarla (undefined). */
  const [imagenRef, setImagenRef] = useState<string | null | undefined>(undefined);
  const [proporcion, setProporcion] = useState<number | null>(null);
  const [maquinas, setMaquinas] = useState<MaquinaPlanta[]>(croquis?.maquinas ?? []);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leyendoPdf, setLeyendoPdf] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const pdf = useCroquisPdf();

  const an = Number(ancho.replace(",", ".")), al = Number(alto.replace(",", "."));
  const medidasOk = Number.isFinite(an) && Number.isFinite(al) && an >= 5 && al >= 5 && an <= 2000 && al <= 2000;
  const codigosOk = maquinas.every((m) => m.codigo.trim()) && new Set(maquinas.map((m) => m.codigo.trim().toUpperCase())).size === maquinas.length;

  async function subir(file: File) {
    const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setSubiendo(true); setLeyendoPdf(esPdf); setError(null); setAviso(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (esPdf && medidasOk) { fd.append("anchoM", String(an)); fd.append("altoM", String(al)); }
      const r = await fetch("/api/admin/forestal/ctp/planta/croquis/imagen", { method: "POST", headers: csrfHeaders(), body: fd, credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { imagenRef?: string; ancho?: number; alto?: number; pdf?: PropuestaCroquisPdf; existentes?: ExistentesPdf; message?: string; error?: string };
      if (!r.ok || !j.imagenRef) throw new Error(j.message ?? j.error ?? (r.status === 403 ? "solo el dueño o el administrador cambia el plano" : `HTTP ${r.status}`));
      setImagenRef(j.imagenRef);
      setProporcion(j.ancho && j.alto ? j.ancho / j.alto : null);
      const p = j.pdf;
      if (!p) { pdf.limpiar(); return; }
      if (p.anchoM && p.altoM) { setAncho(String(p.anchoM)); setAlto(String(p.altoM)); }
      pdf.cargar(p, j.existentes ?? { codigos: [], croquis: [] });
      const terreno = p.anchoM && p.altoM ? { anchoM: p.anchoM, altoM: p.altoM } : medidasOk ? { anchoM: an, altoM: al } : null;
      if (terreno && p.maquinas.length) setMaquinas((ms) => aplicarMaquinasPdf(ms, p.maquinas, terreno));
    } catch (e) { setError(`No se pudo subir ${esPdf ? "el PDF" : "la imagen"}: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSubiendo(false); setLeyendoPdf(false); }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!medidasOk) { setError("Ancho y alto van en metros, entre 5 y 2000."); return; }
    if (!codigosOk) { setError("Cada máquina necesita un código distinto (D1, D2…)."); return; }
    setGuardando(true); setError(null); setAviso(null);
    // Las máquinas del PDF se ubican con las medidas FINALES (pudieron corregirse después de importar).
    const maqs = pdf.propuesta?.maquinas.length ? aplicarMaquinasPdf(maquinas, pdf.propuesta.maquinas, { anchoM: an, altoM: al }) : maquinas;
    const ok = await onGuardar({
      version: croquis?.version ?? 1, anchoM: an, altoM: al, imagenUrl: croquis?.imagenUrl ?? null,
      maquinas: maqs.map((m) => ({ ...m, codigo: m.codigo.trim().toUpperCase(), nombre: m.nombre.trim() || m.codigo.trim().toUpperCase() })),
      actualizadoEn: new Date().toISOString(),
    }, imagenRef !== undefined ? { imagenRef } : undefined);
    if (!ok) { setGuardando(false); return; }
    // La imagen ya quedó atada: reintentar las zonas no la vuelve a mandar.
    setImagenRef(undefined);
    if (pdf.elegidos.length) {
      const r = await pdf.crearZonas({ anchoM: an, altoM: al });
      setGuardando(false);
      if (!r.ok) { setError(`El croquis quedó guardado, pero no se crearon las zonas: ${r.error}`); return; }
      onZonasCreadas?.();
      pdf.limpiar();
      if (r.omitidas.length) {
        setAviso(`Creé ${r.creadas} zonas. No toqué ${r.omitidas.length}: ${r.omitidas.slice(0, 5).map((o) => `${o.codigo} (${o.motivo})`).join(", ")}${r.omitidas.length > 5 ? "…" : ""}.`);
        return;
      }
    }
    setGuardando(false);
    onClose();
  }

  const cambiar = (i: number, campo: "codigo" | "nombre", v: string) => setMaquinas((ms) => ms.map((m, j) => (j === i ? { ...m, [campo]: v } : m)));

  return (
    <AdminModal
      open onClose={onClose} variant={pdf.propuesta ? "wide" : "default"} icon={Settings2}
      title={croquis ? "Croquis del aserradero" : "Configura el croquis de tu aserradero"}
      description="Medidas en metros, plano de fondo y maquinaria"
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose}><X className="h-4 w-4" />Cancelar</Btn>
          <Btn variant="primary" type="submit" form="planta-croquis-config" disabled={guardando || subiendo}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{pdf.elegidos.length ? `Guardar croquis y ${pdf.elegidos.length} zonas` : "Guardar croquis"}
          </Btn>
        </ModalFooter>
      }
    >
      <form id="planta-croquis-config" onSubmit={guardar} className={`space-y-4 ${MODAL_BODY}`}>
        <CampoGrid>
          <Field label="Ancho del terreno (m)" required span={6}>
            <input inputMode="decimal" value={ancho} onChange={(e) => setAncho(e.target.value)} placeholder="54" className={I} />
          </Field>
          <Field label="Largo del terreno (m)" required span={6}>
            <input inputMode="decimal" value={alto} onChange={(e) => setAlto(e.target.value)} placeholder="48" className={I} />
          </Field>
          <Field label="Plano de fondo (imagen o PDF)" span={12}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
                {leyendoPdf ? "Leyendo el PDF y sus componentes…" : imagenRef && pdf.propuesta ? (pdf.propuesta.escala === "ejes" ? "PDF leído: fondo recortado al terreno" : "PDF leído: la hoja entera es el fondo") : imagenRef ? "Imagen nueva lista para guardar" : imagenRef === null || !croquis?.imagenUrl ? "Sin imagen: se dibuja una cuadrícula de 5 m" : "Usa la imagen actual"}
              </span>
              <label className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{croquis?.imagenUrl || imagenRef ? "Cambiar" : "Subir imagen o PDF"}
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" aria-label="Plano de fondo: imagen o PDF" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
              </label>
              {(croquis?.imagenUrl || imagenRef) && (
                <button type="button" onClick={() => { setImagenRef(null); setProporcion(null); pdf.limpiar(); }} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><Trash2 className="h-4 w-4" />Quitar</button>
              )}
            </div>
          </Field>
        </CampoGrid>
        {proporcion != null && medidasOk && Math.abs(proporcion / (an / al) - 1) > 0.1 && (
          <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            La imagen no tiene la forma del terreno ({formatNumber(proporcion, { max: 2 })} contra {formatNumber(an / al, { max: 2 })}): se va a estirar.
          </p>
        )}
        <p className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          La imagen se estira sobre el terreno: recórtala al borde del cerco.
          <InfoTip title="Imagen del plano" what="La esquina inferior izquierda de la imagen es el punto (0, 0) del terreno; la superior derecha, (ancho, largo)." affects="Un PDF con los ejes en metros se recorta solo al terreno y propone cada componente de su leyenda en su lugar." example="Plano de 54 × 48 m: recorta la lámina justo al cerco, sin la leyenda (o sube el PDF con sus ejes)." />
        </p>
        <CtpPlantaCroquisPdfRevision pdf={pdf} terreno={medidasOk ? { anchoM: an, altoM: al } : null} />
        {aviso && <p role="status" className="flex items-start gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{aviso}</p>}

        <section>
          <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">Maquinaria</p>
          <ul className="space-y-1.5">
            {maquinas.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <input value={m.codigo} onChange={(e) => cambiar(i, "codigo", e.target.value)} aria-label="Código de la máquina" placeholder="D1" className={`${I} w-20 shrink-0 font-mono uppercase`} />
                <input value={m.nombre} onChange={(e) => cambiar(i, "nombre", e.target.value)} aria-label="Nombre de la máquina" placeholder="Cargador frontal" className={`${I} min-w-0 flex-1`} />
                <button type="button" onClick={() => setMaquinas((ms) => ms.filter((_, j) => j !== i))} aria-label={`Quitar ${m.codigo || "máquina"}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setMaquinas((ms) => [...ms, { codigo: `D${ms.length + 1}`, nombre: "", x: 0, y: 0, fuera: true }])} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl border border-dashed border-[var(--rule-strong)] px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            <Plus className="h-4 w-4" />Agregar máquina
          </button>
        </section>
      </form>
    </AdminModal>
  );
}
