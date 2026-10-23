import { describe, expect, it } from "vitest";
import {
  aTipoOracion,
  esNombreSinSentido,
  limpiarNombre,
  motivoBasura,
  nombreLibre,
  planOrdenar,
  type CarpetaParaOrdenar,
  type PapelParaOrdenar,
} from "@/lib/documentos/ordenar-archivo";
import { enTandas } from "@/components/admin/documentos/ordenar/use-ordenar-archivo";

const AHORA = new Date("2026-10-22T15:00:00Z");
const VIEJA = "2026-09-01T10:00:00Z";

const papel = (p: Partial<PapelParaOrdenar> & { id: string; name: string }): PapelParaOrdenar => ({
  size: 2048, folderId: null, uploadedAt: VIEJA, tocable: true, movible: true, ...p,
});
const carpeta = (c: Partial<CarpetaParaOrdenar> & { id: string; name: string }): CarpetaParaOrdenar => ({
  parentId: null, documentos: 0, subcarpetas: 0, creadaEn: VIEJA, visible: true, borrable: true, ...c,
});

describe("limpiarNombre", () => {
  it("quita la ruta pegada de una subida de carpeta vieja", () => {
    expect(limpiarNombre("CCNN SANTA ROSA DE CHIVIS/Solicitud Presentacion de GTF 6 y LT 12 y Anulacion de LT 11.docx")?.nombre)
      .toBe("Solicitud Presentacion de GTF 6 y LT 12 y Anulacion de LT 11.docx");
    expect(limpiarNombre("CCNN SANTA ROSA DE CHIVIS/19-SEC REF-PLT-2021-017 - PARA ALEX/GTF 3 CHIVIS.pdf")?.nombre)
      .toBe("GTF 3 CHIVIS.pdf");
  });

  it("guiones bajos, siglas y espacios", () => {
    expect(limpiarNombre("CCNN SANTA ROSA DE CHIVIS/denuncia_extravio_gtf_santa_rosa_chivis.docx")?.nombre)
      .toBe("Denuncia extravio GTF santa rosa chivis.docx");
    expect(limpiarNombre("feo_nombre__.pdf")?.nombre).toBe("Feo nombre.pdf");
    expect(limpiarNombre("Contrato   alquiler .pdf")?.nombre).toBe("Contrato alquiler.pdf");
  });

  it("MAYÚSCULAS sostenidas → tipo oración, con siglas", () => {
    expect(limpiarNombre("CARTA DE EMSION GUIA SERFOR GTF 1-2-3-4.docx")?.nombre)
      .toBe("Carta de emsion guia SERFOR GTF 1-2-3-4.docx");
    // Dos letras que no son palabra quedan como sigla; «YA», «DE» sí bajan.
    expect(limpiarNombre("CONTRATO DE ALQUILER DEL LOCAL QA.pdf")?.nombre).toBe("Contrato de alquiler del local QA.pdf");
    expect(limpiarNombre("YA SE PAGO LA CUOTA DE MARZO.pdf")?.nombre).toBe("Ya se pago la cuota de marzo.pdf");
    // Dos palabras en mayúscula suelen ser un nombre propio: no se toca.
    expect(limpiarNombre("GTF 2 CHIVIS ANULADA.pdf")).toBeNull();
    expect(limpiarNombre("DNI JEFE SHINSHIGUANI D.pdf")).toBeNull();
  });

  it("extensión repetida y en mayúscula", () => {
    expect(limpiarNombre("Factura 123.pdf.pdf")?.nombre).toBe("Factura 123.pdf");
    expect(limpiarNombre("Factura 123.PDF")?.nombre).toBe("Factura 123.pdf");
  });

  it("deja en paz lo que ya está bien", () => {
    for (const n of ["Titulo de chinchiguani.pdf", "GTF 19-00000-000002.pdf", "Lista de trozas 5, 6.pdf", "Registro de Plantacion.pdf"]) {
      expect(limpiarNombre(n)).toBeNull();
    }
  });

  it("nombre de cámara: sólo si hay de dónde sacar uno mejor", () => {
    expect(esNombreSinSentido("IMG 2034")).toBe(true);
    expect(esNombreSinSentido("Scan 0001")).toBe(true);
    expect(esNombreSinSentido("documento (3)")).toBe(true);
    expect(esNombreSinSentido("Lista de trozas 5")).toBe(false);
    expect(limpiarNombre("IMG_2034.jpg")).toBeNull();
    expect(limpiarNombre("IMG_2034.jpg", { resumen: "Contrato de alquiler del local de Pucallpa. Firmado en 2026." })?.nombre)
      .toBe("Contrato de alquiler del local de Pucallpa.jpg");
    expect(limpiarNombre("Scan_0001.pdf", { tipo: "factura", numero: "F001-123", emisor: "ACME SAC" })?.nombre)
      .toBe("Factura F001-123 ACME SAC.pdf");
    // La descripción escrita a mano gana a la de la IA.
    expect(limpiarNombre("documento (3).pdf", { descripcionUsuario: "DNI de Juan", resumen: "Otra cosa" })?.nombre)
      .toBe("DNI de Juan.pdf");
  });

  it("aTipoOracion no toca nombres mezclados", () => {
    expect(aTipoOracion("Solicitud de Anulacion de Guia Perdida GTF 5 y LT 9 Y 10")).toBe("Solicitud de Anulacion de Guia Perdida GTF 5 y LT 9 Y 10");
  });
});

