/**
 * Agenda (ADR-501 §7) — candados de seguridad de las conexiones de Google:
 *  · quién administra TODAS las conexiones del negocio (dueño/admin), no sólo la suya;
 *  · la vista de tienda del superadmin (suplantación) NO puede publicar ICS ni conectar;
 *  · el DTO de admin expone id + usuario para poder revocar la ajena.
 */
import { describe, expect, it } from "vitest";
import {
  puedeConectarAgenda,
  puedeAdministrarConexiones,
  ROLES_ADMINISTRAR_CONEXIONES,
} from "@/lib/admin/agenda-acceso";
import { esSuplantacion, PREFIJO_SUPLANTACION } from "@/lib/auth/suplantacion";
import { aConexionAdminDTO, type FilaConexionGoogle } from "@/lib/db/agenda-conexiones.db";

describe("quién administra las conexiones de Google", () => {
  it("dueño y admin ven y revocan todas; el resto sólo la suya", () => {
    expect(puedeAdministrarConexiones("owner")).toBe(true);
    expect(puedeAdministrarConexiones("admin")).toBe(true);
    for (const rol of ["tienda_owner", "manager", "cajero", "almacenero", "analista", null] as const) {
      expect(puedeAdministrarConexiones(rol)).toBe(false);
    }
  });

  it("administrar-todas es un subconjunto de los que pueden conectar", () => {
    for (const rol of ROLES_ADMINISTRAR_CONEXIONES) expect(puedeConectarAgenda(rol)).toBe(true);
  });
});

describe("la suplantación no deja residuos", () => {
  it("el usuario de una vista de tienda se reconoce como suplantación", () => {
    expect(esSuplantacion(`${PREFIJO_SUPLANTACION}brandon`)).toBe(true);
    expect(esSuplantacion("qaadmin")).toBe(false);
    expect(esSuplantacion(null)).toBe(false);
  });
});

describe("aConexionAdminDTO", () => {
  it("expone id y usuario para revocar la conexión ajena", () => {
    const fila: FilaConexionGoogle = {
      id: "cx_1",
      tenantId: "t_1",
      adminUserId: "cajero_despedido",
      email: "ex@gmail.com",
      scopes: ["https://www.googleapis.com/auth/calendar"],
      refreshTokenCifrado: "secreto",
      calendarId: "cal_1",
      tasklistId: null,
      estado: "error",
      ultimoError: "quedó fuera",
      ultimaSync: null,
    };
    const dto = aConexionAdminDTO(fila);
    expect(dto.id).toBe("cx_1");
    expect(dto.usuario).toBe("cajero_despedido");
    expect(dto.email).toBe("ex@gmail.com");
    expect(dto.estado).toBe("error");
    expect(dto.tareas).toBe(false);
    // El refresh token cifrado NO sale en el DTO.
    expect(dto).not.toHaveProperty("refreshTokenCifrado");
  });
});
