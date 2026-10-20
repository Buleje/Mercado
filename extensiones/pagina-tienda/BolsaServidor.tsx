/**
 * La bolsa leída en el servidor (ADR-511): los datos del negocio que necesita
 * (cómo pide, WhatsApp, zonas, pagos, códigos) salen de `cargarTienda`, la
 * misma lectura (con `cache` de React) que ya hizo la página o el marco.
 *
 * Va bajo `<Suspense fallback={null}>`: la bolsa no se ve hasta abrirla, así
 * que no frena el resto de la página.
 */
import "server-only";
import { Suspense } from "react";
import type { ContextoPieza } from "../_contrato";
import { PartesBolsa } from "./Bolsa";
import { cargarTienda } from "./datos";
import { datosBolsa } from "./producto-carrito";

type Ctx = Pick<ContextoPieza, "tenantId" | "slug">;

async function Leida({ ctx, enPortada }: { ctx: Ctx; enPortada: boolean }) {
  const d = await cargarTienda(ctx);
  return <PartesBolsa bolsa={datosBolsa(d)} enPortada={enPortada} />;
}

/** `enPortada`: la portada (`/t/<negocio>`), que no tiene el checkout del layout. */
export function BolsaDeLaTienda({ ctx, enPortada = false }: { ctx: Ctx; enPortada?: boolean }) {
  return (
    <Suspense fallback={null}>
      <Leida ctx={ctx} enPortada={enPortada} />
    </Suspense>
  );
}
