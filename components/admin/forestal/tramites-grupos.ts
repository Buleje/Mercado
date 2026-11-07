import { FileText, Inbox, TreePine } from "@buleje/design-system/icons";
import type { LibroGroup } from "@/components/admin/shared/libro-chrome";

export const MODULE_ID = "forestal-tramites";
export type Vista = "catalogo" | "expediente" | "plantaciones";

export const GRUPOS: LibroGroup[] = [
  {
    id: "tramites",
    label: "Trámites",
    views: [
      { key: "catalogo", label: "Formatos", icon: FileText, hint: "Elige el trámite y llénalo" },
      { key: "expediente", label: "Expediente", icon: Inbox, hint: "Qué se presentó y en qué estado está" },
      { key: "plantaciones", label: "Plantaciones", icon: TreePine, hint: "Registro RNPF — inscripción y actualización" },
    ],
  },
];