describe("basura y nombres libres", () => {
  it("candados de Office, archivos de sistema y 0 bytes", () => {
    expect(motivoBasura("CCNN SANTA ROSA DE CHIVIS/~$RTA DE EMSION GUIA SERFOR GTF 1-2-3-4.docx", 162)).toMatch(/candado/);
    expect(motivoBasura("Thumbs.db", 4000)).toMatch(/Windows/);
    expect(motivoBasura("desktop.ini", 80)).toMatch(/Windows/);
    expect(motivoBasura("vacío.pdf", 0)).toMatch(/0 bytes/);
    expect(motivoBasura("Factura.pdf", 2000)).toBeNull();
  });

  it("nombreLibre suma (2), (3)…", () => {
    expect(nombreLibre("x.pdf", new Set(["x.pdf"]))).toBe("x (2).pdf");
    expect(nombreLibre("x.pdf", new Set(["x.pdf", "x (2).pdf"]))).toBe("x (3).pdf");
    expect(nombreLibre("x.pdf", new Set())).toBe("x.pdf");
  });
});

describe("planOrdenar", () => {
  it("nunca deja dos papeles con el mismo nombre en la misma carpeta", () => {
    const plan = planOrdenar({
      ahora: AHORA,
      carpetas: [carpeta({ id: "f1", name: "Chivis", documentos: 3 })],
      papeles: [
        papel({ id: "a", name: "x.pdf", folderId: "f1" }),
        papel({ id: "b", name: "A/x.pdf", folderId: "f1" }),
        papel({ id: "c", name: "B/x.pdf", folderId: "f1" }),
        // En otra carpeta el mismo nombre no choca.
        papel({ id: "d", name: "C/x.pdf", folderId: null }),
      ],
    });
    const nombres = Object.fromEntries(plan.propuestas.filter((p) => p.tipo === "nombre").map((p) => [p.objetoId, p.despues]));
    expect(nombres).toEqual({ b: "x (2).pdf", c: "x (3).pdf", d: "x.pdf" });
  });

  it("un papel que va a la papelera no se renombra; lo que el rol no ve no aparece pero cuenta como ocupado", () => {
    const plan = planOrdenar({
      ahora: AHORA,
      carpetas: [],
      papeles: [
        papel({ id: "b", name: "Q/~$basura.docx", size: 162 }),
        papel({ id: "oculto", name: "x.pdf", tocable: false }),
        papel({ id: "v", name: "Q/x.pdf" }),
        papel({ id: "nomina", name: "NOMINA_DE_PAGOS.pdf", tocable: false }),
      ],
    });
    expect(plan.propuestas.map((p) => p.id)).toEqual(["nombre:v", "basura:b"]);
    expect(plan.propuestas[0].despues).toBe("x (2).pdf");
    expect(JSON.stringify(plan)).not.toMatch(/NOMINA|oculto/);
  });

  it("carpetas vacías de verdad, sin las del sistema ni las de hoy ni las compartidas", () => {
    const plan = planOrdenar({
      ahora: AHORA,
      carpetas: [
        carpeta({ id: "ok", name: "09" }),
        carpeta({ id: "papelera", name: "Con borrados", documentos: 2 }),
        carpeta({ id: "madre", name: "Madre", subcarpetas: 1 }),
        carpeta({ id: "hija", name: "Hija", parentId: "madre" }),
        carpeta({ id: "cam", name: "Cámaras", subcarpetas: 1 }),
        carpeta({ id: "dia", name: "2026-10-01", parentId: "cam" }),
        carpeta({ id: "wa", name: "Llegó por WhatsApp" }),
        carpeta({ id: "guias", name: "Guias forestales (GTF)" }),
        carpeta({ id: "hoy", name: "Nueva", creadaEn: "2026-10-22T14:00:00Z" }),
        carpeta({ id: "comp", name: "Compartida", compartida: true }),
        carpeta({ id: "ajena", name: "Restringida", borrable: false }),
        carpeta({ id: "th", name: "Libro TH", subcarpetas: 1 }),
        carpeta({ id: "titulos", name: "Títulos de propiedad", parentId: "th" }),
        carpeta({ id: "destino", name: "2026" }),
      ],
      papeles: [papel({ id: "s", name: "Legajo.pdf", sugerencia: { folderId: "destino" } })],
    });
    expect(plan.propuestas.filter((p) => p.tipo === "carpeta").map((p) => p.objetoId).sort()).toEqual(["hija", "ok"]);
    expect(plan.propuestas.find((p) => p.objetoId === "hija")?.donde).toBe("Madre");
  });

  it("repetidos: queda el más nuevo, o el atado a algo", () => {
    const plan = planOrdenar({
      ahora: AHORA,
      carpetas: [],
      papeles: [
        papel({ id: "viejo", name: "GTF 1.pdf", uploadedAt: "2026-01-01T00:00:00Z" }),
        papel({ id: "nuevo", name: "GTF 1 (1).pdf", uploadedAt: "2026-05-01T00:00:00Z" }),
        papel({ id: "medio", name: "GTF 1 copia.pdf", uploadedAt: "2026-03-01T00:00:00Z" }),
        papel({ id: "g1", name: "Casillero.pdf", uploadedAt: "2026-01-01T00:00:00Z", protegido: true }),
        papel({ id: "g2", name: "Casillero (1).pdf", uploadedAt: "2026-06-01T00:00:00Z" }),
      ],
      identicos: [["viejo", "nuevo", "medio"], ["g1", "g2"]],
    });
    const dup = plan.propuestas.filter((p) => p.tipo === "duplicado").map((p) => p.objetoId).sort();
    expect(dup).toEqual(["g2", "medio", "viejo"]);
  });

  it("sugerencias de la IA: sólo a lo suelto, a carpetas que ves, sin las descartadas", () => {
    const plan = planOrdenar({
      ahora: AHORA,
      carpetas: [carpeta({ id: "fac", name: "Facturas", documentos: 1 }), carpeta({ id: "oc", name: "Oculta", visible: false, documentos: 1 })],
      papeles: [
        papel({ id: "s1", name: "Factura A.pdf", sugerencia: { folderId: "fac", expiresAt: "2027-01-15T12:00:00.000Z" } }),
        papel({ id: "s2", name: "Factura B.pdf", sugerencia: { folderId: "oc" } }),
        papel({ id: "s3", name: "Factura C.pdf", folderId: "fac", sugerencia: { folderId: "fac" } }),
        papel({ id: "s4", name: "Factura D.pdf", sugerencia: { folderId: "fac" } }),
      ],
      descartadas: new Set(["s4"]),
    });
    const ia = plan.propuestas.filter((p) => p.tipo === "ia");
    expect(ia).toHaveLength(1);
    expect(ia[0]).toMatchObject({ objetoId: "s1", folderId: "fac", expiresAt: "2027-01-15T12:00:00.000Z" });
    expect(ia[0].despues).toBe("mover a «Facturas» · vence el 15/01/2027");
    expect(plan.conteo).toMatchObject({ ia: 1, nombre: 0 });
  });

  it("repetidos: sólo entre copias que ve la misma gente, y la que vence nunca se tira", () => {
    const plan = planOrdenar({
      ahora: AHORA,
      carpetas: [],
      papeles: [
        // Misma puerta: queda el que tiene vencimiento aunque sea el más viejo.
        papel({ id: "a1", name: "Póliza.pdf", uploadedAt: "2026-01-01T00:00:00Z", tieneVencimiento: true }),
        papel({ id: "a2", name: "Póliza (1).pdf", uploadedAt: "2026-05-01T00:00:00Z" }),
        // Puertas distintas: la copia restringida y la pública no son «repetidas».
        papel({ id: "b1", name: "Nómina.pdf", uploadedAt: "2026-01-01T00:00:00Z", puerta: "candado:solo-duenos" }),
        papel({ id: "b2", name: "Nómina (1).pdf", uploadedAt: "2026-05-01T00:00:00Z" }),
        // Dos con vencimiento: ninguno va a la papelera.
        papel({ id: "c1", name: "SOAT.pdf", uploadedAt: "2026-01-01T00:00:00Z", tieneVencimiento: true }),
        papel({ id: "c2", name: "SOAT (1).pdf", uploadedAt: "2026-05-01T00:00:00Z", tieneVencimiento: true }),
      ],
      identicos: [["a1", "a2"], ["b1", "b2"], ["c1", "c2"]],
    });
    const dup = plan.propuestas.filter((p) => p.tipo === "duplicado");
    expect(dup.map((p) => p.objetoId)).toEqual(["a2"]);
    expect(dup[0].motivo).toContain("que se queda porque tiene vencimiento");
  });

  it("sugerencias de la IA: no mueve adonde ya hay uno con su nombre, ni adonde no lo podrías volver a sacar", () => {
    const plan = planOrdenar({
      ahora: AHORA,
      carpetas: [
        carpeta({ id: "fac", name: "Facturas", documentos: 1 }),
        carpeta({ id: "caja", name: "Caja", documentos: 0, sacable: false }),
        carpeta({ id: "otra", name: "Otra", documentos: 0 }),
      ],
      papeles: [
        papel({ id: "ya", name: "Factura A.pdf", folderId: "fac" }),
        // Choca con el que ya está en «Facturas»: sólo queda el vencimiento.
        papel({ id: "s1", name: "factura a.pdf", sugerencia: { folderId: "fac", expiresAt: "2027-01-15T12:00:00.000Z" } }),
        papel({ id: "s3", name: "Recibo.pdf", sugerencia: { folderId: "caja" } }),
        // Dos sueltos con el mismo nombre a la misma carpeta: va uno solo.
        papel({ id: "s4", name: "Boleta.pdf", sugerencia: { folderId: "otra" } }),
        papel({ id: "s5", name: "Boleta.pdf", sugerencia: { folderId: "otra" } }),
      ],
    });
    const ia = plan.propuestas.filter((p) => p.tipo === "ia");
    expect(ia.map((p) => [p.objetoId, p.folderId ?? null, p.expiresAt ?? null])).toEqual([
      ["s4", "otra", null],
      ["s1", null, "2027-01-15T12:00:00.000Z"],
    ]);
  });

  it("una carpeta vacía dice que se borra, no que va a la papelera", () => {
    const plan = planOrdenar({ ahora: AHORA, papeles: [], carpetas: [carpeta({ id: "v", name: "Vacía" })] });
    expect(plan.propuestas[0]).toMatchObject({ tipo: "carpeta", despues: "Se borra" });
  });
});

describe("deshacer en tandas", () => {
  it("parte en pedidos de n y manda las madres antes que sus hijas aunque vengan al revés", () => {
    const c = (id: string, parentId: string | null) => ({
      id, name: id, parentId, color: null, icon: null, emoji: null, tags: [], allowedRoles: [],
    });
    const tandas = enTandas(
      {
        carpetas: [c("nieta", "hija"), c("hija", "madre"), c("madre", "fuera")],
        restaurar: ["r1", "r2"],
        renombres: [{ id: "n1", antes: "a", despues: "A" }],
        ia: [],
      },
      2,
    );
    expect(tandas.map((t) => t.carpetas.map((x) => x.id))).toEqual([["madre", "hija"], ["nieta"], []]);
    expect(tandas.map((t) => t.restaurar.length + t.renombres.length)).toEqual([0, 1, 2]);
  });
});
