/**
 * Error de alta de una orden de compra con datos de OTRO negocio (10-10).
 *
 * Vive fuera de `lib/db/purchases.db.ts` (que es `server-only` y trae Prisma)
 * para que las rutas lo reconozcan con `instanceof` sin cargar la base.
 */

/** La orden trae un proveedor o productos que no son del negocio que la crea. */
export class DatosAjenosEnOrdenError extends Error {
  readonly proveedorAjeno: boolean;
  readonly productosAjenos: number[];
  constructor(proveedorAjeno: boolean, productosAjenos: number[]) {
    super(
      proveedorAjeno
        ? "El proveedor no es de este negocio"
        : `Productos que no son de este negocio: ${productosAjenos.join(", ")}`,
    );
    this.name = "DatosAjenosEnOrdenError";
    this.proveedorAjeno = proveedorAjeno;
    this.productosAjenos = productosAjenos;
  }
}
