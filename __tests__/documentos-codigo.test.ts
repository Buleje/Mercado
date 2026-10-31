// @vitest-environment node
/**
 * ADR-516 — Código único de cada papel del Archivo (Brandon 24-10: «un código
 * único correlativo y fácil de entender que no se repetirá en ninguna parte»).
 *
 * Lo puro: cómo se escribe y se lee (`DOC-000123`), cuándo falta anotarlo en el
 * físico, que la búsqueda lo ponga primero (lista y buscador del panel) y el
 * aviso de la campana (uno por día, sólo con atrasados).
 *
 * El correlativo, que borrar no devuelva el número y la carrera de altas
 * simultáneas los decide la base (trigger): esos se prueban contra la base con
 * `scripts/documentos-codigo-conducta.mjs` (ROLLBACK + negocio sintético).
 * Acá queda el guardián de que el trigger, el relleno y la app esconden las
 * MISMAS fotos de máquina.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  codigoFisicoPendiente,
  formatoCodigoDocumento,
  leerCodigoDocumento,
} from "@/lib/documentos/codigo-documento";
import { avisoCodigoFisico, TIPO_AVISO_CODIGO_FISICO, URL_CODIGO_PENDIENTE } from "@/lib/documentos/codigo-fisico-avisos";
import { coincidenciaDe, ordenarPorRelevancia } from "@/lib/documentos/relevancia";
import { papelesComoResultados } from "@/components/admin/buscador/papeles-del-buscador";
import { TAGS_FOTOS_DE_MAQUINA } from "@/lib/documents/fotos-de-maquina";
import type { DbDocument } from "@/lib/types/documents";
import { TAGS_SIN_CODIGO } from "../scripts/documentos-codigo-relleno.mjs";

const doc = (over: Partial<DbDocument> & { id: string }): DbDocument =>
  ({
    name: over.id,
    originalName: over.id,
    mimeType: "application/pdf",
    size: 1,
    folderId: null,
    tags: [],
    aiTags: [],
    favorite: false,
    status: null,
    expiresAt: null,
    deletedAt: null,
    uploadedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  }) as unknown as DbDocument;

describe("formato y lectura del código", () => {
  it("se escribe DOC- con 6 cifras y crece sin cortarse", () => {
    expect(formatoCodigoDocumento(1)).toBe("DOC-000001");
    expect(formatoCodigoDocumento(123)).toBe("DOC-000123");
    expect(formatoCodigoDocumento(1234567)).toBe("DOC-1234567");
    expect(formatoCodigoDocumento(42, "BLS")).toBe("BLS-000042");
  });

  it("sin código no se inventa uno", () => {
    for (const v of [null, undefined, 0, -3, 1.5]) expect(formatoCodigoDocumento(v as number | null)).toBeNull();
  });

  it("lee el código como lo escribe una persona", () => {
    for (const t of ["DOC-000123", "doc-123", "doc 123", "DOC123", "Doc_123", "#123", "123", "  000123  "]) {
      expect(leerCodigoDocumento(t), t).toBe(123);
    }
  });

  it("una frase con un número no es un código", () => {
    for (const t of ["contrato 123", "DOC-12a", "", "   ", "DOC-", "0", "DOC-0000000000000000000001"]) {
      expect(leerCodigoDocumento(t), t).toBeNull();
    }
  });

  it("falta anotarlo en el físico = tiene código, sin marcar y no está en la papelera", () => {
    expect(codigoFisicoPendiente({ codigo: 5 })).toBe(true);
    expect(codigoFisicoPendiente({ codigo: 5, codigoFisicoAt: "2026-10-24T10:00:00Z" })).toBe(false);
    expect(codigoFisicoPendiente({ codigo: 5, deletedAt: "2026-10-24T10:00:00Z" })).toBe(false);
    expect(codigoFisicoPendiente({ codigo: null })).toBe(false);
  });
});

describe("buscar por código", () => {
  const papeles = [
    doc({ id: "a", name: "Contrato DOC 7 años", codigo: 3 }),
    doc({ id: "b", name: "Licencia", codigo: 7 }),
    doc({ id: "c", name: "Foto", codigo: null }),
  ];

  it("la lista del Archivo pone primero el papel con ese código y dice por qué", () => {
    expect(coincidenciaDe(papeles[1], ["DOC-000007"])).toMatchObject({ campo: "codigo", fragmento: { match: "DOC-000007" } });
    // Una cifra también: el código es único.
    expect(coincidenciaDe(papeles[1], ["7"])?.campo).toBe("codigo");
    expect(ordenarPorRelevancia(papeles, ["doc", "7"]).map((d) => d.id)[0]).toBe("b");
  });

  it("el buscador del panel lo pone primero y muestra el código", () => {
    const filas = papelesComoResultados("doc 7", papeles, []);
    expect(filas[0]).toMatchObject({ id: "papel-b", subtitle: "DOC-000007 · Archivo" });
    // Sin código, el subtítulo queda como siempre.
    expect(papelesComoResultados("foto", papeles, [])[0]).toMatchObject({ id: "papel-c", subtitle: "Archivo" });
  });
});

describe("aviso de la campana", () => {
  const hoy = new Date("2026-10-24T15:00:00Z");

  it("sólo avisa si hay atrasados", () => {
    expect(avisoCodigoFisico({ pendientes: 4, atrasados: 0, hoy })).toEqual([]);
    expect(avisoCodigoFisico({ pendientes: 0, atrasados: 0, hoy })).toEqual([]);
  });

  it("uno por día (la fecha de Lima en el entityId) y lleva a la vista de pendientes", () => {
    const [a] = avisoCodigoFisico({ pendientes: 5, atrasados: 2, hoy });
    expect(a).toMatchObject({ type: TIPO_AVISO_CODIGO_FISICO, entityId: "pendientes:2026-10-24", actionUrl: URL_CODIGO_PENDIENTE });
    expect(a.title).toBe("5 papeles por registrar");
    // 23:30 en Lima del 24 ya es 25 en UTC: sigue siendo el aviso del 24.
    const [noche] = avisoCodigoFisico({ pendientes: 1, atrasados: 1, hoy: new Date("2026-10-25T04:30:00Z") });
    expect(noche.entityId).toBe("pendientes:2026-10-24");
    expect(noche.title).toBe("1 papel por registrar");
  });

  it("la URL del aviso abre la subvista «codigo» del drive", () => {
    expect(new URL(URL_CODIGO_PENDIENTE, "http://x").searchParams.get("sub")).toBe("codigo");
  });
});

describe("guardián: las fotos de máquina sin código son las mismas en todas partes", () => {
  it("relleno, trigger y app esconden las mismas etiquetas", () => {
    const app = [...TAGS_FOTOS_DE_MAQUINA].sort();
    expect([...TAGS_SIN_CODIGO].sort()).toEqual(app);
    // La 2.ª migración (20261024b, revisión de security) reemplaza la función: es la viva.
    for (const m of ["20261024a_documento_codigo_adr516", "20261024b_documento_codigo_trigger_robusto"]) {
      const sql = readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8");
      const listas = [...sql.matchAll(/ARRAY\[([^\]]+)\]::TEXT\[\]/gi)].map((x) =>
        x[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort(),
      );
      expect(listas.length, m).toBeGreaterThan(0);
      for (const l of listas) expect(l, m).toEqual(app);
    }
    // `tags` admite NULL: la función viva no lo deja pasar por «no es foto».
    const viva = readFileSync("prisma/migrations/20261024b_documento_codigo_trigger_robusto/migration.sql", "utf8");
    expect(viva).not.toMatch(/(?<!COALESCE\()(NEW\.|d\.)"tags" &&/);
  });
});
