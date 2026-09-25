"use client";

/**
 * FichaFoto — la foto de la persona en la cabecera de su ficha (ADR-416).
 *
 * La sube a /api/upload (carpeta `rrhh`) y la guarda con la acción `editar`:
 * la misma vía que cualquier otro dato de la ficha. Sin foto se ven las
 * iniciales, igual que antes.
 *
 * Desde el celular (ADR-417): «Subir desde el celular» muestra un QR que abre
 * ESTA misma ficha en el teléfono con `?foto=1`. Al montarse con ese
 * parámetro, la ficha pide la cámara sola — ver el efecto de abajo.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Camera, QrCode, Trash2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { compressIfLarge } from "@/lib/image-upload-utils";
import { cn } from "@/lib/utils";
import { BOTON } from "../rrhh-form";
import { iniciales } from "../rrhh-ui";
import SubirFotoQrModal, { PARAM_FOTO } from "./SubirFotoQrModal";

interface Props {
  /** A dónde apunta el QR: la ficha de esta persona, no la que esté en la URL. */
  colaboradorId: string;
  nombre: string;
  fotoUrl: string | null;
  /** Gestión y completo: los mismos que editan la ficha. */
  puedeCambiar: boolean;
  accion: (a: { action: "editar"; fotoUrl: string | null }) => Promise<{ ok: boolean; error?: { message?: string } }>;
  onCambio: () => void;
}

export default function FichaFoto({ colaboradorId, nombre, fotoUrl, puedeCambiar, accion, onCambio }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [qrAbierto, setQrAbierto] = useState(false);
  /** Se entró por el QR: el botón de arriba pide la cámara, no el explorador. */
  const [modoCamara, setModoCamara] = useState(false);

  /**
   * El QR trae `?foto=1`: al abrir la ficha en el teléfono, la cámara sale sola.
   *
   * El parámetro se borra ANTES de abrirla (por eso la segunda corrida del
   * modo estricto ya no lo encuentra y la cámara no sale dos veces). Si quedara
   * pegado en la URL, cada vuelta a esta ficha —o cada recarga— dispararía la
   * cámara sin que nadie la pida. Se limpia con `history.replaceState` y no
   * navegando: el panel no tiene por qué remontarse por esto.
   *
   * `modoCamara` no es decorativo: si el navegador ignora un click que no nació
   * de un toque, queda el botón «Tomar foto» destacado, que sí es un toque.
   */
  useEffect(() => {
    if (!puedeCambiar || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(PARAM_FOTO) !== "1") return;
    params.delete(PARAM_FOTO);
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    setModoCamara(true);
    camaraRef.current?.click();
  }, [puedeCambiar]);

  const guardar = async (url: string | null, aviso: string) => {
    const res = await accion({ action: "editar", fotoUrl: url });
    if (!res.ok) {
      toast.error(res.error?.message ?? "No se pudo guardar la foto.");
      return;
    }
    toast.success(aviso);
    // Ya está: el botón vuelve a decir «Cambiar foto» y no invita a subirla dos veces.
    setModoCamara(false);
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
      if (camaraRef.current) camaraRef.current.value = "";
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

  const elegido = (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (archivo) void subir(archivo);
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
        <div className="flex max-w-[12rem] flex-wrap items-center justify-center gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Elegir la foto de ${nombre}`}
            className="sr-only"
            tabIndex={-1}
            onChange={elegido}
          />
          {/*
            El input de la cámara va aparte del de archivos: `capture` manda al
            teléfono directo a la cámara trasera, y eso sólo se quiere cuando la
            persona está enfrente. En la computadora el navegador ignora
            `capture` y abre el explorador, así que no estorba.
          */}
          <input
            ref={camaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={`Tomar la foto de ${nombre} con la cámara`}
            className="sr-only"
            tabIndex={-1}
            onChange={elegido}
          />
          {modoCamara && (
            <button type="button" onClick={() => camaraRef.current?.click()} disabled={trabajando} className={BOTON.chicoPrimario}>
              <Camera className="h-4 w-4" /> {trabajando ? "Guardando…" : "Tomar foto"}
            </button>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={trabajando} className={BOTON.chicoFantasma}>
            <Camera className="h-4 w-4" /> {trabajando ? "Guardando…" : fotoUrl ? "Cambiar foto" : "Subir foto"}
          </button>
          {/* En el celular el QR sobra: el celular ES el destino del QR. */}
          <button
            type="button"
            onClick={() => setQrAbierto(true)}
            disabled={trabajando}
            className={cn(BOTON.chicoFantasma, "hidden sm:inline-flex")}
          >
            <QrCode className="h-4 w-4" /> Subir desde el celular
          </button>
          {fotoUrl && (
            <button type="button" onClick={quitar} disabled={trabajando} className={cn(BOTON.chicoFantasma, "px-2")} aria-label="Quitar la foto">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {qrAbierto && <SubirFotoQrModal open={qrAbierto} onClose={() => setQrAbierto(false)} colaboradorId={colaboradorId} nombre={nombre} />}
    </div>
  );
}
