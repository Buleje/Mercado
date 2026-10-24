"use client";

/**
 * SubirFotoQrModal — el QR que lleva la foto de la persona al celular (ADR-417).
 *
 * Por qué existe (medido 2026-09-15: 0 de 11 personas tienen foto, así que
 * todos los fotochecks salen con las iniciales): subirla desde la computadora
 * obliga a que la foto YA esté ahí, cuando la persona está parada al lado y la
 * cámara es la del bolsillo. Este código abre LA MISMA ficha en el celular y
 * deja la cámara lista.
 *
 * Sin página pública ni token nuevo A PROPÓSITO: una URL sin sesión que acepte
 * archivos en el bucket del negocio es superficie de abuso (subidas anónimas,
 * el enlace reenviado que sigue vivo, los datos de la persona a la vista de
 * cualquiera). El QR lleva a `/admin`, que pide iniciar sesión igual que el QR
 * del fotocheck (`urlDeLaFicha`): la puerta sigue siendo la de siempre.
 */

import { useEffect, useState } from "react";
import { Check, Copy, Smartphone } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { sinDato } from "@/lib/errores/sin-dato";
import { cn } from "@/lib/utils";
import { BOTON } from "../rrhh-form";
import { urlDeLaFicha } from "./fotocheck";

/** El parámetro que deja la cámara lista al abrir la ficha. Lo lee `FichaFoto`. */
export const PARAM_FOTO = "foto";

/** La misma ficha a la que lleva el QR del fotocheck, pero pidiendo la cámara. */
export function urlParaTomarFoto(origen: string, colaboradorId: string): string {
  return `${urlDeLaFicha(origen, colaboradorId)}&${PARAM_FOTO}=1`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  colaboradorId: string;
  nombre: string;
}

export default function SubirFotoQrModal({ open, onClose, colaboradorId, nombre }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    const url = urlParaTomarFoto(window.location.origin, colaboradorId);
    setDestino(url);
    (async () => {
      const QR = (await import("qrcode")).default;
      // `margin: 2` en vez del 0 del PDF: en el papel la zona muda la pone la
      // tarjeta blanca; en pantalla el fondo cambia con el tema, así que el
      // borde blanco va DENTRO del PNG o en modo oscuro el lector no engancha.
      // 512 px de fuente para que se vea nítido en la pantalla del que escanea.
      const data = await QR.toDataURL(url, { margin: 2, width: 512, errorCorrectionLevel: "M" });
      if (vivo) setQr(data);
    })().catch(sinDato("QR para subir la foto"));
    return () => {
      vivo = false;
    };
  }, [open, colaboradorId]);

  // El «Copiado» vuelve solo a su lugar; con cleanup para que no le escriba a un modal ya cerrado.
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  const copiar = () => {
    navigator.clipboard
      ?.writeText(destino)
      .then(() => setCopiado(true))
      .catch(sinDato("copiar el enlace para subir la foto"));
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Subir la foto desde el celular"
      description="La cámara del teléfono, sin pasar por la computadora."
      icon={Smartphone}
      aboveModals
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={BOTON.secundario}>
            Listo
          </button>
        </div>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        <div className="flex justify-center">
          <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL armado en el navegador
              <img src={qr} alt={`Código QR para subir la foto de ${nombre}`} className="h-56 w-56" />
            ) : (
              <div className="grid h-56 w-56 place-items-center text-sm text-[var(--text-tertiary)]">Armando el código…</div>
            )}
          </div>
        </div>

        <ol className="mx-auto max-w-[24rem] list-decimal space-y-1.5 pl-5 text-sm text-[var(--text-secondary)] marker:font-bold marker:text-[var(--accent-ink)] dark:marker:text-[var(--accent)]">
          <li>Escanea el código con la cámara de tu celular.</li>
          <li>Inicia sesión en el panel, como siempre.</li>
          <li>
            Toca <span className="font-bold text-[var(--text-primary)]">«Tomar foto»</span>, que te queda esperando arriba: sacas la foto de{" "}
            <span className="font-bold text-[var(--text-primary)]">{nombre}</span> y se guarda sola.
          </li>
        </ol>

        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={copiar} className={BOTON.chico}>
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? "Enlace copiado" : "Copiar el enlace"}
          </button>
          <p className="text-center text-xs text-[var(--text-tertiary)]">
            Abre esta misma ficha en el panel: sin iniciar sesión nadie sube nada.
          </p>
        </div>
      </div>
    </AdminModal>
  );
}
