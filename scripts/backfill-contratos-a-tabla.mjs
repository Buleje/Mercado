/**
 * ADR-307 — pasa los contratos que vivían serializados como Note
 * ("CONTRATO: …" con JSON en el content) a la tabla Contract.
 *
 * Idempotente: si el (tenantId, numero) ya existe en Contract, lo saltea.
 * NO borra las notas — quedan como respaldo hasta confirmar que todo migró.
 *
 *   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/backfill-contratos-a-tabla.mjs
 *   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/backfill-contratos-a-tabla.mjs --apply
 *
 * Sin --apply corre en seco y sólo reporta qué haría. Usa `pg` directo porque
 * el cliente generado de Prisma es TypeScript con imports sin extensión y Node
 * no lo puede cargar desde un script suelto.
 */
import pkg from "pg";

const { Client } = pkg;
const APLICAR = process.argv.includes("--apply");

/** El tipo se guardaba ya colapsado por el mapa viejo de la UI; lo desandamos. */
const TIPO_DESDE_API = {
  COMPRAVENTA: "VENTA",
  SUMINISTRO: "PROVEEDOR",
};

const ESTADO_DESDE_VIEJO = {
  ACTIVO: "VIGENTE",
  VENCIDO: "VENCIDO",
  ANULADO: "ANULADO",
  BORRADOR: "BORRADOR",
  RENOVADO: "RENOVADO",
};

const TIPOS_VALIDOS = new Set([
  "VENTA", "SERVICIO", "TRABAJO", "PROVEEDOR", "DISTRIBUCION", "ALQUILER",
  "CONSIGNACION", "MUTUO", "TRANSPORTE", "NDA", "FORESTAL", "LOCACION",
]);

function fecha(v, fallback) {
  if (!v) return fallback;
  const d = new Date(String(v).length === 10 ? `${v}T12:00:00.000Z` : v);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const db = new Client({ connectionString: url });
  await db.connect();

  try {
    const { rows: notas } = await db.query(
      `SELECT id, "tenantId", content, "createdAt", "updatedAt"
         FROM "Note" WHERE title LIKE 'CONTRATO:%' ORDER BY "createdAt" ASC`,
    );
    console.log(`Notas con contratos: ${notas.length}${APLICAR ? "" : "  (corrida en seco)"}`);

    let migrados = 0;
    let saltados = 0;
    let rotos = 0;

    for (const nota of notas) {
      let d;
      try {
        d = JSON.parse(nota.content);
      } catch {
        console.warn(`  ✗ ${nota.id}: content no es JSON`);
        rotos++;
        continue;
      }
      if (!d?.numero) {
        console.warn(`  ✗ ${nota.id}: sin número`);
        rotos++;
        continue;
      }

      const { rows: existe } = await db.query(
        `SELECT 1 FROM "Contract" WHERE "tenantId" = $1 AND numero = $2 LIMIT 1`,
        [nota.tenantId, String(d.numero)],
      );
      if (existe.length > 0) {
        saltados++;
        continue;
      }

      const tipoCrudo = String(d.tipo || "SERVICIO").toUpperCase();
      const tipo = TIPO_DESDE_API[tipoCrudo] ?? (TIPOS_VALIDOS.has(tipoCrudo) ? tipoCrudo : "SERVICIO");
      const estado = ESTADO_DESDE_VIEJO[String(d.estado || "ACTIVO").toUpperCase()] ?? "VIGENTE";
      const clausulas = Array.isArray(d.clausulas) ? d.clausulas.map(String) : [];
      const numero = String(d.numero);
      const monto = Number(d.monto ?? d.montoTotal ?? 0) || 0;

      if (APLICAR) {
        await db.query(
          `INSERT INTO "Contract"
             (id, "tenantId", numero, tipo, estado, "clienteNombre", "clienteDoc",
              descripcion, resumen, monto, moneda, "fechaInicio", "fechaVencimiento",
              "plantillaId", contenido, clausulas, "lugarFirma", condiciones,
              "creadoPor", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            // Conservamos el id de la nota: los links viejos y el localStorage lo usan.
            nota.id,
            nota.tenantId,
            numero,
            tipo,
            estado,
            String(d.clienteNombre || "Sin nombre").slice(0, 200),
            String(d.clienteDoc || d.clienteDocumento || "").slice(0, 20),
            String(d.descripcion || "").slice(0, 2000),
            String(d.resumen || "").slice(0, 2000),
            monto,
            d.moneda === "USD" ? "USD" : "PEN",
            fecha(d.fecha ?? d.fechaContrato, nota.createdAt),
            d.fechaVencimiento ? fecha(d.fechaVencimiento, null) : null,
            d.plantillaId ? String(d.plantillaId) : null,
            // El texto completo vivía en el localStorage del navegador que lo
            // creó; del servidor sólo se pueden rescatar las cláusulas.
            clausulas.join("\n\n"),
            clausulas,
            String(d.lugarFirma || "Pucallpa").slice(0, 200),
            String(d.condiciones || "").slice(0, 2000),
            String(d.creadoPor || "").slice(0, 100),
            nota.createdAt,
            nota.updatedAt,
          ],
        );
        await db.query(
          `INSERT INTO "ContractEvent" (id, "tenantId", "contractId", tipo, detalle, actor)
           VALUES (gen_random_uuid()::text, $1, $2, 'CREADO', $3, $4)`,
          [nota.tenantId, nota.id, `Contrato ${numero} migrado desde notas`, String(d.creadoPor || "migracion")],
        );
      }

      console.log(`  ✓ ${numero} · ${tipo} · ${estado} · ${d.moneda === "USD" ? "US$" : "S/"}${monto}`);
      migrados++;
    }

    console.log(`\nMigrados: ${migrados} · Ya estaban: ${saltados} · Rotos: ${rotos}`);
    if (!APLICAR && migrados > 0) console.log("Corré con --apply para escribir de verdad.");
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("Falló el backfill:", err);
  process.exitCode = 1;
});
