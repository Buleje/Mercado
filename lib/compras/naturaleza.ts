/**
 * naturaleza.ts — qué es lo que se compra: mercadería, servicio o alquiler
 * (auditoría Compras C01/O07/C25, 17-10).
 *
 * `Product.type` distingue "product" de "service", pero Compras no lo leía: en
 * Blas «Aserrado de madera» (servicio, stock 0, mínimo 10) salía AGOTADO con
 * «Sugerido 30 und» y «Cargador Frontal CAT» (se alquila por hora) con «Stock: 6»
 * como si fueran tablas en el patio. Un servicio no se repone por saldo físico:
 * se contrata cuando hace falta.
 *
 * Alquiler = un servicio que se cobra por hora o por día. Es la misma regla que
 * usa el POS para su distintivo (`components/admin/pos/disponibilidad.ts`); no
 * hay un tipo «alquiler» en la base (sumarlo es decisión de Brandon).
 *
 * Sin "use client" ni "server-only": la usan la pantalla y el servidor.
 */

export type NaturalezaCompra = "inventario" | "servicio" | "alquiler";

export interface ConNaturaleza {
  /** `Product.type`: "product" (por defecto) | "service". */
  type?: string | null;
  /** `Product.pricingUnit`: fijo | hora | dia | m3 | unidad. */
  pricingUnit?: string | null;
  unit?: string | null;
}

const POR_TIEMPO: Record<string, { cobro: string; unidad: string; plural: string }> = {
  hora: { cobro: "Se alquila por hora", unidad: "hora", plural: "horas" },
  dia: { cobro: "Se alquila por día", unidad: "día", plural: "días" },
  día: { cobro: "Se alquila por día", unidad: "día", plural: "días" },
};
const UNIDAD_LEIDA: Record<string, string> = { m3: "m³", "m³": "m³", pt: "pt", unidad: "und" };

/** `true` si es un servicio (no lleva stock). Vacío o desconocido = mercadería, como en la base. */
export function esServicio(p: Pick<ConNaturaleza, "type">): boolean {
  return (p.type ?? "product").trim().toLowerCase() === "service";
}

/** Las reglas de stock (mínimo, sugerido, agotado, reposición) valen sólo para esto. */
export function esInventariable(p: Pick<ConNaturaleza, "type">): boolean {
  return !esServicio(p);
}

export interface LecturaNaturaleza {
  naturaleza: NaturalezaCompra;
  /** «Servicio» / «Alquiler»; null para mercadería (no hace falta distintivo). */
  distintivo: string | null;
  /** Cómo se cobra, para el lugar donde la mercadería dice su stock: «Se alquila por hora». */
  cobro: string | null;
  /** La unidad en que se compra: «hora», «m³», o la del producto. */
  unidad: string;
  /** Plural de `unidad` para «Agregar 4 horas». */
  unidadPlural: string;
}

/** Cómo leer un ítem en Comprar según lo que es. */
export function naturalezaDe(p: ConNaturaleza): LecturaNaturaleza {
  const unidadBase = (p.unit ?? "").trim() || "und";
  if (!esServicio(p)) {
    return { naturaleza: "inventario", distintivo: null, cobro: null, unidad: unidadBase, unidadPlural: unidadBase };
  }
  const cobro = (p.pricingUnit ?? "").trim().toLowerCase();
  const tiempo = POR_TIEMPO[cobro];
  if (tiempo) {
    return { naturaleza: "alquiler", distintivo: "Alquiler", cobro: tiempo.cobro, unidad: tiempo.unidad, unidadPlural: tiempo.plural };
  }
  // «fijo» o vacío = un precio por servicio; «m3»/«unidad» = se cobra por cantidad.
  const porCantidad = cobro && cobro !== "fijo" ? (UNIDAD_LEIDA[cobro] ?? cobro) : null;
  return {
    naturaleza: "servicio",
    distintivo: "Servicio",
    cobro: porCantidad ? `Se contrata por ${porCantidad}` : "Se contrata cuando hace falta",
    unidad: porCantidad ?? "servicio",
    unidadPlural: porCantidad ?? "servicios",
  };
}
