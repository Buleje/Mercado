"use client";

/**
 * Productos e inventario › Entradas y salidas: Movimientos y Pérdidas como
 * secciones (`?sub=movimientos|perdidas`) de una sola pestaña.
 *
 * Pérdidas era una pestaña aparte con las MISMAS filas que el kardex filtrado
 * por «Pérdida» (una pérdida es un movimiento `merma`) y su propio formulario.
 * Ahora comparten la carga de productos, el modal para registrar y la ficha.
 * Las piezas viven en `./movimientos/`.
 */
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { MovimientosSeccion } from "./movimientos/MovimientosSeccion";
import { PerdidasSeccion } from "./movimientos/PerdidasSeccion";
import { ID_PANEL_MOVIMIENTOS, MODULO_SECCIONES, SECCION, SUBS_MOVIMIENTOS, type SeccionMovimientos } from "./movimientos/secciones";
import { useProductosDeMovimiento } from "./movimientos/use-datos";

export default function SimpleMovementsTab() {
  const { vista: seccion, irA } = useSubvistaModulo<SeccionMovimientos>(MODULO_SECCIONES, SUBS_MOVIMIENTOS, "movimientos");
  const { productos, recargarProductos } = useProductosDeMovimiento();

  const barra = (
    <BarraDeSecciones
      secciones={SUBS_MOVIMIENTOS.map((clave) => ({ clave, rotulo: SECCION[clave].rotulo }))}
      activa={seccion}
      onCambiar={irA}
      etiqueta="Secciones de Entradas y salidas"
      idPanel={ID_PANEL_MOVIMIENTOS}
    />
  );
  /* El tabpanel envuelve el cuerpo de la sección, no su cabecera (donde vive la barra). */
  const panel = { id: ID_PANEL_MOVIMIENTOS, etiquetadoPor: idPestanaDeSeccion(ID_PANEL_MOVIMIENTOS, seccion) };
  const comun = { titulo: "Entradas y salidas", secciones: barra, panel, productos, recargarProductos };

  return seccion === "perdidas" ? <PerdidasSeccion {...comun} /> : <MovimientosSeccion {...comun} />;
}
