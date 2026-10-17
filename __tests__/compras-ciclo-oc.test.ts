import { describe, it, expect } from "vitest";
import {
  acumularRecibido,
  acumularNoLlegara,
  armarSeguimiento,
  conSeguimiento,
  lineasDeSeguimiento,
  cicloDeOrden,
  resumenCancelacion,
  grupoDeEntrega,
  efectosDeRecepcion,
  claveDeDia,
  diaCorto,
  planParaRepetir,
  acumularNoAptos,
  valorDeLoRecibido,
  deudaAlCancelar,
  type SeguimientoOC,
  type ItemOc,
} from "@/lib/compras/ciclo-oc";
import { estaCompleta } from "@/lib/compras/recibido-acumulado";

/**
 * El ciclo de la orden de compra (noche 17-10, C10/C14/C15/C19/C23). Todo lo
 * que la pantalla dice de stock y deuda sale de acá: si la cuenta de la
 * pantalla no es la del servidor, la orden «recibida» del panel no es la que
 * quedó en la base.
 */

const ITEMS: ItemOc[] = [
  { productId: 1, name: "Arroz Costeño 5 kg", quantity: 10, unit: "saco", unitCost: 20 },
  { productId: 2, name: "Aceite Primor 1 L", quantity: 6, unit: "botella", unitCost: 10 },
];
const HOY = "2026-10-17"; // sábado

const recepcion = (id: string, itemsJson: unknown, extra: Partial<{ ref: string; createdAt: string; status: string }> = {}) => ({
  id, ref: extra.ref ?? `REC-${id}`, purchaseOrderId: "oc1", status: extra.status ?? "parcial",
  receivedDate: null, createdAt: extra.createdAt ?? "2026-10-15T15:00:00.000Z", itemsJson,
});

const seg = (parcial: Partial<SeguimientoOC>): SeguimientoOC => ({ recibido: {}, noLlegara: {}, recepciones: [], cuenta: null, ...parcial });

describe("acumularRecibido — la misma cuenta que decide parcial/recibido en el servidor", () => {
  it("suma las tandas por productId o por nombre, y deja afuera lo ajeno o vacío", () => {
    const r = acumularRecibido(
      [
        recepcion("a", [{ productId: 1, receivedQty: 4 }, { product: "  aceite primor 1 l ", receivedQty: 2 }]),
        recepcion("b", [{ productId: 1, receivedQty: 3 }, { productId: 99, receivedQty: 5 }, { product: "Fideos", receivedQty: 8 }]),
        recepcion("c", "no es lista"),
        recepcion("d", [null, { productId: 2, receivedQty: 0 }, { productId: 2, receivedQty: "x" }]),
      ],
      ITEMS,
    );
    expect(Object.fromEntries(r)).toEqual({ 1: 7, 2: 2 });
  });

  it("excluye la recepción que se está creando", () => {
    const r = acumularRecibido([recepcion("a", [{ productId: 1, receivedQty: 4 }]), recepcion("b", [{ productId: 1, receivedQty: 3 }])], ITEMS, "b");
    expect(r.get(1)).toBe(4);
  });

  it("cuenta lo dañado como recibido (llegó, aunque vaya a merma)", () => {
    const r = acumularRecibido([recepcion("a", [{ productId: 1, receivedQty: 10, condition: "dañado" }])], ITEMS);
    expect(estaCompleta(ITEMS, r)).toBe(false); // falta el aceite
    expect(r.get(1)).toBe(10);
  });
});

describe("acumularNoLlegara — los faltantes que la recepción acreditó", () => {
  it("lee creditoUnidades sólo de los «faltante»", () => {
    const r = acumularNoLlegara(
      [recepcion("a", [
        { productId: 2, receivedQty: 4, condition: "faltante", creditoUnidades: 2 },
        { productId: 1, receivedQty: 8, condition: "conforme", creditoUnidades: 9 },
        { productId: 1, receivedQty: 0, condition: "faltante" },
      ])],
      ITEMS,
    );
    expect(Object.fromEntries(r)).toEqual({ 2: 2 });
  });
});

