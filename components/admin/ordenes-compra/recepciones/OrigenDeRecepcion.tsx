import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { motivoSinOrden, type Reception } from "@/components/admin/ordenes-compra/recepciones/tipos";

/**
 * C18 · De dónde vino una recepción: «Ver la orden» (abre su ficha) o «Sin
 * orden: <motivo>». Antes se mostraba el código interno de la orden en mono, y
 * vacío cuando llegó sin orden.
 */
export default function OrigenDeRecepcion({ rec, className }: { rec: Pick<Reception, "orderRef" | "notes">; className?: string }) {
  if (rec.orderRef) {
    return <EnlacePanel cosa="oc" id={rec.orderRef} className={className}>Ver la orden</EnlacePanel>;
  }
  const motivo = motivoSinOrden(rec.notes);
  return <span className={className} title={motivo ?? undefined}>{motivo ? `Sin orden: ${motivo}` : "Sin orden"}</span>;
}
