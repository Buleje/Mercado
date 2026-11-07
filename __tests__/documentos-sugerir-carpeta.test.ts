import { describe, it, expect } from "vitest";
import {
  esCarpetaGenerica, estaSinOrdenar, prepararCarpetas, sugerirCarpeta,
  type CarpetaPorProponer, type PapelLeido, type PapelPorArchivar,
} from "@/lib/documentos/sugerir-carpeta";

/** Un Archivo como el de Blas (24-10): comunidades con sus subcarpetas, guías y carpetas de paso. */
const CARPETAS: CarpetaPorProponer[] = [
  { id: "chivis", name: "CCNN SANTA ROSA DE CHIVIS", parentId: null },
  { id: "plt", name: "19-SEC REF-PLT-2021-017 - PARA ALEX", parentId: "chivis" },
  { id: "chinchi", name: "Comunidad Nativa San Luis de Chinchihuani", parentId: null },
  { id: "titulos", name: "Títulos de propiedad", parentId: "chinchi" },
  { id: "jefe", name: "Jefe - representante (DNI, actas, poderes)", parentId: "chinchi" },
  { id: "gtf", name: "Guías forestales (GTF)", parentId: null },
  { id: "gtf019", name: "GTF 019-0000003", parentId: "gtf" },
  { id: "sin-permiso", name: "Sin permiso", parentId: "gtf" },
  { id: "otros", name: "Otros", parentId: null },
  { id: "wsp", name: "Llegó por WhatsApp", parentId: null },
  { id: "wsp-dia", name: "2026-10-22", parentId: "wsp" },
  { id: "camaras", name: "Cámaras", parentId: null },
  { id: "puerta", name: "Puerta del aserradero", parentId: "camaras" },
  { id: "pagos", name: "Pagos de Juan Pérez", parentId: null },
  { id: "semana", name: "2026-10-12 a 2026-10-18", parentId: "pagos" },
];

/** RUC del propio negocio: sale en papeles de 3 familias distintas → no distingue a nadie. */
const RUC_PROPIO = "20393939391";
const PAPELES: PapelLeido[] = [
  {
    id: "p1", name: "Contrato Chivis.pdf", folderId: "chivis",
    texto: `CONTRATO entre la COMUNIDAD NATIVA SANTA ROSA DE CHIVIS con RUC 20156698963 y la empresa con RUC ${RUC_PROPIO}`,
  },
  { id: "p2", name: "Acta Chinchihuani.pdf", folderId: "chinchi", texto: `Acta de asamblea comunal. Empresa RUC ${RUC_PROPIO}` },
  { id: "p3", name: "GTF 019-0000003.pdf", folderId: "gtf019", texto: `GUIA DE TRANSPORTE FORESTAL 019-0000003 titular RUC ${RUC_PROPIO}` },
];

const indice = prepararCarpetas(CARPETAS, PAPELES);
const papel = (name: string, texto: string, extra: Partial<PapelPorArchivar> = {}): PapelPorArchivar =>
  ({ id: "nuevo", name, texto, folderId: null, ...extra });
const propuesta = (name: string, texto: string, extra?: Partial<PapelPorArchivar>) => sugerirCarpeta(papel(name, texto, extra), indice);

