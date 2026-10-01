/**
 * Tests — el estado de la guía de un despacho (ADR-374).
 *
 * La regla es de una línea, y por eso mismo hay que clavarla: de ella depende
 * si un documento ya declarado ante la autoridad se puede seguir editando.
 */

import { describe, it, expect } from "vitest";
import { estadoDeGuia, guiaEditable, motivoNoEditable } from "@/lib/forestal/gtf-estado";

describe("estadoDeGuia", () => {
  it("sin número es borrador", () => {
    expect(estadoDeGuia(null)).toBe("borrador");
    expect(estadoDeGuia(undefined)).toBe("borrador");
    expect(estadoDeGuia("")).toBe("borrador");
  });

  it("sólo espacios sigue siendo borrador", () => {
    // Un guardado que dejó "   " no puede pasar por documento emitido.
    expect(estadoDeGuia("   ")).toBe("borrador");
    expect(guiaEditable("   ")).toBe(true);
  });

  it("con correlativo formal está emitida", () => {
    expect(estadoDeGuia("GTF-001-000042")).toBe("emitida");
    expect(guiaEditable("GTF-001-000042")).toBe(false);
  });

  it("las líneas viejas con número tipeado a mano cuentan como emitidas", () => {
    /* Antes el número se escribía a mano y no seguía ninguna serie. Esas
       guías ya se declararon: tratarlas como borrador dejaría reescribir
       documentos que la autoridad ya vio. */
    expect(estadoDeGuia("QA-LOTE-SALIDA-2")).toBe("emitida");
    expect(estadoDeGuia("001-0000988")).toBe("emitida");
    expect(guiaEditable("001-0000988")).toBe(false);
  });

  it("el motivo nombra la guía, y sólo aparece cuando no se puede editar", () => {
    expect(motivoNoEditable(null)).toBeNull();
    expect(motivoNoEditable("GTF-001-000042")).toContain("GTF-001-000042");
    expect(motivoNoEditable("GTF-001-000042")).toMatch(/no se puede modificar/i);
  });
});
