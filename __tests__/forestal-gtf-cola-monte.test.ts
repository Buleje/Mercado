import { describe, expect, it } from "vitest";
import {
  aplicarAccion,
  cerrarPorGuiaCaida,
  controlarHoja,
  correlativoDeGuia,
  crearTrabajo,
  enlaceCola,
  enlaceWhatsApp,
  impresaDeGuia,
  limpiarNumeroHoja,
  mensajeAlMonte,
  normalizarAlmacen,
  normalizarCelular,
  podar,
  rutaSalida,
  trabajoDeLaFila,
  type AlmacenCola,
  type TrabajoCola,
} from "@/lib/forestal/gtf-cola-monte";

const F = { en: "2026-10-16T15:00:00.000Z", por: "oficina" };
const F2 = { en: "2026-10-16T18:00:00.000Z", por: "monte" };
const VACIO: AlmacenCola = { contacto: null, trabajos: [] };
const DATOS = { gtfId: "g1", numeroGuia: "025-001-0971772", titular: "Blas", hojas: ["lista", "guia"] as const, perfilId: "monte" };

function conUno(): { alm: AlmacenCola; t: TrabajoCola } {
  const r = crearTrabajo(VACIO, DATOS, F, "t1");
  if (!r.ok) throw new Error("no creó");
  return { alm: r.almacen, t: r.trabajo };
}

describe("control del N° de hoja", () => {
  it("el correlativo es el último grupo de dígitos", () => {
    expect(correlativoDeGuia("025-001-0971772")).toBe("0971772");
    expect(correlativoDeGuia("001-0000120")).toBe("0000120");
    expect(correlativoDeGuia("sin número")).toBeNull();
  });

  it("coincide sin importar los ceros a la izquierda ni lo que rodea al número", () => {
    expect(controlarHoja("025-001-0971772", "0971772")).toEqual({ coincide: true });
    expect(controlarHoja("025-001-0971772", "971772")).toEqual({ coincide: true });
    expect(controlarHoja("025-001-0971772", "N° 0971772")).toEqual({ coincide: true });
  });

  it("otra hoja o sin N° no coincide, con el porqué", () => {
    expect(controlarHoja("025-001-0971772", "0971773")).toEqual({ coincide: false, observacion: "La hoja dice 0971773, la guía es 0971772" });
    expect(controlarHoja("025-001-0971772", "   ")).toEqual({ coincide: false, observacion: "No se anotó el N° de la hoja" });
  });

  it("une los dígitos partidos por espacios o guiones antes de comparar", () => {
    for (const v of ["0971 772", "0971-772", "0971 - 772", "025-001-0971772", "Hoja N° 0971772", "N° 0 971 772."]) expect(limpiarNumeroHoja(v), v).toBe("0971772");
    expect(limpiarNumeroHoja("001-0000120")).toBe("0000120");
    expect(limpiarNumeroHoja("sin número")).toBe("");
    expect(controlarHoja("025-001-0971772", "0971 772")).toEqual({ coincide: true });
    expect(controlarHoja("025-001-0971772", "0971-773")).toEqual({ coincide: false, observacion: "La hoja dice 0971773, la guía es 0971772" });
  });

  it("una guía sin dígitos no se puede controlar: no se marca observada por eso", () => {
    expect(controlarHoja("SIN-NUMERO", "123").coincide).toBe(true);
  });
});