describe("sugerirCarpeta", () => {
  it("lee el nombre de la comunidad y su RUC en una foto sin nombre", () => {
    const [c] = propuesta("IMG_20261024_101500.jpg", "La COMUNIDAD NATIVA SANTA ROSA DE CHIVIS, identificada con RUC N° 20156698963, representada por su jefe");
    expect(c.folderId).toBe("chivis");
    expect(c.motivos).toContain("dice «Santa Rosa de Chivis»");
    expect(c.motivos).toContain("mismo RUC 20156698963");
  });

  it("entiende CC.NN. igual que Comunidad Nativa y CCNN", () => {
    const [c] = propuesta("solicitud.pdf", "Señores de la CC.NN. Santa Rosa de Chivis, por medio de la presente");
    expect(c.folderId).toBe("chivis");
  });

  it("con sólo el RUC también propone la carpeta donde ya están sus papeles", () => {
    const [c] = propuesta("escaneo 3.pdf", "Recibí de RUC 20156698963 la suma de S/ 1.200");
    expect(c.folderId).toBe("chivis");
    expect(c.motivos).toContain("mismo RUC 20156698963");
  });

  it("no usa el RUC del propio negocio: sale en papeles de todas las carpetas", () => {
    expect(propuesta("factura.pdf", `Emisor RUC ${RUC_PROPIO} — venta de madera`).find((c) => c.motivos.some((m) => m.includes(RUC_PROPIO)))).toBeUndefined();
  });

  it("Shinshiguani y Chinchiguani son la misma comunidad que Chinchihuani; el DNI va a la subcarpeta del jefe", () => {
    const [c] = propuesta("DNI JEFE SHINSHIGUANI.pdf", "REPUBLICA DEL PERU DOCUMENTO NACIONAL DE IDENTIDAD I<PER45781236<<<");
    expect(c.folderId).toBe("jefe");
    expect(c.motivos.some((m) => m.startsWith("está dentro de"))).toBe(true);
  });

  it("el título de propiedad de la comunidad va a su carpeta de títulos, no a la comunidad suelta", () => {
    const [c, d] = propuesta("Titulo de chinchiguani.pdf", "TITULO DE PROPIEDAD N% 03483 otorgado a la Comunidad Nativa San Luis de Chinchiguani");
    expect(c.folderId).toBe("titulos");
    expect(d?.folderId).toBe("chinchi");
  });

  it("el código del expediente en el texto lleva a su subcarpeta", () => {
    const [c] = propuesta("oficio.pdf", "Ref.: Expediente PLT-2021-017 — se remite lo solicitado");
    expect(c.folderId).toBe("plt");
    expect(c.motivos).toContain("dice «PLT-2021-017»");
  });

  it("una guía de OTRA numeración va a la carpeta general de guías, no a la de otra guía", () => {
    const [c, ...resto] = propuesta("GTF 019-0000051.pdf", "GUIA DE TRANSPORTE FORESTAL N° 019-0000051");
    expect(c.folderId).toBe("gtf");
    expect(resto.map((x) => x.folderId)).not.toContain("gtf019");
  });

  it("entre dos iguales gana la carpeta esencial", () => {
    const dos = prepararCarpetas([
      { id: "a", name: "Maderera Ucayali", parentId: null },
      { id: "b", name: "Maderera Ucayali", parentId: null, tags: ["marca:esencial"] },
    ]);
    const [c] = sugerirCarpeta(papel("cotizacion.pdf", "Cotización de MADERERA UCAYALI para tablas"), dos);
    expect(c.folderId).toBe("b");
    expect(c.esencial).toBe(true);
  });

  it("nombra al tercero ligado a la carpeta y su RUC aunque la carpeta se llame distinto", () => {
    const conTercero = prepararCarpetas([
      { id: "prov", name: "Proveedor de combustible", parentId: null, terceros: [{ nombre: "Grifo El Petrolero EIRL", detalle: "RUC 20481234567" }] },
    ]);
    const [c] = sugerirCarpeta(papel("boleta.jpg", "GRIFO EL PETROLERO E.I.R.L. RUC 20481234567 Diesel B5"), conTercero);
    expect(c.folderId).toBe("prov");
    expect(c.motivos).toContain("mismo RUC 20481234567");
  });

  it("nunca propone carpetas de paso, de fecha, de cámaras ni la carpeta donde ya está", () => {
    const ids = propuesta("Otros 2026-10-22 Puerta del aserradero.jpg", "Otros. Llegó por WhatsApp. Puerta del aserradero. Cámaras", { folderId: "chivis" })
      .map((c) => c.folderId);
    for (const no of ["otros", "wsp", "wsp-dia", "camaras", "puerta", "semana", "chivis"]) expect(ids).not.toContain(no);
  });

  it("una palabra común sola no alcanza, y «Sin permiso» no es la carpeta de los permisos", () => {
    expect(propuesta("permiso.pdf", "Resolución que otorga el permiso forestal")).toEqual([]);
  });

  it("sin nada en común no propone nada", () => {
    expect(propuesta("foto.jpg", "lista de compras: arroz, azúcar, aceite")).toEqual([]);
  });
});

describe("carpetas de paso", () => {
  const porId = new Map(CARPETAS.map((c) => [c.id, c]));

  it("nombres genéricos y de fecha", () => {
    expect(esCarpetaGenerica("Otros")).toBe(true);
    expect(esCarpetaGenerica("Llegó por WhatsApp")).toBe(true);
    expect(esCarpetaGenerica("2026-10-12 a 2026-10-18")).toBe(true);
    expect(esCarpetaGenerica("CCNN Santa Rosa de Chivis")).toBe(false);
  });

  it("sin ordenar: la raíz, lo de paso y la fecha dentro de lo de paso; no la fecha dentro de una carpeta de verdad", () => {
    expect(estaSinOrdenar(null, porId)).toBe(true);
    expect(estaSinOrdenar("otros", porId)).toBe(true);
    expect(estaSinOrdenar("wsp-dia", porId)).toBe(true);
    expect(estaSinOrdenar("semana", porId)).toBe(false);
    expect(estaSinOrdenar("chivis", porId)).toBe(false);
  });
});