describe("lineasDeSeguimiento — el remanente no desaparece (C19)", () => {
  it("pedido, llegó, no llegará y lo que falta por producto", () => {
    const l = lineasDeSeguimiento(ITEMS, { recibido: { 1: 4, 2: 4 }, noLlegara: { 2: 2 } });
    expect(l.map((x) => [x.productId, x.llego, x.noLlegara, x.falta])).toEqual([[1, 4, 0, 6], [2, 4, 2, 0]]);
  });

  it("recibir de más no deja faltas negativas", () => {
    const l = lineasDeSeguimiento(ITEMS, { recibido: { 1: 12 }, noLlegara: {} });
    expect(l[0].falta).toBe(0);
  });
});

describe("armarSeguimiento / conSeguimiento — lo que adjunta GET ?seguimiento=1", () => {
  it("cuenta con saldo y vencimiento en Lima; recepciones con su día", () => {
    const s = armarSeguimiento(
      ITEMS,
      [recepcion("a", [{ productId: 1, receivedQty: 4 }], { createdAt: "2026-10-16T03:00:00.000Z" })],
      { purchaseOrderId: "oc1", amount: "260.00", paidAmount: "100", status: "parcial", dueDate: "2026-10-20T02:30:00.000Z" },
    );
    expect(s.recibido).toEqual({ 1: 4 });
    // 03:00 UTC del 16 = 22:00 del 15 en Lima.
    expect(s.recepciones[0]).toMatchObject({ id: "a", fecha: "2026-10-15" });
    expect(s.cuenta).toEqual({ monto: 260, pagado: 100, saldo: 160, vence: "2026-10-19", estado: "parcial" });
  });

  it("cada orden recibe sólo lo suyo; sin cuenta = null", () => {
    const out = conSeguimiento(
      [{ id: "oc1", items: ITEMS }, { id: "oc2", items: ITEMS }],
      [recepcion("a", [{ productId: 1, receivedQty: 4 }]), { ...recepcion("b", [{ productId: 1, receivedQty: 9 }]), purchaseOrderId: "oc2" }],
      [{ purchaseOrderId: "oc2", amount: 50, paidAmount: 0, status: "pendiente", dueDate: null }],
    );
    expect(out[0].seguimiento.recibido).toEqual({ 1: 4 });
    expect(out[0].seguimiento.cuenta).toBeNull();
    expect(out[1].seguimiento.recibido).toEqual({ 1: 9 });
    expect(out[1].seguimiento.cuenta?.saldo).toBe(50);
  });
});

describe("fechas", () => {
  it("una fecha sin hora (medianoche UTC) no se corre al día anterior", () => {
    expect(claveDeDia("2026-10-20T00:00:00.000Z")).toBe("2026-10-20");
    expect(claveDeDia("2026-10-20")).toBe("2026-10-20");
    expect(claveDeDia("2026-10-20T04:59:00.000Z")).toBe("2026-10-19");
    expect(claveDeDia(null)).toBeNull();
  });
  it("«jueves 10/09»", () => {
    expect(diaCorto("2026-09-10")).toBe("jueves 10/09");
  });
});

