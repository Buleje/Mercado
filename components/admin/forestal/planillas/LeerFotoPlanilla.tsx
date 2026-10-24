"use client";

/**
 * «Desde foto de la planilla» para los importadores que ya leen una hoja
 * pegada (parte de producción, censo). Manda la foto a `/planillas/leer` con
 * su planilla —la IA usa el prompt de esa hoja: el de fábrica o el del
 * negocio— y entrega el texto armado (`lecturaATexto`) para que el importador
 * lo muestre en su vista previa de siempre.
 *
 * Al lado queda la foto chica para cotejar y la lista de celdas dudosas: el
 * cuadro de texto no las puede resaltar.
 */
import { useState } from "react";
import { AlertTriangle, Camera, Loader2, Sparkles } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { comprimirImagen } from "@/lib/documents/compress-image";
import { planillaPorId } from "@/lib/forestal/planillas/catalogo";
import type { LecturaPlanilla, PlanillaId } from "@/lib/forestal/planillas/tipos";
import { dudasDeLaLectura, lecturaATexto } from "./lectura-a-texto";
import { leerFotoDePlanilla } from "./planillas-api";

const BOTON = button({ variant: "secondary", className: "cursor-pointer rounded-xl" });

function aDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
    fr.readAsDataURL(file);
  });
}

export default function LeerFotoPlanilla({
  planillaId,
  onLeido,
  disabled = false,
}: {
  planillaId: PlanillaId;
  onLeido: (r: { texto: string; lectura: LecturaPlanilla }) => void;
  disabled?: boolean;
}) {
  const planilla = planillaPorId(planillaId);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaPlanilla | null>(null);

  const leer = async (file: File | undefined) => {
    if (!file || !planilla) return;
    setCargando(true);
    setError(null);
    setLectura(null);
    try {
      const imagen = await aDataUrl(await comprimirImagen(file));
      setFoto(imagen);
      const l = await leerFotoDePlanilla(planillaId, imagen);
      setLectura(l);
      onLeido({ texto: lecturaATexto(planilla, l), lectura: l });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  };

  if (!planilla) return null;
  const dudas = lectura ? dudasDeLaLectura(planilla, lectura) : [];

  return (
    <>
      <label className={`${BOTON} ${cargando || disabled ? "pointer-events-none opacity-60" : ""}`}>
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        Desde foto de la planilla
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={cargando || disabled}
          onChange={(e) => {
            void leer(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <InfoTip
        icono="ayuda"
        title={`Foto de la «${planilla.nombre}»`}
        what="La IA lee la hoja impresa desde Herramientas › Planillas de campo, llenada a mano, y deja las filas en el cuadro de abajo."
        example="Tú las revisas contra la foto antes de importar: las celdas donde la IA dudó salen listadas."
      />

      {(cargando || error || (foto && lectura)) && (
        <div className="basis-full">
          {cargando && (
            <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Leyendo la foto con IA…
            </p>
          )}
          {error && !cargando && (
            <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {foto && lectura && !cargando && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no vale la pena Next/Image */}
              <img src={foto} alt="Foto de la planilla leída" className="h-24 w-24 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover" />
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  {lectura.filas.length} {lectura.filas.length === 1 ? "fila leída" : "filas leídas"}: cotéjalas con la foto
                </p>
                {lectura.advertencia && <p className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{lectura.advertencia}</p>}
                {dudas.length > 0 && (
                  <ul className="max-h-20 space-y-0.5 overflow-y-auto text-[var(--text-secondary)]">
                    {dudas.map((d) => (
                      <li key={d}>La IA dudó en {d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
