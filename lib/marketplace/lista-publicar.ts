/**
 * Contrato de «¿mi tienda está lista para publicar?» (GET
 * /api/marketplace/stores?my=true → `listaPublicar`). Tipos compartidos por la
 * DB class (lib/db/tienda-lista-publicar.db.ts) y la pestaña Tienda.
 */

/** Con menos, la vitrina de Inicio (4 fotos) y la ficha de la tienda se ven vacías. */
export const MIN_PRODUCTOS_LISTOS = 6;

export interface ListaPublicar {
  logo: boolean;
  /** «tienda» = Store.lat/lng; «solo-ajustes» = marcada en Ajustes pero no copiada a la tienda. */
  ubicacion: "tienda" | "solo-ajustes" | "falta";
  horario: boolean;
  productos: { activos: number; conFoto: number; conStock: number; listos: number };
  minimoListos: number;
}