describe("crear en la cola: un vivo por guía", () => {
  it("nace pendiente, con las hojas en orden guía → lista", () => {
    const { t } = conUno();
    expect(t).toMatchObject({ id: "t1", estado: "pendiente", hojas: ["guia", "lista"], creadoPor: "oficina" });
  });

  it("reenviar una pendiente la actualiza, no duplica", () => {
    const { alm } = conUno();
    const r = crearTrabajo(alm, { ...DATOS, hojas: ["guia"], perfilId: "oficina" }, F2, "t2");
    expect(r.ok && r.reenviado).toBe(true);
    if (!r.ok) return;
    expect(r.almacen.trabajos).toHaveLength(1);
    expect(r.trabajo).toMatchObject({ id: "t1", hojas: ["guia"], perfilId: "oficina", creadoEn: F.en });
  });

  it("una ya impresa u observada no se reenvía: hay que anularla", () => {
    const { alm } = conUno();
    const impresa = aplicarAccion(alm, "t1", { tipo: "impresa" }, F2);
    if (!impresa.ok) throw new Error("no marcó");
    const r = crearTrabajo(impresa.almacen, DATOS, F2, "t2");
    expect(r).toMatchObject({ ok: false, error: "ya_impresa" });
  });

  it("crear → confirmar «0971772» → crear = ya_impresa (no gasta una 2.ª hoja del talonario)", () => {
    const { alm } = conUno();
    const c = aplicarAccion(alm, "t1", { tipo: "confirmar", numeroHoja: "0971772" }, F2);
    if (!c.ok) throw new Error("no confirmó");
    const r = crearTrabajo(c.almacen, DATOS, F2, "t2");
    expect(r).toMatchObject({ ok: false, error: "ya_impresa", trabajo: { id: "t1", estado: "confirmada", numeroHoja: "0971772" } });
    expect(crearTrabajo(c.almacen, { ...DATOS, reimprimir: { motivo: "  " } }, F2, "t2")).toMatchObject({ ok: false, error: "ya_impresa" });
  });

  it("«Reimprimir en otra hoja» con motivo: trabajo nuevo con el motivo escrito; la confirmada queda", () => {
    const { alm } = conUno();
    const c = aplicarAccion(alm, "t1", { tipo: "confirmar", numeroHoja: "0971772" }, F2);
    if (!c.ok) throw new Error("no confirmó");
    const r = crearTrabajo(c.almacen, { ...DATOS, reimprimir: { motivo: " se mojó la hoja " } }, F2, "t2");
    if (!r.ok) throw new Error("no reimprimió");
    expect(r.trabajo).toMatchObject({ id: "t2", estado: "pendiente", reimpresion: "se mojó la hoja", reimpresionDe: "t1" });
    expect(r.almacen.trabajos.find((t) => t.id === "t1")?.estado).toBe("confirmada");
    /* La reimpresión pendiente se reenvía como cualquier pendiente; no pide otro motivo. */
    expect(crearTrabajo(r.almacen, DATOS, F2, "t3")).toMatchObject({ ok: true, reenviado: true, trabajo: { id: "t2" } });
  });

  it("reimprimir una impresa sin confirmar la anula con el motivo y deja un solo vivo", () => {
    const { alm } = conUno();
    const i = aplicarAccion(alm, "t1", { tipo: "impresa" }, F2);
    if (!i.ok) throw new Error("no marcó");
    const r = crearTrabajo(i.almacen, { ...DATOS, reimprimir: { motivo: "se trabó el papel" } }, F2, "t2");
    if (!r.ok) throw new Error("no reimprimió");
    expect(r.almacen.trabajos.find((t) => t.id === "t1")).toMatchObject({ estado: "anulado", observacion: "Reimpresa en otra hoja: se trabó el papel" });
    expect(r.almacen.trabajos.filter((t) => t.gtfId === "g1" && t.estado !== "anulado").map((t) => t.id)).toEqual(["t2"]);
    expect(impresaDeGuia(r.almacen.trabajos, "g1")).toBeUndefined();
  });

  it("sin nada impreso, «reimprimir» es un envío común (no deja motivo colgado)", () => {
    const r = crearTrabajo(VACIO, { ...DATOS, reimprimir: { motivo: "por si acaso" } }, F, "t1");
    expect(r.ok && r.trabajo).not.toHaveProperty("reimpresion");
  });

  it("anulada la anterior, se puede mandar de nuevo", () => {
    const { alm } = conUno();
    const anulada = aplicarAccion(alm, "t1", { tipo: "anular" }, F2);
    if (!anulada.ok) throw new Error("no anuló");
    const r = crearTrabajo(anulada.almacen, DATOS, F2, "t2");
    expect(r.ok && !r.reenviado && r.trabajo.id).toBe("t2");
  });
});

