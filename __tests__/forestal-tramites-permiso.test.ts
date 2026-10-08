/**
 * Relación de guías (Brandon 08-10): el permiso manda, un oficio por permiso,
 * lista de trozas = sólo su N°, totales por especie y el papel en blanco y
 * negro con lo vacío resaltado sólo en pantalla. Los casos salen de lo medido:
 * Blas tiene 2 de 6 permisos con titular «(por confirmar)» y 0 con RUC; su GTF
 * 019-001-0000001 lleva 22 trozas de TORNILLO (20,303 m³) sin N° de lista.
 */
import { describe, expect, it } from "vitest";
import { datosDesdeGuias, filasNuevas, sumarFilas, type GuiaParaFormato } from "@/lib/forestal/tramites-desde-guias";
import {
  avisoDeTraerGuias,
  clavePermisoOficio,
  datosDelPermiso,
  esElMismoPermiso,
  faltasDelPermiso,
  filasDeOtroPermiso,
  permisoPorDefecto,
  permisosDeLasGuias,
  repartirPorPermiso,
  titularPorConfirmar,
  type PermisoDelOficio,
} from "@/lib/forestal/tramites-permiso";
import { listaDeTrozas, nuevaFilaGuia, parseGuiasInforme, totalesPorEspecie } from "@/lib/forestal/tramites-relacion-guias";
import { detalleTrozasHtml, resumenNumeradoHtml, tablaGuiasHtml } from "@/lib/forestal/tramites-relacion-papel";
import { buildTramiteHtml, TRAMITE_PREVIEW_CSS } from "@/lib/forestal/tramites-print";
import { formatoPorId } from "@/lib/forestal/tramites-catalogo";

const PERMISO_A = "19-SEC/REG-PLT-2025-096";
const PERMISO_B = "10-HUA-PUE/PER-FMP-2026-007";

function guia(over: Partial<GuiaParaFormato> & { id: string; gtfNumber: string }): GuiaParaFormato {
  return {
    gtfDate: "2026-09-02",
    tipo: "trozas",
    status: "emitida",
    annulledReason: null,
    updatedAt: "2026-09-02T15:00:00.000Z",
    tituloHabilitante: PERMISO_A,
    titularName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
    destino: "Aserradero Blas",
    placaVehiculo: null,
    conductor: null,
    volumenTotalM3: 1.43,
    piezasTotal: 2,
    items: [
      { code: "1", species: "TORNILLO", lengthM: 3.1, volumeM3: 0.71 },
      { code: "2", species: "TORNILLO", lengthM: 3, volumeM3: 0.72 },
    ],
    ...over,
  };
}

const RELACION = "relacion-guias-serfor";

describe("el código del permiso, normalizado", () => {
  it("mismo permiso escrito distinto; nunca por el nombre del titular", () => {
    expect(esElMismoPermiso("19-SEC/REG-PLT-2025-096", "19 sec reg plt 2025 96")).toBe(true);
    expect(esElMismoPermiso(PERMISO_A, PERMISO_B)).toBe(false);
    expect(esElMismoPermiso("", "")).toBe(false);
    expect(clavePermisoOficio("  ")).toBeNull();
  });

  it("agrupa por permiso; las líneas del CTP de una misma guía cuentan una vez; el de más guías primero", () => {
    const grupos = permisosDeLasGuias([
      { gtfNumber: "019-001-0000001", status: "emitida", tituloHabilitante: PERMISO_A },
      { gtfNumber: "001-0000150", status: "emitida", tituloHabilitante: PERMISO_B },
      { gtfNumber: "001-0000150", status: "emitida", tituloHabilitante: PERMISO_B },
      { gtfNumber: "001-0000151", status: "emitida", tituloHabilitante: "10 hua pue per fmp 2026 7" },
      { gtfNumber: "019-0000009", status: "emitida", tituloHabilitante: null },
    ]);
    expect(grupos).toEqual([
      { clave: clavePermisoOficio(PERMISO_B), codigo: PERMISO_B, guias: 2 },
      { clave: clavePermisoOficio(PERMISO_A), codigo: PERMISO_A, guias: 1 },
    ]);
  });

  it("propone el permiso del chip si está entre las guías; si no, el de más guías", () => {
    const grupos = permisosDeLasGuias([
      { gtfNumber: "1-1", status: "emitida", tituloHabilitante: PERMISO_A },
      { gtfNumber: "1-2", status: "emitida", tituloHabilitante: PERMISO_B },
      { gtfNumber: "1-3", status: "emitida", tituloHabilitante: PERMISO_B },
    ]);
    expect(permisoPorDefecto(grupos, "19 SEC REG PLT 2025 096")).toBe(PERMISO_A);
    expect(permisoPorDefecto(grupos, "OTRO-1")).toBe(PERMISO_B);
    expect(permisoPorDefecto([], PERMISO_A)).toBeNull();
  });
});

