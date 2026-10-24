/**
 * Candado «solo dueños» (ADR-502): los papeles sensibles del Archivo (nómina,
 * cuentas de terceros) no los ve un `manager`/`tienda_owner`, que en el Drive
 * general sí ven todo. Sin el candado, el Drive se comporta igual que siempre.
 */

import { describe, it, expect } from "vitest";
import {
  canRoleSeeDoc,
  canRoleSeeEnCadena,
  ROL_CANDADO_DUENO,
} from "@/lib/documents/doc-access";
import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";

const SENSIBLE = [...ROLES_ENTIDAD_SENSIBLE, ROL_CANDADO_DUENO];

describe("candado de dueño en el Drive", () => {
  it("SIN candado: manager/tienda_owner siguen viendo lo restringido (no cambia el Drive)", () => {
    expect(canRoleSeeDoc("manager", ["admin", "owner"])).toBe(true);
    expect(canRoleSeeDoc("tienda_owner", ["admin", "owner"])).toBe(true);
    expect(canRoleSeeEnCadena("manager", [], [["admin", "owner"]])).toBe(true);
  });

  it("CON candado: manager y tienda_owner NO ven el papel sensible", () => {
    expect(canRoleSeeDoc("manager", SENSIBLE)).toBe(false);
    expect(canRoleSeeDoc("tienda_owner", SENSIBLE)).toBe(false);
    expect(canRoleSeeEnCadena("manager", SENSIBLE)).toBe(false);
    // también si el candado viene por la carpeta de la cadena
    expect(canRoleSeeEnCadena("manager", [], [SENSIBLE])).toBe(false);
  });

  it("CON candado: dueño/admin/superadmin SÍ ven; cajero no", () => {
    for (const r of ["owner", "admin", "superadmin"]) {
      expect(canRoleSeeDoc(r, SENSIBLE)).toBe(true);
      expect(canRoleSeeEnCadena(r, SENSIBLE)).toBe(true);
      expect(canRoleSeeEnCadena(r, [], [SENSIBLE])).toBe(true);
    }
    expect(canRoleSeeDoc("cajero", SENSIBLE)).toBe(false);
    expect(canRoleSeeEnCadena("cajero", [], [SENSIBLE])).toBe(false);
  });
});