describe("estados", () => {
  it("pendiente → impresa → confirmada con la hoja correcta", () => {
    const { alm } = conUno();
    const a = aplicarAccion(alm, "t1", { tipo: "impresa" }, F2);
    if (!a.ok) throw new Error();
    expect(a.trabajo).toMatchObject({ estado: "impresa", impresaPor: "monte" });
    const b = aplicarAccion(a.almacen, "t1", { tipo: "confirmar", numeroHoja: "0971772" }, F2);
    expect(b.ok && b.trabajo).toMatchObject({ estado: "confirmada", numeroHoja: "0971772", revisadaPor: "monte" });
    expect(b.ok && b.trabajo.observacion).toBeUndefined();
  });

  it("otra hoja → observada con el motivo; corregida → confirmada y sin motivo", () => {
    const { alm } = conUno();
    const a = aplicarAccion(alm, "t1", { tipo: "confirmar", numeroHoja: "0971780" }, F2);
    if (!a.ok) throw new Error();
    expect(a.trabajo).toMatchObject({ estado: "observada", observacion: "La hoja dice 0971780, la guía es 0971772", impresaPor: "monte" });
    const b = aplicarAccion(a.almacen, "t1", { tipo: "confirmar", numeroHoja: "971772" }, F2);
    expect(b.ok && b.trabajo.estado).toBe("confirmada");
    expect(b.ok && "observacion" in b.trabajo).toBe(false);
  });

  it("la foto de una pendiente la da por impresa; en una impresa sólo se ata", () => {
    const { alm } = conUno();
    const a = aplicarAccion(alm, "t1", { tipo: "foto", fotoDocId: "d1" }, F2);
    expect(a.ok && a.trabajo).toMatchObject({ estado: "impresa", fotoDocId: "d1", impresaEn: F2.en });
    if (!a.ok) return;
    const b = aplicarAccion(a.almacen, "t1", { tipo: "foto", fotoDocId: "d2" }, F);
    expect(b.ok && b.trabajo).toMatchObject({ estado: "impresa", fotoDocId: "d2", impresaEn: F2.en });
  });

  it("lo cerrado no vuelve atrás", () => {
    const { alm } = conUno();
    const c = aplicarAccion(alm, "t1", { tipo: "confirmar", numeroHoja: "0971772" }, F2);
    if (!c.ok) throw new Error();
    expect(aplicarAccion(c.almacen, "t1", { tipo: "impresa" }, F2)).toMatchObject({ ok: false, error: "estado" });
    expect(aplicarAccion(c.almacen, "t1", { tipo: "confirmar", numeroHoja: "1" }, F2)).toMatchObject({ ok: false, error: "estado" });
    const x = aplicarAccion(c.almacen, "t1", { tipo: "anular", motivo: "mal" }, F2);
    if (!x.ok) throw new Error();
    expect(aplicarAccion(x.almacen, "t1", { tipo: "foto", fotoDocId: "d" }, F2)).toMatchObject({ ok: false, error: "estado" });
    expect(aplicarAccion(x.almacen, "nadie", { tipo: "impresa" }, F2)).toMatchObject({ ok: false, error: "no_existe" });
  });
});

describe("guía anulada o borrada después de mandarla", () => {
  it("sus envíos vivos pasan a anulado con el motivo; lo confirmado y otras guías no se tocan", () => {
    const { alm } = conUno();
    const otra = crearTrabajo(alm, { ...DATOS, gtfId: "g2", numeroGuia: "025-001-0971773" }, F, "t2");
    if (!otra.ok) throw new Error();
    const conf = aplicarAccion(otra.almacen, "t2", { tipo: "confirmar", numeroHoja: "0971773" }, F2);
    if (!conf.ok) throw new Error();
    const r = cerrarPorGuiaCaida(conf.almacen, new Map([["g1", "La guía se anuló"], ["g2", "La guía se anuló"]]), F2);
    expect(r.cambiados).toBe(1);
    expect(r.almacen.trabajos.find((t) => t.id === "t1")).toMatchObject({ estado: "anulado", observacion: "La guía se anuló", revisadaPor: "monte" });
    expect(r.almacen.trabajos.find((t) => t.id === "t2")?.estado).toBe("confirmada");
    expect(cerrarPorGuiaCaida(conf.almacen, new Map(), F2).almacen).toBe(conf.almacen);
  });
});

