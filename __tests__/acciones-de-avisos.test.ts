/**
 * «Para atender ahora» por acción (M08, noche 17-10): orden por impacto, el
 * estado de hoy manda sobre los avisos, un registro cuenta una vez y cada
 * grupo lleva a un lugar que existe.
 */
import { describe, expect, it } from "vitest";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import { ANIDADAS_POR_MODULO, vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import {
  ACCIONES,
  agruparPorAccion,
  extraDeComprobantes,
  type AlertaDeEstado,
  type AvisoGuardado,
} from "@/components/notifications/acciones-de-avisos";

const aviso = (id: string, type: string, createdAt: string, extra: Partial<AvisoGuardado> = {}): AvisoGuardado => ({
  id,
  type,
  title: `${type} ${id}`,
  createdAt,
  ...extra,
});

describe("cada acción lleva a un lugar que existe", () => {
  const tabs = new Set(ALL_TABS.map((t) => t.id as string));
  it.each(ACCIONES.map((a) => [a.id, a] as const))("%s", (_id, a) => {
    expect(tabs.has(a.destino.tab)).toBe(true);
    if (a.destino.vista) expect(vistasDelModulo(a.destino.tab).map((v) => v.key)).toContain(a.destino.vista);
    if (a.destino.sub) {
      const subs = (ANIDADAS_POR_MODULO[a.destino.tab] ?? []).filter((x) => x.vista === a.destino.vista).map((x) => x.key);
      expect(subs).toContain(a.destino.sub);
    }
  });
});

describe("agruparPorAccion", () => {
  it("ordena por impacto: caja, cobros, papeles, stock", () => {
    const alertas: AlertaDeEstado[] = [{ id: "stock-bajo", severity: "warning", title: "5 con stock bajo", cantidad: 5 }];
    const avisos = [aviso("1", "FIADO_VENCIDO", "2026-10-17T10:00:00Z", { entityId: "f1" })];
    const { grupos } = agruparPorAccion(alertas, avisos, [
      { accion: "comprobantes", cantidad: 2, titulo: "2 rechazados por SUNAT" },
      { accion: "caja", cantidad: 1, titulo: "La caja quedó abierta desde ayer", desde: "2026-10-16T13:00:00Z" },
    ]);
    expect(grupos.map((g) => g.id)).toEqual(["caja", "cobrar", "comprobantes", "reponer"]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Cuadrar la caja", "Cobrar 1", "Revisar 2 comprobantes", "Reponer 5"]);
  });

  it("el estado de hoy manda: los avisos del mismo tema no se suman encima", () => {
    const { grupos } = agruparPorAccion(
      [{ id: "pagos-vencidos", severity: "warning", title: "3 pagos vencidos", cantidad: 3 }],
      [aviso("1", "PROVEEDOR_VENCIDO", "2026-10-17T10:00:00Z"), aviso("2", "PROVEEDOR_VENCIDO", "2026-10-17T11:00:00Z")],
    );
    expect(grupos[0].cantidad).toBe(3);
    expect(grupos[0].detalle).toEqual(["3 pagos vencidos"]);
  });

  it("cinco recordatorios del mismo fiado son uno; los leídos no cuentan", () => {
    const avisos = [
      aviso("1", "FIADO_REMINDER", "2026-10-15T10:00:00Z", { entityId: "rosa" }),
      aviso("2", "FIADO_REMINDER", "2026-10-16T10:00:00Z", { entityId: "rosa" }),
      aviso("3", "FIADO_VENCIDO", "2026-10-17T09:00:00Z", { entityId: "juan" }),
      aviso("4", "FIADO_VENCIDO", "2026-10-17T09:30:00Z", { entityId: "ana", readAt: "2026-10-17T09:31:00Z" }),
    ];
    const [g] = agruparPorAccion([], avisos).grupos;
    expect(g.rotulo).toBe("Cobrar 2");
    expect(g.fecha).toEqual({ iso: "2026-10-17T09:00:00Z", es: "ultimo" });
    expect(g.registro).toBeNull();
  });

  it("el resumen diario sin registro cuenta una vez; el texto repetido lleva cuántos son", () => {
    const resumen = { title: "Adelantos vencidos por cobrar" };
    const doc = { title: "Documento por vencer" };
    const avisos = [
      aviso("1", "ADELANTO_VENCIDO", "2026-10-15T08:37:00Z", resumen),
      aviso("2", "ADELANTO_VENCIDO", "2026-10-16T08:37:00Z", resumen),
      aviso("3", "DOCUMENTO_VENCIMIENTO", "2026-10-16T09:00:00Z", { ...doc, entityId: "d1" }),
      aviso("4", "DOCUMENTO_VENCIMIENTO", "2026-10-16T09:05:00Z", { ...doc, entityId: "d2" }),
    ];
    const [cobrar, documentos] = agruparPorAccion([], avisos).grupos;
    expect(cobrar.rotulo).toBe("Cobrar 1");
    expect(cobrar.detalle).toEqual(["Adelantos vencidos por cobrar"]);
    expect(documentos.rotulo).toBe("Revisar 2 documentos");
    expect(documentos.detalle).toEqual(["Documento por vencer (2)"]);
  });

  it("un solo aviso lleva al registro que lo originó (si es del panel)", () => {
    const dentro = agruparPorAccion([], [aviso("1", "DIFERENCIA_CAJA", "2026-10-17T10:00:00Z", { actionUrl: "/admin?tab=ventas-caja&vista=turnos&turno=t1" })]);
    expect(dentro.grupos[0].registro).toBe("/admin?tab=ventas-caja&vista=turnos&turno=t1");
    const fuera = agruparPorAccion([], [aviso("1", "DOCUMENTO_VENCIMIENTO", "2026-10-17T10:00:00Z", { actionUrl: "/superadmin/documentos" })]);
    expect(fuera.grupos[0].registro).toBeNull();
  });

  it("las alertas sin grupo (recordatorios) vuelven sueltas; sin nada, sin grupos", () => {
    const r = agruparPorAccion([{ id: "recordatorios-vencidos", severity: "critical", title: "2 recordatorios vencidos" }], []);
    expect(r.grupos).toEqual([]);
    expect(r.sueltas.map((a) => a.id)).toEqual(["recordatorios-vencidos"]);
  });

  it("urgente si una alerta es crítica o un aviso es de prioridad alta", () => {
    const [g] = agruparPorAccion([], [aviso("1", "STOCK_CRITICO", "2026-10-17T10:00:00Z", { severity: "HIGH" })]).grupos;
    expect(g.urgente).toBe(true);
  });
});

describe("extraDeComprobantes", () => {
  it("cuenta sólo lo de SUNAT, con el más viejo y el responsable", () => {
    const e = extraDeComprobantes({
      pendientes: [
        { causa: "rechazado", fecha: "2026-10-16T10:00:00Z", responsable: "Rosa" },
        { causa: "sin-respuesta", fecha: "2026-10-15T10:00:00Z", responsable: null },
        { causa: "cotizacion-por-vencer", fecha: "2026-10-01T10:00:00Z" },
      ],
    });
    expect(e).toMatchObject({ accion: "comprobantes", cantidad: 2, desde: "2026-10-15T10:00:00Z", urgente: true, responsable: "Rosa" });
    expect(e?.titulo).toBe("1 rechazado por SUNAT · 1 sin respuesta de SUNAT");
  });

  it("sin la bandeja (403, error) o sin nada de SUNAT no hay grupo", () => {
    expect(extraDeComprobantes(null)).toBeNull();
    expect(extraDeComprobantes({ pendientes: [{ causa: "guia-borrador" }] })).toBeNull();
  });
});