describe("el permiso manda en la relación", () => {
  const delA = guia({ id: "a", gtfNumber: "019-001-0000001", titularName: "CCNN SAN LUIS DE CHINCHIGUANI" });
  const delA2 = guia({ id: "a2", gtfNumber: "019-001-0000002", gtfDate: "2026-09-04" });
  const delB = guia({ id: "b", gtfNumber: "010-001-0000007", tituloHabilitante: PERMISO_B, titularName: "SANTOS MUÑOZ JOSE HORD" });

  it("la de otro permiso queda fuera, con aviso; los nombres distintos del mismo titular NO separan", () => {
    const r = datosDesdeGuias(RELACION, [delA, delA2, delB], { permiso: PERMISO_A })!;
    expect(parseGuiasInforme(r.datos.guiasJson).map((f) => f.numero)).toEqual(["019-001-0000001", "019-001-0000002"]);
    expect(r.fueraDePermiso).toEqual(["010-001-0000007"]);
    expect(r.avisos.join(" ")).toMatch(/010-001-0000007 es de otro permiso .*queda fuera/);
    expect(r.datos.permisoCodigo).toBe(PERMISO_A);
    expect(r.permisos?.map((p) => p.codigo)).toEqual([PERMISO_A, PERMISO_B]);
    /* Con permiso, dos formas de escribir al mismo titular no son «2 titulares distintos». */
    expect(r.avisos.join(" ")).not.toMatch(/titulares distintos/);
    expect(r.datos.entidadNombre).toBe("CCNN SAN LUIS DE CHINCHIGUANI");
  });

  it("titular de las guías ≠ Ficha: el RUC y el representante de la Ficha no quedan bajo otro nombre", () => {
    const r = datosDesdeGuias(RELACION, [delA2], { permiso: PERMISO_A, razonSocialFicha: "Maderera San Martín SAC" })!;
    expect(r.datos).toMatchObject({ entidadNombre: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", entidadRuc: "", entidadRepresentante: "" });
    expect(r.avisos.join(" ")).toMatch(/revisa RUC y representante/);
  });

  it("«Incluirlas igual» las mete y pide confirmar; el oficio de B sólo trae las suyas", () => {
    const igual = datosDesdeGuias(RELACION, [delA, delB], { permiso: PERMISO_A, incluirOtrosPermisos: true })!;
    expect(parseGuiasInforme(igual.datos.guiasJson)).toHaveLength(2);
    expect(igual.fueraDePermiso).toEqual([]);
    expect(igual.avisos.join(" ")).toMatch(/Incluiste 010-001-0000007/);
    const deB = datosDesdeGuias(RELACION, [delA, delB], { permiso: PERMISO_B })!;
    expect(parseGuiasInforme(deB.datos.guiasJson).map((f) => f.numero)).toEqual(["010-001-0000007"]);
    expect(deB.datos.entidadNombre).toBe("SANTOS MUÑOZ JOSE HORD");
  });

  it("una guía sin permiso se queda en el oficio, con aviso", () => {
    const r = datosDesdeGuias(RELACION, [delA, guia({ id: "s", gtfNumber: "019-0000009", tituloHabilitante: null })], { permiso: PERMISO_A })!;
    expect(parseGuiasInforme(r.datos.guiasJson)).toHaveLength(2);
    expect(r.avisos.join(" ")).toMatch(/019-0000009 no dice su permiso/);
  });

  it("las filas que ya están en la tabla y dicen otro permiso se marcan", () => {
    const filas = [nuevaFilaGuia("1", { numero: "1", permiso: PERMISO_A }), nuevaFilaGuia("2", { numero: "2", permiso: PERMISO_B }), nuevaFilaGuia("3", { numero: "3" })];
    expect(filasDeOtroPermiso(filas, "19 sec reg plt 2025 96").map((f) => f.uid)).toEqual(["2"]);
    expect(filasDeOtroPermiso(filas, "")).toEqual([]);
  });

  it("«Incluirla igual» suma sólo las filas nuevas, sin pisar lo tipeado", () => {
    const antes = datosDesdeGuias(RELACION, [delA, delB], { permiso: PERMISO_A })!;
    const despues = datosDesdeGuias(RELACION, [delA, delB], { permiso: PERMISO_A, incluirOtrosPermisos: true })!;
    const [f1] = parseGuiasInforme(antes.datos.guiasJson);
    const tipeado = JSON.stringify([{ ...f1, destinatario: "Corregido a mano" }]);
    const filas = parseGuiasInforme(sumarFilas(tipeado, filasNuevas(antes.datos.guiasJson, despues.datos.guiasJson)));
    expect(filas.map((f) => f.numero)).toEqual(["019-001-0000001", "010-001-0000007"]);
    expect(filas[0].destinatario).toBe("Corregido a mano");
    /* Sumar dos veces lo mismo no duplica. */
    expect(parseGuiasInforme(sumarFilas(JSON.stringify(filas), JSON.stringify(filas)))).toHaveLength(2);
  });
});

describe("titular, RUC y representante salen del permiso", () => {
  const ficha = { razonSocial: "Inversiones Agroforestales Blas S.A.", ruc: "20600000001", representante: "Blas Gerente" };
  const porConfirmar: PermisoDelOficio = { id: "c1", codigo: "19-SEC/REG-PLT-2026-033", titularNombre: "(por confirmar)", titularDoc: null, titularDocTipo: null };

  it("Blas: titular por confirmar y sin RUC → no se inventan; el RUC y el nombre de la Ficha se vacían", () => {
    expect(titularPorConfirmar("(titular por confirmar)")).toBe(true);
    const d = datosDelPermiso(porConfirmar, null, ficha, { entidadNombre: ficha.razonSocial, entidadRuc: ficha.ruc });
    expect(d).toMatchObject({ permisoContratoId: "c1", permisoCodigo: "19-SEC/REG-PLT-2026-033", entidadNombre: "", entidadRuc: "", entidadRepresentante: "" });
    expect(faltasDelPermiso(porConfirmar, null, ficha)).toEqual(["titular", "ruc"]);
  });

  it("main: RUC del permiso, representante de la ficha del Directorio", () => {
    const p: PermisoDelOficio = { id: "c2", codigo: "19-SEC/PER-FMC-2024-008", titularNombre: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", titularDoc: "20605859438", titularDocTipo: "RUC" };
    const d = datosDelPermiso(p, { docTipo: "RUC", docNumero: "20605859438", representante: "Jefe Comunal" }, ficha, {});
    expect(d).toMatchObject({ entidadNombre: p.titularNombre, entidadRuc: "20605859438", entidadRepresentante: "Jefe Comunal" });
    expect(faltasDelPermiso(p, null, ficha)).toEqual([]);
  });

  it("un DNI no es RUC; si el titular ES el CTP, la Ficha completa RUC y representante", () => {
    const natural: PermisoDelOficio = { id: "c3", codigo: "X-1", titularNombre: "QUINCHUNLLA PEREZ, NELLY", titularDoc: "41234567", titularDocTipo: "DNI" };
    expect(datosDelPermiso(natural, null, ficha, {}).entidadRuc).toBe("");
    const propio: PermisoDelOficio = { id: "c4", codigo: "X-2", titularNombre: "INVERSIONES AGROFORESTALES BLAS S.A.", titularDoc: null, titularDocTipo: null };
    expect(datosDelPermiso(propio, null, ficha, {})).toMatchObject({ entidadRuc: "20600000001", entidadRepresentante: "Blas Gerente" });
  });
});

describe("lista de trozas = sólo su N° y totales por especie", () => {
  const blas = guia({
    id: "x",
    gtfNumber: "019-001-0000001",
    volumenTotalM3: 20.303,
    piezasTotal: 22,
    items: Array.from({ length: 22 }, (_, i) => ({ code: String(i + 1), species: "TORNILLO", volumeM3: 0.9 })),
  });

  it("Blas 019-001-0000001 sin N° de lista: va el N° de la GTF, marcado sólo en pantalla", () => {
    const r = datosDesdeGuias(RELACION, [blas], { permiso: PERMISO_A })!;
    const filas = parseGuiasInforme(r.datos.guiasJson);
    expect(listaDeTrozas(filas[0])).toEqual({ nro: "019-001-0000001", derivada: true });
    expect(r.avisos.join(" ")).toMatch(/no trae el N° de su lista de trozas/);
    const pantalla = resumenNumeradoHtml(filas, { marcar: true });
    expect(pantalla).toContain("Lista de trozas: N° <span class=\"revisar\"");
    const papel = resumenNumeradoHtml(filas);
    expect(papel).toContain("GTF N° 019-001-0000001 · Lista de trozas: N° 019-001-0000001");
    expect(papel).not.toContain("revisar");
    /* Ningún código de troza en la carta: sólo el N°. */
    expect(papel).not.toMatch(/\b22 ·/);
  });

  it("con N° de lista en la guía, ése; una guía del CTP de madera aserrada no lleva lista", () => {
    const conLista = parseGuiasInforme(datosDesdeGuias(RELACION, [{ ...blas, listaTrozasNro: "000006" }])!.datos.guiasJson);
    expect(listaDeTrozas(conLista[0])).toEqual({ nro: "000006", derivada: false });
    expect(listaDeTrozas(nuevaFilaGuia("c", { numero: "001-0000150", origen: "ctp", producto: "Madera aserrada" }))).toBeNull();
  });

  it("totales: 22 trozas TORNILLO 20.303 m³; una guía de dos especies suma su desglose; las anuladas no cuentan", () => {
    const mixta = guia({
      id: "m",
      gtfNumber: "019-001-0000002",
      volumenTotalM3: 1.5,
      items: [
        { code: "1", species: "TORNILLO", volumeM3: 0.5 },
        { code: "2", species: "Cumala", volumeM3: 0.4 },
        { code: "3", species: "Cumala", volumeM3: 0.6 },
      ],
    });
    const anulada = guia({ id: "n", gtfNumber: "019-001-0000003", status: "anulada", annulledReason: "Error" });
    const filas = parseGuiasInforme(datosDesdeGuias(RELACION, [blas, mixta, anulada])!.datos.guiasJson);
    expect(filas[1].porEspecie).toHaveLength(2);
    const t = totalesPorEspecie(filas);
    expect(t.guias).toBe(2);
    expect(t.especies).toEqual([
      { especie: "Cumala", trozas: 2, m3: 1 },
      { especie: "TORNILLO", trozas: 23, m3: 20.803 },
    ]);
    expect(t).toMatchObject({ trozas: 25, m3: 21.803 });
    const anexo = tablaGuiasHtml(filas);
    expect(anexo).toContain("<th>Lista de trozas N°</th>");
    expect(anexo).toContain("Totales por especie");
    expect(anexo).toContain("Total · 2 guías</td><td class=\"num\">25</td><td class=\"num\">21.803</td>");
    expect(anexo).toMatch(/Anexo 2 · Guías anuladas[\s\S]*ANULADA/);
  });

  it("la hoja aparte con cada troza sólo si se pide «con detalle de trozas»", () => {
    const f = formatoPorId(RELACION)!;
    const guiasJson = datosDesdeGuias(RELACION, [blas])!.datos.guiasJson;
    expect(buildTramiteHtml({ formato: f, datos: { guiasJson }, ficha: null })).not.toContain("Detalle de trozas");
    const conDetalle = buildTramiteHtml({ formato: f, datos: { guiasJson, conDetalleTrozas: "si" }, ficha: null });
    expect(conDetalle).toContain("hoja-aparte");
    expect(detalleTrozasHtml(parseGuiasInforme(guiasJson))).toContain("1 · TORNILLO");
  });
});

describe("el papel: blanco y negro, lo vacío resaltado sólo en pantalla", () => {
  const f = formatoPorId(RELACION)!;

  it("el CSS del trámite apaga el verde de los reportes CTP y no pinta nada al imprimir", () => {
    const propio = TRAMITE_PREVIEW_CSS.slice(TRAMITE_PREVIEW_CSS.indexOf(".membrete"));
    expect(propio).not.toMatch(/#0f5132|#eaf3ee|#b91c1c/i);
    expect(TRAMITE_PREVIEW_CSS).toContain("h2::before{display:none}");
    expect(TRAMITE_PREVIEW_CSS).toContain(".campo-vacio,.campo-falta,.revisar{background:none!important}");
  });

  it("en pantalla, el obligatorio vacío del cuerpo sale con su nombre y resaltado; en el papel, no", () => {
    const pantalla = buildTramiteHtml({ formato: f, datos: { entidadNombre: "CCNN Chivis" }, ficha: null, editable: true });
    expect(pantalla).toContain(`<span class="campo-falta">Jefe / representante legal</span>`);
    expect(pantalla).not.toContain("\uE000");
    const papel = buildTramiteHtml({ formato: f, datos: { entidadNombre: "CCNN Chivis" }, ficha: null });
    expect(papel).not.toContain("campo-falta");
    expect(papel).toContain("en mi calidad de representante legal de CCNN Chivis");
  });

  it("el cuerpo nombra el permiso del oficio", () => {
    const html = buildTramiteHtml({ formato: f, datos: { permisoCodigo: PERMISO_A }, ficha: null });
    expect(html).toContain(`al amparo del permiso ${PERMISO_A}`);
  });
});

describe("«Traer de los libros»: una guía sin detalle no es «de otro permiso»", () => {
  const lista = [{ despachoId: "d1" }, { despachoId: "d2" }, { despachoId: "d3" }];
  const idDe = (g: { despachoId: string }) => g.despachoId;

  it("se cayó el pedido del detalle: las 3 quedan sin leer, ninguna fuera; el aviso pide reintentar", () => {
    const r = repartirPorPermiso(lista, new Map<string, { tituloHabilitante: string | null }>(), idDe, clavePermisoOficio(PERMISO_A));
    expect(r).toEqual({ delPermiso: [], fuera: 0, sinLeer: 3 });
    const aviso = avisoDeTraerGuias({ traidas: 0, avisos: [], fuera: r.fuera, sinLeer: r.sinLeer, permisoCodigo: PERMISO_A });
    expect(aviso).toBe("No se pudo leer el permiso de 3 guías del Libro CTP (no se trajeron); reintenta.");
    expect(aviso).not.toMatch(/otro permiso|no tiene guías nuevas/);
  });

  it("una tanda leída y otra no: la de otro permiso cuenta fuera, la no leída aparte", () => {
    const detalle = new Map([
      ["d1", { tituloHabilitante: "19-sec/reg-plt-2025-096" }],
      ["d2", { tituloHabilitante: PERMISO_B }],
    ]);
    const r = repartirPorPermiso(lista, detalle, idDe, clavePermisoOficio(PERMISO_A));
    expect(r.delPermiso.map((x) => x.guia.despachoId)).toEqual(["d1"]);
    expect([r.fuera, r.sinLeer]).toEqual([1, 1]);
    expect(avisoDeTraerGuias({ traidas: 1, avisos: ["Libro TH: error 500"], fuera: r.fuera, sinLeer: r.sinLeer, permisoCodigo: PERMISO_A })).toBe(
      `Se trajeron 1. Libro TH: error 500. 1 guía de otro permiso (o sin permiso) no se trajo: este oficio es del ${PERMISO_A}. No se pudo leer el permiso de 1 guía del Libro CTP (no se trajo); reintenta.`,
    );
  });

  it("sin permiso elegido tampoco se trae a medias; todo leído y nada fuera = sin aviso", () => {
    expect(repartirPorPermiso(lista, new Map([["d1", { tituloHabilitante: null }]]), idDe, null)).toMatchObject({ fuera: 0, sinLeer: 2 });
    expect(avisoDeTraerGuias({ traidas: 3, avisos: [], fuera: 0, sinLeer: 0 })).toBeNull();
    expect(avisoDeTraerGuias({ traidas: 0, avisos: [], fuera: 0, sinLeer: 0 })).toBe("Ningún libro tiene guías nuevas en ese período.");
  });
});
