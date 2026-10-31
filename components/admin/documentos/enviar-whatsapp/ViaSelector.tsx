"use client";

import { OpcionVia } from "./ResultadoEnvio";
import { Paperclip, Share2, Link2 } from "@buleje/design-system/icons";
import type { EstadoEnviar } from "./use-enviar-whatsapp";
export default function ViaSelector({ arch }: { arch: EstadoEnviar }) {
  const { isSign, via, setVia, comparteEquipo } = arch;
  return (
    <>
      {/* Cómo se manda */}
      {!isSign && (
        <div>
          <p className="mb-1.5 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Cómo se manda
          </p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            <OpcionVia
              activa={via === "archivo"}
              onClick={() => setVia("archivo")}
              Icon={Paperclip}
              titulo="El archivo"
              detalle="Llega como adjunto"
            />
            <OpcionVia
              activa={via === "dispositivo"}
              onClick={() => setVia("dispositivo")}
              Icon={Share2}
              titulo="Desde este equipo"
              detalle={comparteEquipo ? "Menú de compartir" : "No disponible acá"}
              deshabilitada={!comparteEquipo}
            />
            <OpcionVia
              activa={via === "enlace"}
              onClick={() => setVia("enlace")}
              Icon={Link2}
              titulo="Un enlace"
              detalle="Si no se puede adjuntar"
            />
          </div>
          {via === "archivo" && (
            <p className="mt-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
              Sale del WhatsApp del negocio y queda en el inbox del panel. Necesita el número
              conectado.
            </p>
          )}
          {via === "dispositivo" && (
            <p className="mt-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
              Abre el menú de compartir de este equipo con los archivos adjuntos: eliges el chat y
              listo.
            </p>
          )}
        </div>
      )}
    </>
  );
}