describe("lo que muestra la fila de la oficina", () => {
  it("el vivo gana al terminado; los anulados no se muestran", () => {
    const base = { numeroGuia: "1", titular: "", hojas: ["guia" as const], perfilId: "monte", creadoPor: "x" };
    const m = trabajoDeLaFila([
      { ...base, id: "a", gtfId: "g1", estado: "confirmada", creadoEn: "2026-10-16T10:00:00Z" },
      { ...base, id: "b", gtfId: "g1", estado: "observada", creadoEn: "2026-10-15T10:00:00Z" },
      { ...base, id: "c", gtfId: "g2", estado: "anulado", creadoEn: "2026-10-16T10:00:00Z" },
    ]);
    expect(m.get("g1")?.id).toBe("b");
    expect(m.has("g2")).toBe(false);
  });
});

describe("podar y leer lo guardado", () => {
  it("al pasar el tope se van los terminados más viejos, nunca un vivo", () => {
    const t = (id: string, estado: TrabajoCola["estado"], creadoEn: string): TrabajoCola => ({
      id, gtfId: id, numeroGuia: id, titular: "", hojas: ["guia"], perfilId: "monte", estado, creadoEn, creadoPor: "x",
    });
    const alm: AlmacenCola = {
      contacto: null,
      trabajos: [t("v1", "pendiente", "2026-01-01"), t("c1", "confirmada", "2026-01-02"), t("c2", "confirmada", "2026-01-03"), t("v2", "observada", "2026-01-01")],
    };
    expect(podar(alm, 3).trabajos.map((x) => x.id)).toEqual(["v1", "c2", "v2"]);
  });

  it("descarta trabajos rotos sin tumbar la cola", () => {
    const alm = normalizarAlmacen({
      contacto: { numero: "51987654321" },
      trabajos: [null, { id: "x" }, { id: "t", gtfId: "g", numeroGuia: "1", estado: "pendiente", hojas: ["guia", "guia", "otra"] }, { id: "y", gtfId: "g", numeroGuia: "1", estado: "rara" }],
    });
    expect(alm.contacto?.numero).toBe("51987654321");
    expect(alm.trabajos.map((t) => [t.id, t.hojas])).toEqual([["t", ["guia"]]]);
    expect(normalizarAlmacen("basura")).toEqual(VACIO);
  });
});

describe("WhatsApp y enlaces", () => {
  it("celular peruano de 9 dígitos gana el 51; lo demás con código o nada", () => {
    expect(normalizarCelular("987 654 321")).toBe("51987654321");
    expect(normalizarCelular("+51 987-654-321")).toBe("51987654321");
    expect(normalizarCelular("12345")).toBeNull();
  });

  it("el mensaje dice la guía, la hoja y el enlace a la cola (con sesión, sin PDF público)", () => {
    const enlace = enlaceCola("https://buleje.test/", "t 1");
    expect(enlace).toBe("https://buleje.test/admin?tab=loth-libro-operaciones&vista=monte&trabajo=t%201");
    const m = mensajeAlMonte("025-001-0971772", enlace);
    expect(m).toBe(`Guía 025-001-0971772 — imprimir en la hoja N° 0971772 · ábrela aquí: ${enlace}`);
    expect(mensajeAlMonte("025-001-0971772", enlace, "se mojó")).toBe(`Guía 025-001-0971772 — reimprimir en otra hoja (se mojó) · ábrela aquí: ${enlace}`);
    expect(enlaceWhatsApp("51987654321", m)).toBe(`https://wa.me/51987654321?text=${encodeURIComponent(m)}`);
    expect(enlaceWhatsApp(null, "x")).toBe("https://wa.me/?text=x");
  });

  it("la ruta de salida respeta el contrato del carril salida", () => {
    expect(rutaSalida({ gtfId: "g1", formato: "escp", perfilId: "monte", hoja: "lista" })).toBe(
      "/api/admin/forestal/loth/gtf-matricial/salida?gtfId=g1&formato=escp&perfil=monte&hoja=lista",
    );
  });
});
