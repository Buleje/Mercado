"use client";

/**
 * Grabadora de voz del cubicador (Brandon 23-10). CONTRATO: la monta el
 * cubicador en su bloque «Grabaciones»; el resto lo construye el carril de la
 * grabadora sin cambiar esta firma.
 *
 * Una grabadora de AUDIO (no dictado a texto): graba, pausa, detiene, se
 * escucha y se guarda con nombre en el Archivo del negocio, carpeta `carpeta`
 * con la etiqueta `grabacion`. La lista de abajo deja escuchar, renombrar,
 * editar/recortar, mandar por WhatsApp y llevar a la papelera.
 */
import { useState } from "react";
import type { DbDocument } from "@/lib/types/documents";
import { useGrabadora } from "@/hooks/use-grabadora";
import { useGrabaciones } from "@/hooks/use-grabaciones";
import { CARPETA_POR_DEFECTO } from "@/lib/grabadora/archivo";
import { PanelGrabar } from "./PanelGrabar";
import { ListaGrabaciones } from "./ListaGrabaciones";
import { EditarGrabacionModal } from "./EditarGrabacionModal";
import { EnviarWhatsappModal } from "./EnviarWhatsappModal";

export interface GrabadoraVozProps {
  /** Carpeta del Archivo donde quedan las grabaciones guardadas. */
  carpeta?: string;
  /** Texto corto que se le pega a cada grabación (p. ej. el lote abierto). */
  contexto?: string;
}

export function GrabadoraVoz({ carpeta = CARPETA_POR_DEFECTO, contexto }: GrabadoraVozProps) {
  const g = useGrabadora();
  const lista = useGrabaciones(carpeta);
  const [editando, setEditando] = useState<DbDocument | null>(null);
  const [enviando, setEnviando] = useState<DbDocument | null>(null);

  return (
    <div className="space-y-3" data-grabadora-voz>
      <PanelGrabar
        g={g}
        carpeta={carpeta}
        contexto={contexto}
        existentes={lista.items.map((d) => d.name)}
        onGuardar={async (nombre, nota) => {
          if (!g.audio) return;
          await lista.guardar({ blob: g.audio.blob, nombre, nota });
        }}
      />

      <ListaGrabaciones
        items={lista.items}
        cargando={lista.cargando}
        error={lista.error}
        onReintentar={lista.recargar}
        renombrar={lista.renombrar}
        borrar={lista.borrar}
        onEditar={setEditando}
        onEnviar={setEnviando}
      />

      {editando && (
        <EditarGrabacionModal
          doc={editando}
          onCerrar={() => setEditando(null)}
          onGuardar={(o) => lista.editar(editando.id, o)}
        />
      )}
      {enviando && <EnviarWhatsappModal doc={enviando} contexto={contexto} onCerrar={() => setEnviando(null)} />}
    </div>
  );
}
