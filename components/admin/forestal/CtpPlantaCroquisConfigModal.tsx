"use client";

/**
 * Configurar el croquis del aserradero: medidas del terreno en metros, la
 * imagen del plano y la lista de máquinas. Lo guarda el dueño o el
 * administrador (PUT `/planta/croquis`); las máquinas nuevas entran «fuera» y
 * se arrastran a su lugar en el plano. La imagen se sube primero al bucket
 * privado (POST `/planta/croquis/imagen` → `imagenRef`) y se ata al guardar.
 */

import { useState } from "react";
import { Check, Loader2, Plus, Settings2, Trash2, X, ImagePlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import type { MaquinaPlanta, PlantaCroquis } from "@/lib/forestal/planta-zona-types";
import { Btn, CampoGrid, Field, I, MODAL_BODY, ModalFooter } from "./ctp-shared";

export default function CtpPlantaCroquisConfigModal({ croquis, onClose, onGuardar }: {
  croquis: PlantaCroquis | null;
  onClose: () => void;
  onGuardar: (c: PlantaCroquis, imagen?: { imagenRef: string | null }) => Promise<boolean>;
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

  const an = Number(ancho.replace(",", ".")), al = Number(alto.replace(",", "."));
  const medidasOk = Number.isFinite(an) && Number.isFinite(al) && an >= 5 && al >= 5 && an <= 2000 && al <= 2000;
  const codigosOk = maquinas.every((m) => m.codigo.trim()) && new Set(maquinas.map((m) => m.codigo.trim().toUpperCase())).size === maquinas.length;

  async function subir(file: File) {
    setSubiendo(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/forestal/ctp/planta/croquis/imagen", { method: "POST", headers: csrfHeaders(), body: fd, credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { imagenRef?: string; ancho?: number; alto?: number; message?: string; error?: string };
      if (!r.ok || !j.imagenRef) throw new Error(j.message ?? j.error ?? (r.status === 403 ? "solo el dueño o el administrador cambia el plano" : `HTTP ${r.status}`));
      setImagenRef(j.imagenRef);
      setProporcion(j.ancho && j.alto ? j.ancho / j.alto : null);
    } catch (e) { setError(`No se pudo subir la imagen: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSubiendo(false); }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!medidasOk) { setError("Ancho y alto van en metros, entre 5 y 2000."); return; }
    if (!codigosOk) { setError("Cada máquina necesita un código distinto (D1, D2…)."); return; }
    setGuardando(true); setError(null);
    const ok = await onGuardar({
      version: croquis?.version ?? 1, anchoM: an, altoM: al, imagenUrl: croquis?.imagenUrl ?? null,
      maquinas: maquinas.map((m) => ({ ...m, codigo: m.codigo.trim().toUpperCase(), nombre: m.nombre.trim() || m.codigo.trim().toUpperCase() })),
      actualizadoEn: new Date().toISOString(),
    }, imagenRef !== undefined ? { imagenRef } : undefined);
    setGuardando(false);
    if (ok) onClose();
  }

  const cambiar = (i: number, campo: "codigo" | "nombre", v: string) => setMaquinas((ms) => ms.map((m, j) => (j === i ? { ...m, [campo]: v } : m)));

  return (
    <AdminModal
      open onClose={onClose} variant="default" icon={Settings2}
      title={croquis ? "Croquis del aserradero" : "Configura el croquis de tu aserradero"}
      description="Medidas en metros, plano de fondo y maquinaria"
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose}><X className="h-4 w-4" />Cancelar</Btn>
          <Btn variant="primary" type="submit" form="planta-croquis-config" disabled={guardando || subiendo}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar croquis
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
          <Field label="Imagen del plano" span={12}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
                {imagenRef ? "Imagen nueva lista para guardar" : imagenRef === null || !croquis?.imagenUrl ? "Sin imagen: se dibuja una cuadrícula de 5 m" : "Usa la imagen actual"}
              </span>
              <label className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{croquis?.imagenUrl || imagenRef ? "Cambiar" : "Subir"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
              </label>
              {(croquis?.imagenUrl || imagenRef) && (
                <button type="button" onClick={() => { setImagenRef(null); setProporcion(null); }} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><Trash2 className="h-4 w-4" />Quitar</button>
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
          <InfoTip title="Imagen del plano" what="La esquina inferior izquierda de la imagen es el punto (0, 0) del terreno; la superior derecha, (ancho, largo)." example="Plano de 54 × 48 m: recorta la lámina justo al cerco, sin la leyenda." />
        </p>

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
