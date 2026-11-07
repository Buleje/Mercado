// 25-10: Brandon eligió «Apartar las pruebas de Blas». Se anula el único adelanto de prueba ABIERTO
// (sin devolver a caja) y la persona de prueba queda inactiva. Respaldo: .claude/autonomo/respaldos/adelantos-pruebas-blas-2026-10-25-antes.json
import { AdelantosDB } from "@/lib/db/adelantos.db";
const T = "cmpxiv6p4000bohvzwl6bnfpv";
const ADELANTO = "cmum0a2dx0024yqvzneng34rb";
const PERSONA = "cmscaruft0001p2vz9dn352f2";
async function main() {
  const r = await AdelantosDB.cancel(T, ADELANTO, null);
  console.log("anulado:", r ? "ok" : "no encontrado");
  const p = await AdelantosDB.getBeneficiario(T, PERSONA);
  if (!p) throw new Error("persona de prueba no encontrada");
  const q = await AdelantosDB.updateBeneficiario(T, PERSONA, {
    nombre: p.nombre, documento: p.documento ?? undefined, telefono: p.telefono ?? undefined,
    notas: p.notas ?? undefined, limiteCredito: p.limiteCredito ?? null, activo: false,
  });
  console.log("persona:", q ? { nombre: q.nombre, activo: q.activo, telefono: q.telefono, documento: q.documento } : "no actualizada");
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
