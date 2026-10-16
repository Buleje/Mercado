/**
 * Los campos que el alta de la libreta pide según el papel, además de nombre,
 * documento y dirección (`AltaDeParte`). El registro MTC viaja en la guía; el
 * N° de autorización es el casillero (18) de la partida o el (22) del
 * destinatario (formato 2024, RDE D000014-2024-MIDAGRI-SERFOR-DE); lo demás
 * queda en la ficha.
 */

import type { RolParte } from "@/lib/forestal/directorio";

/** Los campos de la ficha que el alta sabe pedir además de los de siempre. */
export type ClaveExtra = "codigoCtp" | "registroMtc" | "licencia" | "telefono" | "contactoNombre" | "acopioReferencia";

export interface Extra {
  clave: ClaveExtra;
  label: string;
  hint?: string;
  mono?: boolean;
  span: 4 | 6 | 12;
}

const TELEFONO: Extra = { clave: "telefono", label: "Teléfono", span: 6 };
const AUTORIZACION_DESTINO: Extra = {
  clave: "codigoCtp",
  label: "N° de autorización",
  hint: "Formato 2024, casillero (22): la autorización del CTP o depósito que recibe. Si es una persona sin establecimiento, déjalo vacío.",
  mono: true,
  span: 6,
};

/** Lo que pide cada papel. El registro MTC viaja en la guía; lo demás queda en la ficha. */
export const EXTRAS: Record<RolParte, readonly Extra[]> = {
  proveedor: [TELEFONO],
  destinatario: [AUTORIZACION_DESTINO, TELEFONO],
  cliente: [AUTORIZACION_DESTINO, TELEFONO],
  transportista: [{ clave: "registroMtc", label: "Registro MTC", hint: "Si es empresa de transporte", mono: true, span: 6 }, TELEFONO],
  conductor: [{ clave: "licencia", label: "N° de licencia", hint: "La que pide el puesto de control", mono: true, span: 6 }, TELEFONO],
  establecimiento: [
    {
      clave: "codigoCtp",
      label: "N° de autorización (ARFFS)",
      hint: "Formato 2024, casillero (18): el N° que la ARFFS le dio al depósito o centro de comercialización.",
      mono: true,
      span: 6,
    },
    { clave: "acopioReferencia", label: "Referencia", hint: "Interno: cómo llegar («frente al grifo»). No sale en la guía.", span: 6 },
    { clave: "contactoNombre", label: "Encargado", hint: "Interno: a quién llamar. No sale en la guía.", span: 6 },
    TELEFONO,
  ],
};

export const CLAVES_EXTRA: readonly ClaveExtra[] = ["codigoCtp", "registroMtc", "licencia", "telefono", "contactoNombre", "acopioReferencia"];

/** Los extras de varios papeles, sin repetir (el teléfono lo piden todos). */
export function extrasDe(roles: readonly RolParte[]): Extra[] {
  const vistos = new Set<ClaveExtra>();
  return roles.flatMap((r) => EXTRAS[r]).filter((x) => !vistos.has(x.clave) && Boolean(vistos.add(x.clave)));
}

