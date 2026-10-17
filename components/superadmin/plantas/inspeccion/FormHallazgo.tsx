"use client";

/**
 * Anotar (o corregir) un hallazgo en la planta: qué tan grave es, de qué tipo,
 * qué se vio, cuánto volumen hay en juego, fotos con la cámara del celular y a
 * qué guía, troza o lote se refiere.
 */
import { useId, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { cn } from "@/lib/utils";
import type { HallazgoInspeccion } from "@/lib/superadmin/plantas-forestales/tipos";
import { BOTON_BORDE, TARJETA } from "@/components/admin/forestal/ctp-conteo-pasos";
import { GRAVEDAD } from "../formato";
import { CAMPO, CampoNumero } from "./CampoNumero";
import { CATEGORIAS, idNuevo, REFERENCIAS } from "./inspeccion-datos";
import { subirFotoDeHallazgo } from "./subir-foto";

type Referencia = NonNullable<HallazgoInspeccion["referencia"]>;
const MAX_FOTOS = 12;
const ORDEN_GRAVEDAD: HallazgoInspeccion["gravedad"][] = ["error", "warning", "info"];
const TONO_GRAVEDAD: Record<HallazgoInspeccion["gravedad"], string> = {
  error: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
  warning: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  info: "border-[var(--data-info-500)] bg-[var(--data-info-500)]/10 text-[var(--data-info-ink)] dark:text-[var(--data-info-500)]",
};

export function FotoMiniatura({ url, onQuitar }: { url: string; onQuitar?: () => void }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
      <a href={url} target="_blank" rel="noreferrer" aria-label="Ver la foto completa">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto subida por el inspector (Supabase o /uploads en dev) */}
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </a>
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar la foto"
          className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-bl-xl bg-[var(--surface-raised)] text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function FormHallazgo({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: HallazgoInspeccion | null;
  onGuardar: (h: HallazgoInspeccion) => void;
  onCancelar: () => void;
}) {
  const id = useId();
  const [gravedad, setGravedad] = useState<HallazgoInspeccion["gravedad"]>(inicial?.gravedad ?? "warning");
  const [categoria, setCategoria] = useState<HallazgoInspeccion["categoria"]>(inicial?.categoria ?? "volumen");
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [m3, setM3] = useState<number | null>(inicial?.m3 ?? null);
  const [fotos, setFotos] = useState<string[]>(inicial?.fotos ?? []);
  const [refTipo, setRefTipo] = useState<Referencia["tipo"] | "">(inicial?.referencia?.tipo ?? "");
  const [refValor, setRefValor] = useState(inicial?.referencia?.valor ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  const textoListo = texto.trim().length >= 3;
  const subir = async (lista: FileList | null) => {
    const file = lista?.[0];
    if (!file) return;
    setSubiendo(true);
    setErrorFoto(null);
    const r = await subirFotoDeHallazgo(file);
    setSubiendo(false);
    if ("url" in r) setFotos((f) => [...f, r.url].slice(0, MAX_FOTOS));
    else setErrorFoto(r.error);
  };
  const guardar = () =>
    onGuardar({
      id: inicial?.id ?? idNuevo(),
      gravedad,
      categoria,
      texto: texto.trim().slice(0, 2000),
      m3,
      fotos,
      referencia: refTipo && refValor.trim() ? { tipo: refTipo, valor: refValor.trim().slice(0, 80) } : null,
    });

  return (
    <div className={cn(TARJETA, "space-y-4 border-2 border-[var(--accent)]")} data-form-hallazgo>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-[var(--text-secondary)]">Gravedad</legend>
        <div className="grid grid-cols-3 gap-2">
          {ORDEN_GRAVEDAD.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={gravedad === g}
              onClick={() => setGravedad(g)}
              className={cn(
                "min-h-12 rounded-xl border-2 px-2 text-base font-bold transition-colors",
                gravedad === g ? TONO_GRAVEDAD[g] : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
              )}
            >
              {GRAVEDAD[g].rotulo}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-[var(--text-secondary)]">
          Tipo
          <select className={CAMPO} value={categoria} onChange={(e) => setCategoria(e.target.value as HallazgoInspeccion["categoria"])}>
            {CATEGORIAS.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <CampoNumero etiqueta="m³ en juego (si aplica)" valor={m3} onValor={setM3} placeholder="—" />
      </div>

      <label className="block space-y-1 text-sm font-medium text-[var(--text-secondary)]">
        Qué viste
        <textarea
          className={cn(CAMPO, "h-auto min-h-28 py-2")}
          value={texto}
          maxLength={2000}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: 12 trozas de tornillo sin guía en la cancha 3."
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium text-[var(--text-secondary)]">Fotos</p>
        {fotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fotos.map((u) => (
              <FotoMiniatura key={u} url={u} onQuitar={() => setFotos((f) => f.filter((x) => x !== u))} />
            ))}
          </div>
        )}
        {fotos.length < MAX_FOTOS && (
          <div className="grid gap-2 sm:flex">
            <label htmlFor={`${id}-camara`} className={cn(BOTON_BORDE, "cursor-pointer", subiendo && "pointer-events-none opacity-60")}>
              {subiendo ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
              {subiendo ? "Subiendo…" : "Tomar foto"}
            </label>
            <input id={`${id}-camara`} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
            <label htmlFor={`${id}-galeria`} className={cn(BOTON_BORDE, "cursor-pointer", subiendo && "pointer-events-none opacity-60")}>
              <ImagePlus className="h-5 w-5" aria-hidden /> De la galería
            </label>
            <input id={`${id}-galeria`} type="file" accept="image/*" className="sr-only" onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
          </div>
        )}
        {errorFoto && <p role="alert" className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{errorFoto}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <label className="space-y-1 text-sm font-medium text-[var(--text-secondary)]">
          Se refiere a
          <select className={CAMPO} value={refTipo} onChange={(e) => setRefTipo(e.target.value as Referencia["tipo"] | "")}>
            <option value="">Nada en particular</option>
            {REFERENCIAS.map((r) => (
              <option key={r.clave} value={r.clave}>
                {r.rotulo}
              </option>
            ))}
          </select>
        </label>
        {refTipo && (
          <label className="space-y-1 text-sm font-medium text-[var(--text-secondary)]">
            Cuál
            <input className={CAMPO} value={refValor} maxLength={80} onChange={(e) => setRefValor(e.target.value)} placeholder="Ej.: 001-0004512" />
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={guardar} disabled={!textoListo || subiendo}>
          {inicial ? "Guardar cambios" : "Agregar hallazgo"}
        </Button>
        <Button variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        {!textoListo && texto.length > 0 && <p className="self-center text-sm text-[var(--text-tertiary)]">Escribe al menos 3 letras.</p>}
      </div>
    </div>
  );
}
