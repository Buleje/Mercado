/**
 * ADR-491 · migración del registro de firmas de adelantos (carril database).
 *
 * Estático sobre el SQL y el schema: fija lo que la base tiene que garantizar
 * aunque la app se equivoque (solo de agregar, FK compuestas por tenant,
 * CHECKs) y que el archivo se pueda re-correr. La evidencia de la base real
 * (ensayo, corrida, 2.ª corrida «0 nuevas», backfill «0 candidatos») va en el
 * reporte del carril; esto evita que un cambio del archivo la invalide.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { partirSentencias } from "../scripts/aplicar-migracion-sesion.mjs";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const SQL = leer("prisma/migrations/adr-491-registro-firmas-adelantos.sql");
const VUELTA = leer("prisma/migrations/adr-491-vuelta-atras.sql");
const BACKFILL = leer("scripts/backfill-firmas-adelantos.mjs");
const SCHEMA = leer("prisma/schema.prisma");
const sentencias = partirSentencias(SQL);
const plano = (s: string) => s.replace(/\s+/g, " ");

function bloque(tipo: "model" | "enum", nombre: string): string {
  const m = new RegExp(`^${tipo} ${nombre} \\{[\\s\\S]*?^\\}`, "m").exec(SCHEMA);
  if (!m) throw new Error(`${tipo} ${nombre} no está en schema.prisma`);
  return m[0];
}

describe("ADR-491 · SQL expand", () => {
  it("parte en 27 sentencias y el cuerpo plpgsql queda entero (el splitter respeta $$)", () => {
    expect(sentencias).toHaveLength(27);
    const fn = sentencias.find((s) => s.includes('FUNCTION "adelanto_firma_inmutable"'));
    expect(fn).toBeDefined();
    expect(fn).toMatch(/AS \$\$[\s\S]*RETURN OLD;[\s\S]*RAISE EXCEPTION[\s\S]*END\s*\$\$$/);
  });

  it("es idempotente: tablas, índices y columna con IF NOT EXISTS; función y triggers con OR REPLACE", () => {
    for (const s of sentencias.map(plano)) {
      if (/^CREATE (UNIQUE )?INDEX/.test(s) || /^CREATE TABLE/.test(s)) expect(s).toMatch(/IF NOT EXISTS/);
      if (/ADD COLUMN/.test(s)) expect(s).toMatch(/ADD COLUMN IF NOT EXISTS/);
      if (/^CREATE (FUNCTION|TRIGGER)/.test(s)) throw new Error(`sin OR REPLACE: ${s.slice(0, 80)}`);
    }
  });

  it("no trae SET de sesión, DROP ni TRUNCATE (solo expand)", () => {
    for (const s of sentencias.map(plano)) {
      expect(s).not.toMatch(/^SET\b/i);
      expect(s).not.toMatch(/^(DROP|TRUNCATE)\b/i);
      expect(s).not.toMatch(/\bDROP (TABLE|COLUMN|TYPE|INDEX)\b/i);
    }
  });

  it("solo de agregar: trigger BEFORE UPDATE OR DELETE por fila + BEFORE TRUNCATE; DELETE solo con SET LOCAL de supresión", () => {
    const t = SQL.replace(/\s+/g, " ");
    expect(t).toContain(
      'CREATE OR REPLACE TRIGGER "AdelantoFirma_inmutable" BEFORE UPDATE OR DELETE ON "AdelantoFirma" FOR EACH ROW EXECUTE FUNCTION "adelanto_firma_inmutable"()',
    );
    expect(t).toContain(
      'CREATE OR REPLACE TRIGGER "AdelantoFirma_sin_truncate" BEFORE TRUNCATE ON "AdelantoFirma" FOR EACH STATEMENT EXECUTE FUNCTION "adelanto_firma_inmutable"()',
    );
    expect(t).toContain("IF TG_OP = 'DELETE' AND current_setting('app.permitir_borrar_firmas', true) = 'on' THEN RETURN OLD;");
  });

  it("FKs: tenant en CASCADE; (tenantId, adelantoId) y (tenantId, enlaceId) compuestas en NO ACTION", () => {
    const t = SQL.replace(/\s+/g, " ");
    for (const tabla of ["AdelantoFirma", "AdelantoEnlaceFirma"]) {
      expect(t).toContain(
        `"${tabla}_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE`,
      );
      expect(t).toContain(
        `"${tabla}_tenantId_adelantoId_fkey" FOREIGN KEY ("tenantId", "adelantoId") REFERENCES "Adelanto"("tenantId", "id") ON DELETE NO ACTION`,
      );
    }
    expect(t).toContain(
      '"AdelantoFirma_tenantId_enlaceId_fkey" FOREIGN KEY ("tenantId", "enlaceId") REFERENCES "AdelantoEnlaceFirma"("tenantId", "id") ON DELETE NO ACTION',
    );
    // El destino de la FK compuesta tiene que existir ANTES que las FK.
    const iUnico = sentencias.findIndex((s) => s.includes('"Adelanto_tenantId_id_key"'));
    const iFk = sentencias.findIndex((s) => s.includes("REFERENCES \"Adelanto\""));
    expect(iUnico).toBeGreaterThan(-1);
    expect(iUnico).toBeLessThan(iFk);
  });

  it("CHECKs de la base: sha256/tokenHash hex, bytes > 0, consentimiento en HUELLA, canal ENLACE ⇔ enlaceId, ruta del adelanto", () => {
    const t = SQL.replace(/\s+/g, " ");
    expect(t).toContain(`"AdelantoFirma_sha256_chk" CHECK ("sha256" ~ '^[a-f0-9]{64}$')`);
    expect(t).toContain(`"AdelantoEnlaceFirma_tokenHash_chk" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$')`);
    expect(t).toContain(`"AdelantoFirma_bytes_chk" CHECK ("bytes" > 0)`);
    expect(t).toContain(`"AdelantoFirma_huella_chk" CHECK ("tipo" <> 'HUELLA' OR "consentimiento" IS NOT NULL)`);
    expect(t).toContain(`"AdelantoFirma_canal_enlace_chk" CHECK (("canal" = 'ENLACE') = ("enlaceId" IS NOT NULL))`);
    expect(t).toContain(
      `"AdelantoFirma_ruta_chk" CHECK (starts_with("ruta", "tenantId" || '/adelantos/' || "adelantoId" || '/'))`,
    );
  });

  it("Settings (tabla caliente) va al final: su ACCESS EXCLUSIVE dura lo menos posible", () => {
    expect(plano(sentencias.at(-1) ?? "")).toBe(
      'ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "adelantoTopeCajero" DECIMAL(12,2)',
    );
  });
});

describe("ADR-491 · schema.prisma", () => {
  const firma = bloque("model", "AdelantoFirma");
  const enlace = bloque("model", "AdelantoEnlaceFirma");

  it("todo índice/único de las tablas nuevas arranca por tenantId (salvo el hash del token, que es la credencial)", () => {
    for (const m of [firma, enlace]) {
      const indices = [...m.matchAll(/@@(?:index|unique)\(\[([^\]]+)\]/g)].map((x) => x[1].trim());
      expect(indices.length).toBeGreaterThan(0);
      for (const campos of indices) expect(campos.startsWith("tenantId")).toBe(true);
    }
    expect(enlace).toMatch(/tokenHash\s+String\s+@unique @db\.Char\(64\)/);
    expect([...firma.matchAll(/[^@]@unique\b/g)]).toHaveLength(0);
  });

  it("relaciones compuestas por tenant en NoAction y tenant en Cascade", () => {
    for (const m of [firma, enlace]) {
      expect(m).toMatch(/adelanto\s+Adelanto\s+@relation\(fields: \[tenantId, adelantoId\], references: \[tenantId, id\], onDelete: NoAction\)/);
      expect(m).toMatch(/tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Cascade\)/);
    }
    expect(firma).toMatch(
      /enlace\s+AdelantoEnlaceFirma\?\s+@relation\(fields: \[tenantId, enlaceId\], references: \[tenantId, id\], onDelete: NoAction\)/,
    );
  });

  it("Adelanto tiene @@unique([tenantId, id]) y Settings el tope del cajero", () => {
    expect(bloque("model", "Adelanto")).toMatch(/@@unique\(\[tenantId, id\]\)/);
    expect(bloque("model", "Settings")).toMatch(/adelantoTopeCajero\s+Decimal\?\s+@db\.Decimal\(12, 2\)/);
  });

  it("enums con los valores del contrato", () => {
    expect(bloque("enum", "AdelantoFirmaTipo")).toMatch(/FIRMA\s+HUELLA/);
    expect(bloque("enum", "AdelantoFirmaCanal")).toMatch(/PANTALLA\s+ENLACE\s+BACKFILL/);
  });
});

describe("ADR-491 · vuelta atrás y backfill", () => {
  it("la vuelta atrás aborta si quedó algo (guardas) y suelta en orden trigger → función → tablas → tipos → índice → columna", () => {
    const s = partirSentencias(VUELTA).map(plano);
    expect(s.slice(0, 3).every((x) => x.startsWith("SELECT 1 / (CASE WHEN EXISTS"))).toBe(true);
    const orden = [
      'DROP TRIGGER IF EXISTS "AdelantoFirma_sin_truncate"',
      'DROP TRIGGER IF EXISTS "AdelantoFirma_inmutable"',
      'DROP FUNCTION IF EXISTS "adelanto_firma_inmutable"',
      'DROP TABLE IF EXISTS "AdelantoFirma"',
      'DROP TABLE IF EXISTS "AdelantoEnlaceFirma"',
      'DROP TYPE IF EXISTS "AdelantoFirmaCanal"',
      'DROP TYPE IF EXISTS "AdelantoFirmaTipo"',
      'DROP INDEX IF EXISTS "Adelanto_tenantId_id_key"',
      'ALTER TABLE "Settings" DROP COLUMN IF EXISTS "adelantoTopeCajero"',
    ];
    expect(s.slice(3).map((x) => orden.findIndex((o) => x.startsWith(o)))).toEqual(orden.map((_, i) => i));
  });

  it("backfill: dry-run por defecto, idempotente y sin interpolar en el SQL", () => {
    expect(BACKFILL).toMatch(/const aplicar = process\.argv\.includes\("--aplicar"\)/);
    expect(BACKFILL).toContain('ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING');
    expect(BACKFILL).toContain("'FIRMA','BACKFILL'");
    const consultas = [...BACKFILL.matchAll(/c\.query\(\s*`([^`]*)`/g)].map((m) => m[1]);
    expect(consultas.length).toBeGreaterThanOrEqual(3);
    for (const q of consultas) expect(q).not.toContain("${");
    expect(BACKFILL).not.toMatch(/\b(UPDATE|DELETE FROM)\b/);
  });
});

describe("partirSentencias (scripts/aplicar-migracion-sesion.mjs)", () => {
  it("no corta dentro de '…', $tag$…$tag$ ni comentarios", () => {
    const s = partirSentencias(
      "SELECT 'a;b' AS x; -- coment; con 'apóstrofo\nDO $x$ BEGIN PERFORM 1; END $x$; /* ; */ SELECT $1::int",
    );
    expect(s).toEqual(["SELECT 'a;b' AS x", "DO $x$ BEGIN PERFORM 1; END $x$", "SELECT $1::int"]);
  });
});
