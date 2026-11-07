import "server-only";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { nombreDeOtro, type NombreTercero, type TipoTercero } from "@/lib/documentos/terceros-vinculo";

/**
 * El nombre (y el RUC/DNI) del tercero ligado a una carpeta: la etiqueta guarda
 * sólo su id. Lo usa la propuesta de carpeta («nombra a "Grifo El Petrolero",
 * ligado a la carpeta»). Misma lectura que la pestaña Terceros
 * (`app/api/admin/documents/terceros/route.ts`, que tiene su copia: otro carril
 * la estaba tocando el 24-10; juntarlas es mover la de la ruta a este archivo).
 */
export async function nombreDeTercero(tenantId: string, tipo: TipoTercero, id: string): Promise<NombreTercero | null> {
  switch (tipo) {
    case "persona": {
      const b = await AdelantosDB.getBeneficiario(tenantId, id);
      return b ? { nombre: b.nombre, detalle: b.documento ?? null } : null;
    }
    case "proveedor": {
      const s = await SuppliersDB.getById(tenantId, id);
      return s ? { nombre: s.name, detalle: s.ruc ? `RUC ${s.ruc}` : null } : null;
    }
    case "cliente": {
      const c = await CustomersDB.getByPhone(id, tenantId);
      return c ? { nombre: c.name || id, detalle: c.phone } : null;
    }
    case "colaborador": {
      const c = await ColaboradoresDB.obtener(tenantId, id);
      return c ? { nombre: c.nombre, detalle: c.documento ?? null } : null;
    }
    case "comunidad": {
      const p = await ForestDirectorioDB.getParte(tenantId, id);
      return p ? { nombre: p.nombre, detalle: p.docNumero ? `${p.docTipo ?? "Doc."} ${p.docNumero}` : null } : null;
    }
    case "otro":
      return { nombre: nombreDeOtro(id), detalle: null };
  }
}
