"use client";

/**
 * Pérdidas como vista suelta (`?vista=mermas`), mientras el hub la siga
 * montando. Desde el 10-10 es la sección «Pérdidas» de Entradas y salidas
 * (`?vista=kardex&sub=perdidas`): una pérdida es un movimiento `merma`, las
 * mismas filas del kardex. Cuando el hub deje de importarla, este archivo se
 * borra; todo lo que mostraba vive en `inventario/movimientos/PerdidasSeccion`.
 */
import { PerdidasSeccion } from "./inventario/movimientos/PerdidasSeccion";
import { useProductosDeMovimiento } from "./inventario/movimientos/use-datos";

export default function ShrinkageTab() {
  const { productos, recargarProductos } = useProductosDeMovimiento();
  return <PerdidasSeccion titulo="Pérdidas" productos={productos} recargarProductos={recargarProductos} />;
}
