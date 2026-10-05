"use client";

/**
 * «Más» de una cámara: subir a mano (cámara del celular), subir desde la
 * galería y quitar. Salió de `CamaraFila` el 05-10 sin cambiar el DOM: la fila
 * pasaba de 300 líneas con «En vivo» y «Último aviso».
 */

import { useRef } from "react";
import { MoreHorizontal, Trash2, Upload } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";

interface Props {
  nombre: string;
  guardando: boolean;
  subiendo: boolean;
  onSubir: (archivo: File) => void;
  onQuitar: () => void;
}

export default function MenuMasCamara({ nombre, guardando, subiendo, onSubir, onQuitar }: Props) {
  const { confirm } = useConfirm();
  const archivoRef = useRef<HTMLInputElement>(null);
  /* Sin `capture`: abre la galería, para subir una captura de pantalla de la
     app de la cámara (Hik-Connect) — con `capture` el celular solo ofrecía
     sacar una foto nueva (Brandon 2026-10-03, puente con el celular). */
  const galeriaRef = useRef<HTMLInputElement>(null);

  const menu = [
    {
      id: "subir",
      label: "Subir una foto a mano",
      hint: "Por la misma puerta que usa la cámara",
      icon: Upload,
      busy: subiendo,
      onSelect: () => archivoRef.current?.click(),
    },
    {
      id: "galeria",
      label: "Subir desde la galería",
      hint: "Una captura de pantalla de la app de la cámara (Hik-Connect): la IA la lee igual",
      icon: Upload,
      busy: subiendo,
      onSelect: () => galeriaRef.current?.click(),
    },
    {
      id: "quitar",
      label: "Quitar la cámara",
      hint: "Las fotos que mandó se quedan",
      icon: Trash2,
      tone: "danger" as const,
      disabled: guardando,
      onSelect: async () => {
        const ok = await confirm({
          title: `¿Quitar ${nombre}?`,
          description: "Deja de recibir fotos. Las que ya mandó siguen en el historial.",
          intent: "danger",
          confirmLabel: "Quitar",
        });
        if (ok) onQuitar();
      },
    },
  ];

  return (
    <>
      <ActionMenu
        label={`Más de ${nombre}`}
        icon={MoreHorizontal}
        soloIcono
        size="sm"
        actions={menu}
      />
      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Subir una foto a mano a ${nombre}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onSubir(f);
        }}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Subir una imagen de la galería a ${nombre}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onSubir(f);
        }}
      />
    </>
  );
}
