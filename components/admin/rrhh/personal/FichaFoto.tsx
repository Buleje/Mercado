"use client";

/**
 * FichaFoto — la foto de la persona en la cabecera de su ficha (ADR-416).
 *
 * La sube a /api/upload (carpeta `rrhh`) y la guarda con la acción `editar`:
 * la misma vía que cualquier otro dato de la ficha. Sin foto se ven las
 * iniciales, igual que antes.
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { compressIfLarge } from "@/lib/image-upload-utils";
import { cn } from "@/lib/utils";
import { BOTON } from "../rrhh-form";
import { iniciales } from "../rrhh-ui";

interface Props {
  nombre: string;
  fotoUrl: string | null;
  /** Gestión y completo: los mismos que editan la ficha. */
  puedeCambiar: boolean;
  accion: (a: { action: "editar"; fotoUrl: string | null }) => Promise<{ ok: boolean; error?: { message?: string } }>;
  onCambio: () => void;
}

export default function FichaFoto({ nombre, fotoUrl, puedeCambiar, accion, onCambio }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);

  const guardar = async (url: string | null, aviso: string) => {
    const res = await accion({ action: "editar", fotoUrl: url });
    if (!res.ok) {
      toast.error(res.error?.message ?? "No se pudo guardar la foto.");
      return;
    }
    toast.success(aviso);
    onCambio();
  };

  const subir = async (archivo: File) => {
    setTrabajando(true);
    try {
      const fd = new FormData();
      fd.append("file", await compressIfLarge(archivo));
      fd.append("folder", "rrhh");
      const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
      const data = await leerJson<{ url?: string; error?: string }>(res);
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "No se pudo subir la foto.");
        return;
      }
      await guardar(data.url, "Foto guardada");
    } catch {
      toast.error("No se pudo subir la foto. Revisa tu conexión.");
    } finally {
      setTrabajando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitar = async () => {
    setTrabajando(true);
    try {
      await guardar(null, "Foto quitada");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      {fotoUrl ? (
        <img src={fotoUrl} alt={`Foto de ${nombre}`} className="h-20 w-[3.75rem] rounded-xl border-2 border-[var(--accent)] object-cover" />
      ) : (
        <span aria-hidden className="grid h-20 w-[3.75rem] place-items-center rounded-xl bg-primary/10 font-display text-2xl text-[var(--accent-ink)] dark:text-[var(--accent)]">
          {iniciales(nombre)}
        </span>
      )}
      {puedeCambiar && (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Elegir la foto de ${nombre}`}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) void subir(archivo);
            }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={trabajando} className={BOTON.chicoFantasma}>
            <Camera className="h-4 w-4" /> {trabajando ? "Guardando…" : fotoUrl ? "Cambiar foto" : "Subir foto"}
          </button>
          {fotoUrl && (
            <button type="button" onClick={quitar} disabled={trabajando} className={cn(BOTON.chicoFantasma, "px-2")} aria-label="Quitar la foto">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