describe("cicloDeOrden — cada paso por separado y EL siguiente (C10)", () => {
  const base = { items: ITEMS, paymentMethod: "contado" };

  it("pagada pero sin mercadería: el pago dice pagada y lo que sigue es recibir", () => {
    const c = cicloDeOrden({ ...base, status: "pendiente", paymentMethod: "transferencia", deliveryDate: "2026-10-20T00:00:00.000Z" }, seg({}), HOY);
    expect(c.pasos.find((p) => p.clave === "pago")).toMatchObject({ texto: "Ya pagada al pedirla", tono: "ok" });
    expect(c.pasos.find((p) => p.clave === "entrega")).toMatchObject({ texto: "Por recibir · llega el martes 20/10", quien: "el proveedor" });
    expect(c.siguiente).toMatchObject({ texto: "Recibir el martes 20/10", accion: "recibir" });
  });

  it("sin forma de pago anotada pero con cuenta en Por pagar: manda la cuenta, no dice «Contado»", () => {
    const cuenta = { monto: 300, pagado: 100, saldo: 200, vence: "2026-10-30", estado: "parcial" };
    const c = cicloDeOrden({ ...base, status: "parcial", paymentMethod: undefined }, seg({ recibido: { 1: 10 }, cuenta }), HOY);
    expect(c.pasos.find((p) => p.clave === "pago")?.texto).toBe("Pagaste S/ 100.00, debes S/ 200.00 · vence el viernes 30/10");
  });

  it("atrasada: lo dice con días y en alerta", () => {
    const c = cicloDeOrden({ ...base, status: "parcial", deliveryDate: "2026-10-14" }, seg({ recibido: { 1: 10 } }), HOY);
    expect(c.pasos[1]).toMatchObject({ texto: "Faltan 1 de 2 productos · atrasada 3 días", tono: "alerta" });
    expect(c.siguiente).toMatchObject({ texto: "Recibir · atrasada 3 días", tono: "alerta" });
  });

  it("recibida a crédito con saldo: sigue pagar; si venció, va primero", () => {
    const cuenta = { monto: 260, pagado: 0, saldo: 260, vence: "2026-10-20", estado: "pendiente" };
    const ok = cicloDeOrden({ ...base, status: "recibido", paymentMethod: "credito_7", invoiceNumber: "F001-12", invoiceType: "factura" }, seg({ cuenta }), HOY);
    expect(ok.pasos[1].texto).toBe("Llegó todo");
    expect(ok.pasos[2].texto).toBe("Factura F001-12");
    expect(ok.siguiente).toMatchObject({ texto: "Pagar S/ 260.00", accion: "pagar" });

    const vencida = cicloDeOrden({ ...base, status: "parcial", paymentMethod: "credito_7", deliveryDate: "2026-10-30" }, seg({ cuenta: { ...cuenta, vence: "2026-10-15" } }), HOY);
    expect(vencida.siguiente).toMatchObject({ texto: "Pagar S/ 260.00 · venció", tono: "alerta" });
  });

  it("recibida y pagada sin comprobante: anotar el comprobante; con todo, cerrada", () => {
    const sin = cicloDeOrden({ ...base, status: "recibido" }, seg({}), HOY);
    expect(sin.siguiente).toMatchObject({ texto: "Anotar el comprobante", accion: "comprobante" });
    const todo = cicloDeOrden({ ...base, status: "recibido", invoiceType: "ninguno" }, seg({}), HOY);
    expect(todo.siguiente).toMatchObject({ texto: "Nada: orden cerrada", accion: null });
  });

  it("el faltante acreditado cierra la línea: no se sigue esperando", () => {
    const c = cicloDeOrden({ ...base, status: "recibido" }, seg({ recibido: { 1: 10, 2: 4 }, noLlegara: { 2: 2 } }), HOY);
    expect(c.pasos[1].texto).toBe("Cerrada · 1 producto no llegará");
  });

  it("automática: aprobar antes que nada; cancelada con saldo: revisar la deuda", () => {
    expect(cicloDeOrden({ ...base, status: "auto_generated" }, seg({}), HOY).siguiente.accion).toBe("aprobar");
    const c = cicloDeOrden({ ...base, status: "cancelado", paymentMethod: "credito_15" }, seg({ cuenta: { monto: 260, pagado: 60, saldo: 200, vence: null, estado: "parcial" } }), HOY);
    expect(c.siguiente).toMatchObject({ texto: "Revisar la deuda que quedó (S/ 200.00)", tono: "alerta" });
  });
});

