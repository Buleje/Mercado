import { describe, it, expect } from "vitest";
import { extractXlsText, esXlsBinario } from "@/lib/documents/extraer-xls";

/**
 * Lector de Excel viejo (.xls binario).
 *
 * El fixture se ARMA acá en vez de guardar un archivo: los `.xls` del drive son
 * planillas reales del aserradero (cuentas, jornales) y no van al repo, y un
 * binario opaco en `__fixtures__` no explica nada cuando el test falla. El
 * generador es la especificación del formato escrita como código.
 */

const SECTOR = 512;
const LIBRE = 0xFFFFFFFF;
const FIN = 0xFFFFFFFE;
const FATSECT = 0xFFFFFFFD;

/** Un registro BIFF: tipo u16, largo u16, datos. */
function registro(tipo: number, datos: number[]): number[] {
  return [tipo & 0xFF, (tipo >> 8) & 0xFF, datos.length & 0xFF, (datos.length >> 8) & 0xFF, ...datos];
}
const u16 = (n: number) => [n & 0xFF, (n >> 8) & 0xFF];
const u32 = (n: number) => [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF];
const latin1 = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0xFF);
const f64 = (n: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, n, true);
  return [...b];
};

/** El stream `Workbook`: globales (con la tabla de textos) y una hoja. */
function streamWorkbook(opciones: { biff8: boolean; hoja: string; textos: string[] }): number[] {
  const { biff8, hoja, textos } = opciones;
  const vers = biff8 ? 0x0600 : 0x0500;

  const cadena = (s: string) =>
    biff8 ? [...u16(s.length), 0x00, ...latin1(s)] : [...u16(s.length), ...latin1(s)];

  // La tabla de textos compartidos (SST) es de BIFF8: en BIFF5 cada celda de
  // texto lleva su cadena adentro (registro LABEL). Es la diferencia que hacía
  // ilegibles las planillas viejas del aserradero.
  const sst = biff8
    ? registro(0x00FC, [...u32(textos.length), ...u32(textos.length), ...textos.flatMap(cadena)])
    : [];

  // El BOUNDSHEET tiene que apuntar al BOF de la hoja, y ese offset depende del
  // largo de todo lo que va antes: se arma en dos pasos con un relleno del
  // mismo tamaño para que la cuenta cierre.
  const boundsheetLargo = 8 + hoja.length + 4; // datos + cabecera del registro
  const bofGlobal = registro(0x0809, [...u16(vers), ...u16(0x0005), ...u16(0), ...u16(0), ...u32(0), ...u32(0)]);
  const eof = registro(0x000A, []);
  const offsetHoja = bofGlobal.length + boundsheetLargo + sst.length + eof.length;

  const boundsheet = registro(0x0085, [
    ...u32(offsetHoja), ...u16(0),
    hoja.length, 0x00, // cch + grbitChr (en BIFF5 el segundo byte ya es el nombre)
    ...latin1(hoja),
  ]);
  // En BIFF5 no hay `grbitChr`: el nombre empieza un byte antes.
  const boundsheetReal = biff8
    ? boundsheet
    : registro(0x0085, [...u32(offsetHoja), ...u16(0), hoja.length, ...latin1(hoja), 0x00]);

  const bofHoja = registro(0x0809, [...u16(vers), ...u16(0x0010), ...u16(0), ...u16(0), ...u32(0), ...u32(0)]);
  /** Celda de texto: por índice a la tabla (BIFF8) o con la cadena adentro (BIFF5). */
  const celdaTexto = (fila: number, col: number, i: number) =>
    biff8
      ? registro(0x00FD, [...u16(fila), ...u16(col), ...u16(0), ...u32(i)])
      : registro(0x0204, [...u16(fila), ...u16(col), ...u16(0), ...cadena(textos[i])]);
  const celdas = [
    ...celdaTexto(0, 0, 0),
    ...celdaTexto(0, 1, 1),
    ...celdaTexto(1, 0, 2),
    ...registro(0x0203, [...u16(1), ...u16(1), ...u16(0), ...f64(7.927)]),
  ];

  return [...bofGlobal, ...boundsheetReal, ...sst, ...eof, ...bofHoja, ...celdas, ...eof];
}

