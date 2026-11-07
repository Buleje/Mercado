/**
 * ADR-530 — el plan de recuperar (lógica pura, sin base): orden por FK, nunca
 * pisar, lo que necesita lo marcado vuelve con él.
 */
import { describe, expect, it } from "vitest";
import { conteoDelPlan, planificarRecuperacion } from "@/lib/forestal/ctp-respaldo-plan";
import { TABLAS_RESPALDO } from "@/lib/forestal/ctp-respaldo-tipos";
import type { TablasSerial } from "@/lib/forestal/ctp-respaldo-serial";
import { analizar } from "@/lib/forestal/ctp-respaldo-diff";
import { D, T, consumo, copia, corrida, ingreso, sinCierres, troza } from "./ctp-respaldo-fixtures";

describe("planificarRecuperacion", () => {
  it("inserta en el orden de las FK: guía, luego madres y después sus retrozos", () => {
    /* Los ids ordenan al revés de lo que pide la FK a propósito. */
    const r: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [
        troza("a-nieto", "w1", { trozaOrigenId: "b-hijo" }),
        troza("b-hijo", "w1", { trozaOrigenId: "z-madre" }),
        troza("z-madre", "w1"),
      ],
    };
    const p = planificarRecuperacion(r, {}, sinCierres, ["ingreso:w1"]);
    expect(p.cancelar).toBeNull();
    expect(Object.keys(p.inserts)).toEqual(TABLAS_RESPALDO.filter((t) => t === "WoodEntry" || t === "WoodEntryTroza"));
    expect(p.inserts.WoodEntryTroza?.map((t) => t.id)).toEqual(["z-madre", "b-hijo", "a-nieto"]);
  });

  it("nunca pisa: lo cambiado no entra y ningún id insertado existe hoy", () => {
    const r: TablasSerial = {
      WoodEntry: [ingreso("w1"), ingreso("w2"), ingreso("w3")],
      ForestCtpEntry: [corrida("c1"), corrida("c2")],
    };
    const h = copia(r);
    h.WoodEntry = [ingreso("w2", { gtfNumber: "EDITADA" }), ingreso("w3")];
    h.ForestCtpEntry = [corrida("c2", { status: "anulado", annulledReason: "error" })];
    const p = planificarRecuperacion(r, h, sinCierres, "todo_lo_borrado");
    for (const t of TABLAS_RESPALDO) {
      const hoy = new Set((h[t] ?? []).map((f) => f.id));
      for (const f of p.inserts[t] ?? []) expect(hoy.has(f.id), `${t} ${String(f.id)}`).toBe(false);
    }
    expect(p.inserts.WoodEntry?.map((f) => f.id)).toEqual(["w1"]);
    expect(p.inserts.ForestCtpEntry?.map((f) => f.id)).toEqual(["c1"]);
    expect(p.restores).toEqual([{ tabla: "ForestCtpEntry", id: "c2", datos: { deletedAt: null, status: "registrado", annulledReason: null } }]);
    expect(conteoDelPlan(p)).toEqual({ WoodEntry: 1, ForestCtpEntry: 2 });

    const marcadoCambiado = planificarRecuperacion(r, h, sinCierres, ["ingreso:w2"]);
    expect(marcadoCambiado.inserts).toEqual({});
    expect(marcadoCambiado.saltadas).toEqual([{ clave: "ingreso:w2", etiqueta: "GTF GTF-w2 · Proveedor", motivo: "Existe hoy con otros datos: no se pisa." }]);
  });

  it("un mes cerrado no se toca: lo marcado se salta con su motivo", () => {
    const r: TablasSerial = { ForestCtpEntry: [corrida("c1")] };
    const p = planificarRecuperacion(r, {}, { mesCerrado: () => "octubre 2026" }, ["corrida:c1"]);
    expect(p.inserts).toEqual({});
    expect(p.saltadas[0].motivo).toContain("El mes octubre 2026 está cerrado");
  });

  it("una troza usada hoy por otra corrida: la corrida vieja no vuelve", () => {
    const r: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [troza("t1", "w1", { consumidaEnId: "c1" })],
      ForestCtpEntry: [corrida("c1")],
    };
    const h: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [troza("t1", "w1", { consumidaEnId: "c2" })],
      ForestCtpEntry: [corrida("c2", { lineNo: 4 })],
    };
    const p = planificarRecuperacion(r, h, sinCierres, ["corrida:c1"]);
    expect(p.inserts).toEqual({});
    expect(p.rehooks).toEqual([]);
    expect(p.saltadas[0].motivo).toContain("La troza T1 ya entró en la corrida");
  });

  it("lo que necesita lo marcado vuelve con él (la guía de un consumo) y se avisa", () => {
    const r: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")], ForestCtpConsumo: [consumo("k1", "c1", "w1")] };
    const p = planificarRecuperacion(r, {}, sinCierres, ["corrida:c1"]);
    expect(p.inserts.WoodEntry?.map((f) => f.id)).toEqual(["w1"]);
    expect(p.inserts.ForestCtpConsumo?.map((f) => f.id)).toEqual(["k1"]);
    expect(p.avisos.some((a) => a.startsWith("También vuelve GTF GTF-w1"))).toBe(true);
    expect(p.corridasASaldar).toEqual(["c1"]);
  });

  it("los consumos de una corrida editada no vuelven; la corrida entera borrada sí trae los suyos", () => {
    const r: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")], ForestCtpConsumo: [consumo("k-viejo", "c1", "w1")] };
    const editada: TablasSerial = { WoodEntry: [ingreso("w1")], ForestCtpEntry: [corrida("c1")], ForestCtpConsumo: [consumo("k-nuevo", "c1", "w1")] };
    const p = planificarRecuperacion(r, editada, sinCierres, ["corrida:c1"]);
    expect(p.inserts.ForestCtpConsumo).toBeUndefined();
    expect(p.saltadas[0].motivo).toBe("La corrida se editó después; sus consumos de hoy mandan.");

    const borrada: TablasSerial = { WoodEntry: [ingreso("w1")] };
    expect(planificarRecuperacion(r, borrada, sinCierres, ["corrida:c1"]).inserts.ForestCtpConsumo?.map((f) => f.id)).toEqual(["k-viejo"]);
  });

  it("lo que apunta a otro módulo que ya no existe vuelve vacío y se avisa", () => {
    const r: TablasSerial = { WoodEntry: [ingreso("w1", { supplierId: "prov-borrado" })] };
    const p = planificarRecuperacion(r, {}, { mesCerrado: () => null, externos: { proveedores: new Set() } }, ["ingreso:w1"]);
    expect(p.inserts.WoodEntry?.[0].supplierId).toBeNull();
    expect(p.avisos).toContain("El proveedor de GTF GTF-w1 · Proveedor ya no existe: volvió sin proveedor.");
    /* El respaldo no se modifica. */
    expect(r.WoodEntry?.[0].supplierId).toBe("prov-borrado");
  });

  it("deshacer la baja de una corrida re-engancha la troza que quedó libre", () => {
    const r: TablasSerial = {
      WoodEntry: [ingreso("w1")],
      WoodEntryTroza: [troza("t1", "w1", { consumidaEnId: "c1", fechaConsumo: T("2026-10-12") })],
      ForestCtpEntry: [corrida("c1")],
    };
    const h: TablasSerial = { WoodEntry: [ingreso("w1")], WoodEntryTroza: [troza("t1", "w1")], ForestCtpEntry: [corrida("c1", { deletedAt: T("2026-10-15") })] };
    const p = planificarRecuperacion(r, h, sinCierres, ["corrida:c1"]);
    expect(p.restores.map((x) => x.id)).toEqual(["c1"]);
    expect(p.rehooks).toEqual([{ trozaId: "t1", campo: "consumidaEnId", entryId: "c1", fecha: T("2026-10-12"), actual: null, otroActual: null }]);
    expect(p.corridasASaldar).toEqual(["c1"]);
  });

  describe("lo que hoy ya salió por otro lado no vuelve (revisión ADR-530)", () => {
    const salida = (id: string, extra: Record<string, unknown> = {}) =>
      corrida(id, { section: "despacho", gtfNumber: `S-${id}`, entryDate: T("2026-10-14"), ...extra });
    const grupo = (r: TablasSerial, h: TablasSerial, clave: string) => analizar(r, h, sinCierres).grupos.find((g) => g.clave === clave);

    it("1 · troza que hoy salió en rollo en una guía viva: la corrida no la vuelve a consumir", () => {
      const r: TablasSerial = {
        WoodEntry: [ingreso("w1")],
        ForestCtpEntry: [corrida("x1")],
        WoodEntryTroza: [troza("t1", "w1", { consumidaEnId: "x1", fechaConsumo: T("2026-10-12") })],
      };
      const h = copia(r);
      h.ForestCtpEntry = [corrida("x1", { status: "anulado" }), salida("s1")];
      h.WoodEntryTroza = [troza("t1", "w1", { despachadaEnId: "s1", fechaDespacho: T("2026-10-14") })];
      expect(grupo(r, h, "corrida:x1")?.recuperable).toBe(false);
      expect(grupo(r, h, "corrida:x1")?.motivo).toMatch(/salió en rollo/);
      const p = planificarRecuperacion(r, h, sinCierres, ["corrida:x1"]);
      expect(p.rehooks).toEqual([]);
      expect(p.restores).toEqual([]);
    });

    it("2 · pedazos borrados cuya madre hoy entró en una corrida viva: no vuelven", () => {
      const r: TablasSerial = {
        WoodEntry: [ingreso("w1")],
        ForestCtpEntry: [corrida("y1")],
        WoodEntryTroza: [troza("tm", "w1"), troza("tp", "w1", { trozaOrigenId: "tm" })],
      };
      const h = copia(r);
      h.WoodEntryTroza = [troza("tm", "w1", { consumidaEnId: "y1", fechaConsumo: T("2026-10-12") })];
      expect(grupo(r, h, "ingreso:w1")?.recuperable).toBe(false);
      expect(grupo(r, h, "ingreso:w1")?.motivo).toMatch(/madre TM|madre tm/i);
      expect(planificarRecuperacion(r, h, sinCierres, "todo_lo_borrado").inserts.WoodEntryTroza).toBeUndefined();
    });

    it("3 · lote comercial editado: la corrida que hoy está en otro lote no vuelve al viejo", () => {
      const lote = (id: string) => ({ id, tenantId: "t1", loteCode: id, status: "abierto", deletedAt: null, fechaInicio: T("2026-10-13") });
      const miembro = (id: string, loteId: string) => ({ id, tenantId: "t1", loteId, produccionEntryId: "b1", quantity: D("500") });
      const r: TablasSerial = { ForestCtpEntry: [corrida("b1")], ForestProdLote: [lote("L"), lote("M")], ForestProdLoteMiembro: [miembro("m1", "L")] };
      const h = copia(r);
      h.ForestProdLoteMiembro = [miembro("m2", "M")];
      expect(grupo(r, h, "lote:L")?.recuperable).toBe(false);
      expect(grupo(r, h, "lote:L")?.motivo).toMatch(/dos lotes/);
      expect(planificarRecuperacion(r, h, sinCierres, "todo_lo_borrado").inserts.ForestProdLoteMiembro).toBeUndefined();
      /* Si el lote se reescribió (miembros con id nuevo), los viejos no vuelven aunque la corrida esté libre. */
      const h2 = copia(r);
      h2.ForestProdLoteMiembro = [{ ...miembro("m9", "L"), produccionEntryId: "b1" }];
      const g2 = grupo(r, h2, "lote:L");
      expect(g2?.recuperable).toBe(false);
      expect(g2?.motivo).toMatch(/se editó después/);
    });

    it("4 · cobro de aserrío quitado de una corrida viva: no vuelve solo; con su corrida, sí", () => {
      const cargo = (extra: Record<string, unknown> = {}) => ({
        id: "c1", tenantId: "t1", ctpEntryId: "x1", monto: D("100"), fecha: T("2026-10-12"), fleteId: null, contratoId: null, deletedAt: null, ...extra,
      });
      const r: TablasSerial = { ForestCtpEntry: [corrida("x1")], ForestCuentaMov: [cargo()] };
      const h = copia(r);
      h.ForestCuentaMov = [cargo({ deletedAt: T("2026-10-20") })];
      expect(grupo(r, h, "corrida:x1")?.recuperable).toBe(false);
      const p = planificarRecuperacion(r, h, sinCierres, ["corrida:x1"]);
      expect(p.restores.filter((x) => x.tabla === "ForestCuentaMov")).toEqual([]);

      /* Corrida anulada hoy con otro cobro vivo: vuelve la corrida, el cobro viejo no (índice parcial). */
      const h2 = copia(r);
      h2.ForestCtpEntry = [corrida("x1", { status: "anulado" })];
      h2.ForestCuentaMov = [cargo({ deletedAt: T("2026-10-20") }), cargo({ id: "c2" })];
      const p2 = planificarRecuperacion(r, h2, sinCierres, "todo_lo_borrado");
      expect(p2.restores.map((x) => x.tabla)).toEqual(["ForestCtpEntry"]);

      /* Corrida y cobro borrados juntos (vaciar): vuelven los dos. */
      const p3 = planificarRecuperacion(r, { ForestCtpEntry: [], ForestCuentaMov: [] }, sinCierres, "todo_lo_borrado");
      expect(p3.inserts.ForestCuentaMov?.map((f) => f.id)).toEqual(["c1"]);
    });

    it("5 · salida anulada cuyo paquete hoy va en otra guía viva: no vuelve", () => {
      const paquete = { id: "p1", tenantId: "t1", ctpEntryId: "x1", codigo: "P-55", deletedAt: null, pieTablar: D("100") };
      const r: TablasSerial = {
        ForestCtpEntry: [corrida("x1"), salida("s1", { codigoProducto: "P-55" })],
        ForestCtpPaquete: [paquete],
      };
      const h = copia(r);
      h.ForestCtpEntry = [corrida("x1"), salida("s1", { codigoProducto: "P-55", status: "anulado" }), salida("s2", { codigoProducto: "P-55" })];
      const g = grupo(r, h, "salida:s1");
      expect(g?.recuperable).toBe(false);
      expect(g?.motivo).toMatch(/P-55 ya va en la salida/);
      expect(planificarRecuperacion(r, h, sinCierres, "todo_lo_borrado").restores).toEqual([]);
    });

    it("9 · si cae la madre, caen los pedazos y los nietos (punto fijo), y se avisa", () => {
      /* La madre ya no existe ni en el respaldo: cae el pedazo, y con él el nieto (que sí tenía madre en el plan). */
      const r: TablasSerial = {
        WoodEntry: [ingreso("w2")],
        WoodEntryTroza: [troza("tp", "w2", { trozaOrigenId: "tm" }), troza("tn", "w2", { trozaOrigenId: "tp" }), troza("tq", "w2")],
      };
      const h: TablasSerial = { WoodEntry: [ingreso("w2")], WoodEntryTroza: [] };
      const p = planificarRecuperacion(r, h, sinCierres, "todo_lo_borrado");
      expect(p.inserts.WoodEntryTroza?.map((t) => t.id)).toEqual(["tq"]);
      expect(p.avisos.some((a) => /una fila no vuelve porque lo que las sostiene/.test(a))).toBe(true);
    });

    it("A · la madre se volvió a trozar después: los pedazos viejos no vuelven", () => {
      const r: TablasSerial = { WoodEntry: [ingreso("w1")], WoodEntryTroza: [troza("tm", "w1"), troza("tp1", "w1", { trozaOrigenId: "tm" })] };
      const h: TablasSerial = { WoodEntry: [ingreso("w1")], WoodEntryTroza: [troza("tm", "w1"), troza("tp3", "w1", { trozaOrigenId: "tm" })] };
      expect(grupo(r, h, "ingreso:w1")?.recuperable).toBe(false);
      expect(grupo(r, h, "ingreso:w1")?.motivo).toMatch(/se volvió a trozar después; sus pedazos de hoy mandan/);
      expect(planificarRecuperacion(r, h, sinCierres, "todo_lo_borrado").inserts.WoodEntryTroza).toBeUndefined();
    });

    describe("B · L1 sumando todo lo marcado: corrida de 10, L1 y L2 con 5 cada uno, hoy M con 5", () => {
      const lote = (id: string, extra: Record<string, unknown> = {}) => ({ id, tenantId: "t1", loteCode: id, status: "abierto", deletedAt: null, fechaInicio: T("2026-10-13"), ...extra });
      const miembro = (id: string, loteId: string) => ({ id, tenantId: "t1", loteId, produccionEntryId: "x1", quantity: D("5") });
      const r: TablasSerial = { ForestCtpEntry: [corrida("x1", { quantity: D("10") })], ForestProdLote: [lote("L1"), lote("L2")], ForestProdLoteMiembro: [miembro("m1", "L1"), miembro("m2", "L2")] };
      const conM = (lotes: TablasSerial["ForestProdLote"], miembros: TablasSerial["ForestProdLoteMiembro"]): TablasSerial => ({
        ForestCtpEntry: [corrida("x1", { quantity: D("10") })],
        ForestProdLote: [...(lotes ?? []), lote("M")],
        ForestProdLoteMiembro: [...(miembros ?? []), miembro("m3", "M")],
      });

      it.each([
        ["borrados (purga)", conM([], [])],
        ["dados de baja", conM([lote("L1", { deletedAt: T("2026-10-20") }), lote("L2", { deletedAt: T("2026-10-20") })], [miembro("m1", "L1"), miembro("m2", "L2")])],
      ])("lotes %s: cada uno solo cabe, los dos juntos no → no se recupera nada", (_que, h) => {
        const p = planificarRecuperacion(r, h, sinCierres, "todo_lo_borrado");
        expect(p.cancelar).toMatch(/corrida N\.° 1 quedaría con 15 en lotes y produjo 10/);
      });

      it("uno solo sí entra", () => {
        const h = conM([], []);
        const g = analizar(r, h, sinCierres).grupos.find((x) => x.clave === "lote:L1");
        expect(g?.recuperable).toBe(true);
        expect(planificarRecuperacion(r, h, sinCierres, ["lote:L1"]).cancelar).toBeNull();
      });
    });
  });
});
