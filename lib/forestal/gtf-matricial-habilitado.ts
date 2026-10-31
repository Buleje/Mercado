import "server-only";
/**
 * ¿Puede este negocio usar el talonario de la matricial para ESTA guía? Desde
 * el 27-10 lo comparten dos libros: la guía del Libro TH pide el Libro TH y la
 * de salida de un despacho pide el Libro CTP. Sin guía (la forma de la empresa,
 * las impresoras) basta con uno de los dos: un aserradero sin Libro TH también
 * calibra su impresora.
 */
import { NextResponse } from "next/server";
import { isSpecializationEnabled } from "@/lib/specializations";
import type { GuiaDelTalonario } from "./gtf-matricial-fuente";

export async function talonarioHabilitado(tenantId: string, guia: GuiaDelTalonario | null | undefined): Promise<boolean> {
  if (guia?.tipo === "gtf") return isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  if (guia?.tipo === "despacho") return isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  const [loth, ctp] = await Promise.all([
    isSpecializationEnabled(tenantId, "spec:forestal:loth-libro"),
    isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"),
  ]);
  return loth || ctp;
}

/** 403 si el libro de esa guía no está habilitado; null = adelante. */
export async function guardTalonario(tenantId: string, guia: GuiaDelTalonario | null | undefined): Promise<NextResponse | null> {
  return (await talonarioHabilitado(tenantId, guia)) ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}
