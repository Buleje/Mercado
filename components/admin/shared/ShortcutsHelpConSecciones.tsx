"use client";

/**
 * ShortcutsHelpConSecciones — la hoja de atajos del admin, con lo del módulo.
 *
 * `KeyboardShortcutsHelp` dibuja secciones; los atajos globales son fijos y los
 * del módulo abierto llegan por contexto (`admin-shortcuts-context`). Este
 * envoltorio los une para que `?` abra UNA sola hoja que dice todo: los del
 * shell y los de donde estás parado.
 *
 * Los del módulo van PRIMERO: si el operador está en el Libro CTP y pide ayuda,
 * lo que busca son los atajos del libro, no cómo cerrar caja.
 */

import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { useAdminShortcuts } from "@/contexts/admin-shortcuts-context";

/** Los globales del shell (los que antes vivían como default de la hoja). */
const GLOBALES = [
  {
    title: "Navegación del panel",
    items: [
      { keys: ["Ctrl", "K"], description: "Buscar en todo el panel" },
      { keys: ["?"], description: "Abrir / cerrar esta ayuda" },
      { keys: ["F"], description: "Modo enfoque (ocultar sidebar)" },
      { keys: ["Esc"], description: "Cerrar modal / deseleccionar" },
    ],
  },
];

export default function ShortcutsHelpConSecciones({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { sections, isOpen, close } = useAdminShortcuts();
  // Se abre por la tecla `?` (prop) o por un botón del módulo (contexto).
  const abierto = open || isOpen;

  return (
    <KeyboardShortcutsHelp
      open={abierto}
      onClose={() => {
        close();
        onClose();
      }}
      sections={[...sections, ...GLOBALES]}
    />
  );
}