describe("resumenCancelacion — lo que hay que ver ANTES de cancelar (C15)", () => {
  const oc = { status: "parcial", items: ITEMS, total: 260, paymentMethod: "credito_15" };

  it("con mercadería recibida y deuda sin pagos: la deuda BAJA a lo que llegó (revisión 17-10)", () => {
    const r = resumenCancelacion(oc, seg({ recibido: { 1: 4 }, recepciones: [{ id: "a", ref: "REC-1", fecha: "2026-10-15", estado: "parcial" }], cuenta: { monto: 260, pagado: 0, saldo: 260, vence: null, estado: "pendiente" } }));
    expect(r[0]).toBe("Lo que ya llegó se queda en el stock (4 de 10 Arroz Costeño 5 kg).");
    expect(r[1]).toBe("Se deja de esperar: 6 Arroz Costeño 5 kg, 6 Aceite Primor 1 L.");
    expect(r[2]).toBe("La deuda baja de S/ 260.00 a S/ 80.00: lo que ya llegó se paga, lo que falta se deja de deber.");
    expect(r).toContain("Su recepción queda registrada.");
  });

  it("lo que llegó dañado no se paga: la deuda baja sólo a lo bueno", () => {
    const r = resumenCancelacion(oc, seg({ recibido: { 1: 4 }, noAptos: { 1: 1 }, cuenta: { monto: 260, pagado: 0, saldo: 260, vence: null, estado: "pendiente" } }));
    expect(r.join(" ")).toContain("a S/ 60.00"); // 3 buenas × 20
  });

  it("si la deuda ya vale lo que llegó, se queda", () => {
    const r = resumenCancelacion(oc, seg({ recibido: { 1: 4 }, cuenta: { monto: 80, pagado: 0, saldo: 80, vence: null, estado: "pendiente" } }));
    expect(r.join(" ")).toContain("La deuda de S/ 80.00 se queda: es lo que vale lo que ya llegó.");
  });

  it("al almacenero no le dice cifras de la deuda", () => {
    const r = resumenCancelacion(oc, seg({ recibido: { 1: 4 }, cuentaOculta: true }));
    expect(r.join(" ")).toContain("Lo que pasa con la deuda lo ve el administrador en Por pagar.");
    expect(r.join(" ")).not.toContain("No tiene cuenta");
    // Ya pagada por transferencia: eso sí se lo dice (no es la deuda).
    expect(resumenCancelacion({ ...oc, paymentMethod: "transferencia" }, seg({ cuentaOculta: true })).join(" ")).toContain("no devuelve la plata");
  });

  it("con pagos: la deuda se conserva y lo dice con cifras", () => {
    const r = resumenCancelacion(oc, seg({ cuenta: { monto: 260, pagado: 100, saldo: 160, vence: null, estado: "parcial" } }));
    expect(r.join(" ")).toContain("ya le pagaste S/ 100.00 y quedan S/ 160.00");
  });

  it("sin forma anotada pero con cuenta: avisa la anulación igual que el servidor", () => {
    const r = resumenCancelacion({ ...oc, paymentMethod: undefined }, seg({ cuenta: { monto: 260, pagado: 0, saldo: 260, vence: null, estado: "pendiente" } }));
    expect(r.join(" ")).toContain("Se anula su deuda de S/ 260.00: no llegó nada que pagar.");
  });

  it("transferencia: cancelar no devuelve la plata", () => {
    const r = resumenCancelacion({ ...oc, paymentMethod: "transferencia" }, seg({}));
    expect(r.join(" ")).toContain("no devuelve la plata");
  });

  it("el valor de lo recibido lleva el IGV que el total le sumó", () => {
    const r = resumenCancelacion({ ...oc, total: 306.8 }, seg({ recibido: { 1: 4 }, cuenta: { monto: 306.8, pagado: 0, saldo: 306.8, vence: null, estado: "pendiente" } }));
    expect(r.join(" ")).toContain("a S/ 94.40"); // 4 × 20 × 1,18
  });
});

