"use client";

/**
 * La foto del movimiento que abre «Ver foto» del aviso al celular (vigía,
 * 23-10): el aviso abre `/admin?tab=camaras&movimiento=<id>` y acá se muestra
 * la foto con la sesión del panel — nunca la imagen suelta en el navegador.
 * Al cerrar, el `?movimiento=` sale de la dirección (recargar no la reabre).
 */

import { useEffect, useState } from "react";
import { Camera, ImageOff } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ID_ALARMA } from "@/lib/camaras/alarmas-hik";
import { PARAM_MOVIMIENTO, rutaFotoMovimiento } from "@/lib/camaras/vigia-movimientos";

function movimientoDeLaUrl(): string | null {
  const id = new URL(window.location.href).searchParams.get(PARAM_MOVIMIENTO);
  return id && ID_ALARMA.test(id) ? id : null;
}

function sacarDeLaUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM_MOVIMIENTO)) return;
  url.searchParams.delete(PARAM_MOVIMIENTO);
  window.history.replaceState(window.history.state, "", url.toString());
}

export default function FotoDelAviso() {
  const [id, setId] = useState<string | null>(null);
  const [rota, setRota] = useState(false);

  useEffect(() => {
    setId(movimientoDeLaUrl());
  }, []);

  if (!id) return null;
  const cerrar = () => {
    sacarDeLaUrl();
    setId(null);
  };

  return (
    <AdminModal open onClose={cerrar} title="Foto del movimiento" icon={Camera} size="lg">
      <div className={MODAL_BODY}>
        {rota ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <ImageOff className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
            La foto ya no está (pasaron más de 24 h) o la nube no respondió. Mira los últimos movimientos en el menú de Cámaras.
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- foto propia por la ruta con sesión; no pasa por next/image
          <img
            src={rutaFotoMovimiento(id)}
            alt="Foto que sacó la cámara en el movimiento"
            className="max-h-[70vh] w-full rounded-xl object-contain"
            onError={() => setRota(true)}
          />
        )}
      </div>
    </AdminModal>
  );
}