/** Envuelve el stream en un compound file OLE2 mínimo pero válido. */
function armarXls(opciones: { biff8: boolean; hoja: string; textos: string[] }): Uint8Array {
  const wb = streamWorkbook(opciones);
  // El lector ignora los streams más chicos que un sector (viven en el mini
  // stream, que no se soporta): se rellena para que ocupe al menos uno.
  while (wb.length < SECTOR + 1) wb.push(0);
  const sectoresWb = Math.ceil(wb.length / SECTOR);

  const header = new Uint8Array(SECTOR).fill(0);
  header.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 0);
  const hdv = new DataView(header.buffer);
  hdv.setUint16(28, 0xFFFE, true);        // byte order
  hdv.setUint16(30, 9, true);             // sector shift → 512
  hdv.setUint16(32, 6, true);             // mini sector shift
  hdv.setUint32(44, 1, true);             // sectores de FAT
  hdv.setUint32(48, 1, true);             // primer sector del directorio
  hdv.setUint32(60, LIBRE, true);         // primer mini FAT
  hdv.setUint32(68, LIBRE, true);         // primer DIFAT
  hdv.setUint32(76, 0, true);             // DIFAT[0] = sector 0 (la FAT)
  for (let i = 1; i < 109; i++) hdv.setUint32(76 + i * 4, LIBRE, true);

  const fat = new Uint8Array(SECTOR).fill(0xFF);
  const fdv = new DataView(fat.buffer);
  fdv.setUint32(0, FATSECT, true);        // sector 0: la FAT misma
  fdv.setUint32(4, FIN, true);            // sector 1: el directorio
  for (let i = 0; i < sectoresWb; i++) {
    fdv.setUint32(8 + i * 4, i === sectoresWb - 1 ? FIN : 3 + i, true);
  }

  const dir = new Uint8Array(SECTOR).fill(0);
  const ddv = new DataView(dir.buffer);
  const entrada = (i: number, nombre: string, tipo: number, inicio: number, tam: number) => {
    const off = i * 128;
    for (let c = 0; c < nombre.length; c++) ddv.setUint16(off + c * 2, nombre.charCodeAt(c), true);
    ddv.setUint16(off + 64, (nombre.length + 1) * 2, true);
    dir[off + 66] = tipo;
    ddv.setUint32(off + 68, LIBRE, true);
    ddv.setUint32(off + 72, LIBRE, true);
    ddv.setUint32(off + 76, LIBRE, true);
    ddv.setUint32(off + 116, inicio, true);
    ddv.setUint32(off + 120, tam, true);
  };
  entrada(0, "Root Entry", 5, LIBRE, 0);
  entrada(1, "Workbook", 2, 2, wb.length);

  // El offset de un sector N en el archivo es (N+1)*512: el header ocupa el
  // primer bloque. Sector 0 = FAT, sector 1 = directorio, sector 2 = Workbook.
  const total = new Uint8Array(SECTOR * (3 + sectoresWb));
  total.set(header, 0);
  total.set(fat, SECTOR);
  total.set(dir, SECTOR * 2);
  total.set(new Uint8Array(wb), SECTOR * 3);
  return total;
}

describe("esXlsBinario", () => {
  it("reconoce la firma de un compound file OLE2", () => {
    expect(esXlsBinario(armarXls({ biff8: true, hoja: "Hoja1", textos: ["a"] }))).toBe(true);
  });

  it("dice que no ante cualquier otra cosa", () => {
    expect(esXlsBinario(new Uint8Array(600))).toBe(false);
    expect(esXlsBinario(new TextEncoder().encode("PK esto es un xlsx"))).toBe(false);
    expect(esXlsBinario(new Uint8Array([0xD0, 0xCF]))).toBe(false); // firma cortada
  });
});

describe("extractXlsText", () => {
  it("lee hoja, textos y números de un .xls BIFF8", () => {
    const buf = armarXls({
      biff8: true,
      hoja: "Trozado",
      textos: ["especie_comun", "volumen_m3", "Copaiba"],
    });
    const texto = extractXlsText(buf);
    expect(texto).toContain("— Hoja: Trozado —");
    expect(texto).toContain("especie_comun | volumen_m3");
    expect(texto).toContain("Copaiba | 7.927");
  });

  it("lee un .xls BIFF5 sin comerse la primera letra ni convertirlo en chino", () => {
    // Regresión real: las planillas del aserradero son BIFF5 y salían como
    // "alado-2025" con celdas tipo `摯杩彯牡潢` al leerlas con reglas de BIFF8.
    const buf = armarXls({
      biff8: false,
      hoja: "talado-20250124",
      textos: ["codigo_arbol", "especie_cientifico", "Copaifera paupera"],
    });
    const texto = extractXlsText(buf);
    expect(texto).toContain("— Hoja: talado-20250124 —");
    expect(texto).toContain("codigo_arbol | especie_cientifico");
    expect(texto).toContain("Copaifera paupera | 7.927");
  });

  it("respeta el tope de filas", () => {
    const buf = armarXls({ biff8: true, hoja: "H", textos: ["a", "b", "c"] });
    expect(extractXlsText(buf, 1).split("\n").filter((l) => !l.startsWith("—")).length).toBe(1);
  });

  it("devuelve vacío —sin tirar— ante basura o un archivo truncado", () => {
    expect(extractXlsText(new Uint8Array(1000))).toBe("");
    expect(extractXlsText(new TextEncoder().encode("no soy un excel"))).toBe("");
    const roto = armarXls({ biff8: true, hoja: "H", textos: ["x"] }).slice(0, 700);
    expect(() => extractXlsText(roto)).not.toThrow();
  });
});