describe("deuda al cancelar — la misma cuenta en pantalla y en el servidor (revisión 17-10)", () => {
  it("acumularNoAptos suma sólo lo dañado o vencido", () => {
    const m = acumularNoAptos([
      recepcion("a", [{ productId: 1, receivedQty: 2, condition: "dañado" }, { productId: 1, receivedQty: 5, condition: "ok" }]),
      recepcion("b", [{ product: "Aceite Primor 1 L", receivedQty: 1, condition: "vencido" }, { productId: 2, receivedQty: 3, condition: "faltante", creditoUnidades: 3 }]),
    ], ITEMS);
    expect(Object.fromEntries(m)).toEqual({ 1: 2, 2: 1 });
  });

  it("valorDeLoRecibido: tope en lo pedido, sin lo no apto, con el factor del total", () => {
    expect(valorDeLoRecibido(ITEMS, 260, new Map([[1, 12], [2, 3]]))).toBe(230); // 10×20 + 3×10
    expect(valorDeLoRecibido(ITEMS, 260, { 1: 4 }, { 1: 4 })).toBe(0);
    expect(valorDeLoRecibido(ITEMS, 306.8, { 1: 4 })).toBe(94.4);
  });

  it("deudaAlCancelar: anula sin nada, baja a lo que llegó, nunca sube", () => {
    expect(deudaAlCancelar(260, 0)).toEqual({ accion: "anular", monto: 0 });
    expect(deudaAlCancelar(260, 80)).toEqual({ accion: "bajar", monto: 80 });
    expect(deudaAlCancelar(70, 80)).toEqual({ accion: "igual", monto: 70 });
  });

  it("conSeguimiento con ocultarCuenta no manda la deuda y el paso de pago no la nombra", () => {
    const cuentas = [{ purchaseOrderId: "oc1", amount: 260, paidAmount: 0, status: "pendiente", dueDate: null }];
    const [conCuenta] = conSeguimiento([{ id: "oc1", items: ITEMS }], [], cuentas);
    const [oculta] = conSeguimiento([{ id: "oc1", items: ITEMS }], [], cuentas, { ocultarCuenta: true });
    expect(conCuenta.seguimiento.cuenta?.monto).toBe(260);
    expect(oculta.seguimiento.cuenta).toBeNull();
    expect(oculta.seguimiento.cuentaOculta).toBe(true);
    const pago = cicloDeOrden({ status: "parcial", items: ITEMS, paymentMethod: "credito_15" }, oculta.seguimiento, HOY).pasos.find((p) => p.clave === "pago");
    expect(pago?.texto).toBe("La deuda la ve el administrador en Por pagar");
    expect(JSON.stringify(oculta)).not.toContain("260");
  });
});

describe("grupoDeEntrega — la agenda (C14)", () => {
  it("atrasadas / hoy / 7 días / después / sin fecha", () => {
    expect(grupoDeEntrega("2026-10-16T00:00:00.000Z", HOY)).toBe("atrasadas");
    expect(grupoDeEntrega("2026-10-17", HOY)).toBe("hoy");
    expect(grupoDeEntrega("2026-10-24", HOY)).toBe("semana");
    expect(grupoDeEntrega("2026-10-25", HOY)).toBe("despues");
    expect(grupoDeEntrega(undefined, HOY)).toBe("sin_fecha");
  });
});

