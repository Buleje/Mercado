/**
 * Pieza `madera-disponible` — lo que llena el enchufe `tienda.portada` (modo
 * `agrega`: un bloque más en el orden de la portada).
 *
 * `cargar()` corre con el tope de 2 s del `<Enchufe>`: si el libro tarda (la
 * primera lectura en frío midió 3 s en `main`), esta visita ve la portada sin
 * el bloque y la caché queda llenándose para la siguiente.
 */
import "server-only";
import type { PiezaPortada } from "../_contrato";
import { contactoDelNegocio, leerMaderaPublica } from "./datos";
import type { OpcionesMaderaDisponible } from "./manifest";
import { VistaMaderaDisponible, type DatosMadera } from "./vista";

export const portada: PiezaPortada<OpcionesMaderaDisponible, DatosMadera> = {
  modo: "agrega",
  async cargar(ctx) {
    const [madera, contacto] = await Promise.all([
      leerMaderaPublica(ctx.tenantId),
      contactoDelNegocio(ctx.tenantId),
    ]);
    return { madera, contacto };
  },
  Vista: VistaMaderaDisponible,
};