describe("efectosDeRecepcion — lo que va a hacer el servidor al guardar (C23)", () => {
  const orden = { items: ITEMS, seguimiento: { recibido: { 1: 4 }, noLlegara: {} } };

  it("sano a stock, dañado a merma, faltante cierra la línea; al arroz le falta 1", () => {
    const e = efectosDeRecepcion(
      [
        { product: "Arroz Costeño 5 kg", productId: 1, expectedQty: 6, receivedQty: 5, condition: "dañado" },
        { product: "Aceite Primor 1 L", productId: 2, expectedQty: 6, receivedQty: 4, condition: "faltante" },
      ],
      orden,
    );
    expect(e.merma).toEqual([{ nombre: "Arroz Costeño 5 kg", n: 5 }]);
    expect(e.aStock).toEqual([{ nombre: "Aceite Primor 1 L", n: 4 }]); // lo que llegó del faltante sí entra
    expect(e.noLlegara).toEqual([{ nombre: "Aceite Primor 1 L", n: 2 }]);
    expect(e.quedaPendiente).toEqual([{ nombre: "Arroz Costeño 5 kg", n: 1 }]);
    expect(e.ordenQueda).toBe("parcial");
  });

  it("lo que llega marcado faltante igual entra al stock (como en el servidor)", () => {
    const e = efectosDeRecepcion([{ product: "Aceite Primor 1 L", productId: 2, expectedQty: 6, receivedQty: 4, condition: "faltante" }], { items: ITEMS, seguimiento: { recibido: { 1: 10 }, noLlegara: {} } });
    expect(e.aStock).toEqual([{ nombre: "Aceite Primor 1 L", n: 4 }]);
    expect(e.ordenQueda).toBe("recibido");
  });

  it("de más y fuera de la orden se dicen aparte", () => {
    const e = efectosDeRecepcion(
      [
        { product: "Arroz Costeño 5 kg", productId: 1, expectedQty: 6, receivedQty: 8, condition: "conforme" },
        { product: "Fideos Don Vittorio", expectedQty: 0, receivedQty: 3, condition: "conforme" },
      ],
      orden,
    );
    expect(e.deMas).toEqual([{ nombre: "Arroz Costeño 5 kg", n: 2 }]);
    expect(e.fueraDeOrden).toEqual(["Fideos Don Vittorio"]);
    expect(e.quedaPendiente).toEqual([{ nombre: "Aceite Primor 1 L", n: 6 }]);
  });

  it("sin orden: no mueve stock ni deuda", () => {
    const e = efectosDeRecepcion([{ product: "Arroz", expectedQty: 1, receivedQty: 1, condition: "conforme" }], null);
    expect(e).toMatchObject({ aStock: [], merma: [], ordenQueda: null });
  });
});

describe("planParaRepetir — repetir con revisión (C16)", () => {
  const vieja = { id: "v", createdAt: "2026-09-10T15:00:00.000Z", status: "recibido", paymentMethod: "transferencia", items: ITEMS };
  const nueva = { id: "n", createdAt: "2026-10-12T15:00:00.000Z", status: "recibido", items: [{ ...ITEMS[0], unitCost: 22 }] };
  const cancelada = { id: "c", createdAt: "2026-10-14T15:00:00.000Z", status: "cancelado", items: [{ ...ITEMS[0], unitCost: 99 }] };

  it("toma el costo de tu última compra no cancelada y lo dice", () => {
    const p = planParaRepetir(vieja, [cancelada, nueva, vieja], HOY);
    expect(p.dia).toBe("jueves 10/09");
    expect(p.dias).toBe(37);
    expect(p.cambios).toEqual([{ nombre: "Arroz Costeño 5 kg", antes: 20, ahora: 22, dia: "lunes 12/10" }]);
    expect(p.items.map((i) => i.unitCost)).toEqual([22, 10]);
  });

  it("«ya pagada» no se copia: la nueva sale al contado; el crédito se conserva", () => {
    expect(planParaRepetir(vieja, [vieja], HOY)).toMatchObject({ paymentMethod: "contado", condicionCambio: true, cambios: [] });
    expect(planParaRepetir({ ...nueva, paymentMethod: "credito_15" }, [nueva], HOY)).toMatchObject({ paymentMethod: "credito_15", condicionCambio: false });
  });
});
