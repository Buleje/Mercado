import "server-only";

/**
 * extraer-xls — el texto de un Excel VIEJO (.xls binario), sin dependencias.
 *
 * En el drive del aserradero hay 28 archivos así: KARDEX, cuentas y planillas de
 * trozado exportadas por sistemas que todavía escriben BIFF8. No los leía nadie
 * (`exceljs` sólo abre `.xlsx`), así que eran invisibles para la búsqueda y para
 * el asistente: existían como nombre y nada más.
 *
 * Se implementa a mano en vez de sumar SheetJS porque la versión publicada en
 * npm arrastra vulnerabilidades conocidas y la sana se distribuye fuera de npm:
 * una dependencia que el build no puede resolver es peor que 200 líneas propias.
 *
 * Un `.xls` es un **compound file OLE2** con un stream llamado `Workbook`
 * adentro, y ese stream es una tira de registros BIFF (`tipo:u16 largo:u16
 * datos`). Se leen los que tienen texto o números y se arma una tabla legible.
 * No se interpretan formatos, fórmulas ni gráficos: para describir y buscar
 * alcanza con lo que dicen las celdas.
 */

const SECTOR_LIBRE = 0xFFFFFFFF;
const FIN_DE_CADENA = 0xFFFFFFFE;

/** Registros BIFF que nos interesan. */
const REG = {
  BOUNDSHEET: 0x0085,
  SST: 0x00FC,
  CONTINUE: 0x003C,
  LABELSST: 0x00FD,
  LABEL: 0x0204,
  RSTRING: 0x00D6,
  NUMBER: 0x0203,
  RK: 0x027E,
  MULRK: 0x00BD,
  BOF: 0x0809,
} as const;

/** ¿Empieza con la firma de un compound file OLE2? */
export function esXlsBinario(buf: Uint8Array): boolean {
  const firma = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  return buf.length > 512 && firma.every((b, i) => buf[i] === b);
}

/**
 * Saca el stream `Workbook` del contenedor OLE2.
 *
 * Lo mínimo del formato: el header dice el tamaño de sector y dónde arrancan la
 * FAT y el directorio; el directorio dice en qué sector empieza cada stream y
 * cuánto mide; la FAT encadena los sectores. Los streams chicos viven en un
 * "mini stream" aparte — un Workbook nunca es tan chico, así que ese camino no
 * se implementa y se devuelve null si aparece.
 */
function streamWorkbook(buf: Uint8Array): Uint8Array | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tamSector = 1 << dv.getUint16(30, true);
  if (tamSector < 512 || tamSector > 65536) return null;
  const sectoresFat = dv.getUint32(44, true);
  const primerDir = dv.getUint32(48, true);

  const leerSector = (sector: number): Uint8Array | null => {
    const off = (sector + 1) * tamSector;
    return off + tamSector <= buf.length ? buf.subarray(off, off + tamSector) : null;
  };

  // FAT: los primeros 109 punteros están en el header; los que siguen, en la
  // DIFAT encadenada. Con 109 sectores de FAT se direccionan varios MB, de
  // sobra para las planillas del drive.
  const fat: number[] = [];
  for (let i = 0; i < Math.min(sectoresFat, 109); i++) {
    const sec = dv.getUint32(76 + i * 4, true);
    if (sec === SECTOR_LIBRE) break;
    const s = leerSector(sec);
    if (!s) break;
    const sdv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    for (let j = 0; j < tamSector / 4; j++) fat.push(sdv.getUint32(j * 4, true));
  }
  if (fat.length === 0) return null;

  const cadena = (inicio: number): number[] => {
    const out: number[] = [];
    let s = inicio;
    // El tope corta cualquier FAT circular: sin él, un archivo corrupto cuelga
    // el proceso entero.
    while (s !== FIN_DE_CADENA && s !== SECTOR_LIBRE && out.length < 100_000) {
      out.push(s);
      s = fat[s] ?? FIN_DE_CADENA;
    }
    return out;
  };

  const juntar = (sectores: number[], largo: number): Uint8Array => {
    const out = new Uint8Array(Math.min(largo, sectores.length * tamSector));
    let escrito = 0;
    for (const sec of sectores) {
      const s = leerSector(sec);
      if (!s) break;
      const n = Math.min(tamSector, out.length - escrito);
      out.set(s.subarray(0, n), escrito);
      escrito += n;
      if (escrito >= out.length) break;
    }
    return out.subarray(0, escrito);
  };

  // Directorio: entradas de 128 bytes, nombre en UTF-16LE en los primeros 64.
  const dirSectores = cadena(primerDir);
  const dir = juntar(dirSectores, dirSectores.length * tamSector);
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const largoNombre = ddv.getUint16(off + 64, true);
    if (largoNombre < 4 || largoNombre > 64) continue;
    let nombre = "";
    for (let i = 0; i < largoNombre - 2; i += 2) nombre += String.fromCharCode(ddv.getUint16(off + i, true));
    if (nombre !== "Workbook" && nombre !== "Book") continue;
    const inicio = ddv.getUint32(off + 116, true);
    const tam = ddv.getUint32(off + 120, true);
    if (tam < tamSector) return null; // vive en el mini stream: no soportado
    return juntar(cadena(inicio), tam);
  }
  return null;
}

/**
 * Una cadena de celda, en las dos generaciones del formato.
 *
 * **BIFF8** (Excel 97+): largo u16, banderas u8, y después UTF-16LE o Latin-1
 * según la bandera. **BIFF5/7** (Excel 5.0/95): largo u16 y Latin-1 pelado, sin
 * byte de banderas. Leer un BIFF5 con las reglas de BIFF8 se come el primer
 * carácter y convierte el resto en chino (`摯杩彯牡潢`): así salían las planillas
 * de trozado del aserradero, que las escribe un sistema viejo.
 *
 * Cada lectura chequea que haya bytes: un `.xls` de veinte años trae registros
 * que no cierran, y un `DataView` fuera de rango tiraba una excepción que se
 * llevaba puesta la extracción ENTERA de un archivo del que ya se habían leído
 * mil líneas bien. Cuando no alcanza, se corta y se devuelve lo que había.
 */
function leerCadena(
  dv: DataView,
  pos: number,
  buf: Uint8Array,
  biff8 = true,
): { texto: string; siguiente: number } {
  if (pos + 2 > buf.length) return { texto: "", siguiente: buf.length };
  const largo = dv.getUint16(pos, true);
  if (!biff8) {
    let texto = "";
    let q = pos + 2;
    for (let i = 0; i < largo && q < buf.length; i++, q++) texto += String.fromCharCode(buf[q]);
    return { texto, siguiente: Math.min(q, buf.length) };
  }
  if (pos + 3 > buf.length) return { texto: "", siguiente: buf.length };
  const banderas = buf[pos + 2];
  let p = pos + 3;
  const ancho = (banderas & 0x01) !== 0;
  if ((banderas & 0x08) !== 0) {
    if (p + 2 > buf.length) return { texto: "", siguiente: buf.length };
    p += 2 + dv.getUint16(p, true) * 4; // runs de formato
  }
  if ((banderas & 0x04) !== 0) {
    if (p + 4 > buf.length) return { texto: "", siguiente: buf.length };
    p += 4 + dv.getUint32(p, true);     // datos far east
  }
  let texto = "";
  for (let i = 0; i < largo; i++) {
    if (ancho) {
      if (p + 2 > buf.length) break;
      texto += String.fromCharCode(dv.getUint16(p, true));
      p += 2;
    } else {
      if (p + 1 > buf.length) break;
      texto += String.fromCharCode(buf[p]);
      p += 1;
    }
  }
  return { texto, siguiente: Math.min(p, buf.length) };
}

/** Los números de Excel vienen empaquetados en 4 bytes ("RK"), no en 8. */
function valorRK(crudo: number): number {
  const entero = (crudo & 0x02) !== 0;
  const dividir = (crudo & 0x01) !== 0;
  let n: number;
  if (entero) {
    n = crudo >> 2;
  } else {
    const b = new ArrayBuffer(8);
    new DataView(b).setUint32(4, crudo & 0xFFFFFFFC, true);
    n = new DataView(b).getFloat64(0, true);
  }
  return dividir ? n / 100 : n;
}

/**
 * Saca los caracteres de control que traen las celdas viejas y colapsa espacios.
 *
 * Se filtra por CÓDIGO y no con una clase de regex: escribir el rango a mano
 * dejó bytes NUL dentro de este mismo archivo y después ningún grep encontraba
 * la función (el mismo gotcha que ya había pasado en el agente de sync).
 */
function limpiar(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c < 32 || c === 127 ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Texto de un `.xls` binario: hojas, y cada fila con sus celdas separadas por
 * `|` — el mismo formato que usa el extractor de `.xlsx`, para que la IA lea
 * siempre lo mismo venga de donde venga el archivo.
 *
 * Devuelve `""` si no es un `.xls` que se pueda leer. El tope de filas es el
 * mismo que el de `.xlsx`: para describir y buscar alcanza el arranque.
 */
export function extractXlsText(entrada: Uint8Array, maxFilas = 400): string {
  if (!esXlsBinario(entrada)) return "";
  let wb: Uint8Array | null = null;
  try {
    wb = streamWorkbook(entrada);
  } catch {
    return ""; // contenedor roto: no es motivo para tumbar el análisis entero
  }
  if (!wb || wb.length < 8) return "";

  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const sst: string[] = [];
  const hojas: { offset: number; nombre: string }[] = [];
  /** Celdas: hoja -> fila -> columna. */
  const celdas = new Map<number, Map<number, Map<number, string>>>();
  const inicioDeHoja = new Map<number, number>();

  // La versión vive en el primer BOF. 0x0600 = BIFF8 (Excel 97+); todo lo
  // anterior guarda las cadenas en Latin-1 sin byte de banderas.
  const biff8 = wb.length >= 6 && dv.getUint16(0, true) === REG.BOF
    ? dv.getUint16(4, true) >= 0x0600
    : true;

  // Primera pasada: nombres de hoja y la tabla de textos (SST). El SST se parte
  // en registros CONTINUE, así que se lo pega antes de leerlo: una cadena puede
  // quedar cortada justo en el borde de dos registros.
  let pos = 0;
  while (pos + 4 <= wb.length) {
    const tipo = dv.getUint16(pos, true);
    const largo = dv.getUint16(pos + 2, true);
    const datos = pos + 4;
    if (datos + largo > wb.length) break;

    if (tipo === REG.BOUNDSHEET) {
      const offsetBof = dv.getUint32(datos, true);
      const largoNombre = wb[datos + 6];
      // BIFF8 mete un byte de banderas entre el largo y el nombre; BIFF5 no.
      // Con la cuenta de BIFF8 sobre un archivo viejo, la hoja "talado-…" se
      // llamaba "alado-…": un byte de más se come la primera letra.
      const inicioNombre = datos + (biff8 ? 8 : 7);
      const ancho = biff8 && (wb[datos + 7] & 0x01) !== 0;
      let nombre = "";
      for (let i = 0; i < largoNombre; i++) {
        const p = ancho ? inicioNombre + i * 2 : inicioNombre + i;
        if (p + (ancho ? 2 : 1) > wb.length) break;
        nombre += ancho ? String.fromCharCode(dv.getUint16(p, true)) : String.fromCharCode(wb[p]);
      }
      inicioDeHoja.set(offsetBof, hojas.length);
      hojas.push({ offset: offsetBof, nombre: limpiar(nombre) });
    } else if (tipo === REG.SST) {
      const partes: Uint8Array[] = [wb.subarray(datos, datos + largo)];
      let p = datos + largo;
      while (p + 4 <= wb.length && dv.getUint16(p, true) === REG.CONTINUE) {
        const l = dv.getUint16(p + 2, true);
        partes.push(wb.subarray(p + 4, p + 4 + l));
        p += 4 + l;
      }
      const total = partes.reduce((n, x) => n + x.length, 0);
      const junto = new Uint8Array(total);
      let esc = 0;
      for (const parte of partes) { junto.set(parte, esc); esc += parte.length; }
      const jdv = new DataView(junto.buffer, junto.byteOffset, junto.byteLength);
      const cantidad = jdv.getUint32(4, true);
      let q = 8;
      for (let i = 0; i < cantidad && q < junto.length; i++) {
        const { texto, siguiente } = leerCadena(jdv, q, junto);
        sst.push(texto);
        if (siguiente <= q) break;
        q = siguiente;
      }
      pos = p;
      continue;
    }
    pos = datos + largo;
  }

  // Segunda pasada: las celdas, ubicando cada una en su hoja.
  let hojaActual = -1;
  const poner = (fila: number, col: number, valor: string) => {
    if (hojaActual < 0 || !valor) return;
    const hoja = celdas.get(hojaActual) ?? new Map<number, Map<number, string>>();
    const f = hoja.get(fila) ?? new Map<number, string>();
    f.set(col, valor);
    hoja.set(fila, f);
    celdas.set(hojaActual, hoja);
  };

  pos = 0;
  while (pos + 4 <= wb.length) {
    const tipo = dv.getUint16(pos, true);
    const largo = dv.getUint16(pos + 2, true);
    const datos = pos + 4;
    if (datos + largo > wb.length) break;
    // Un registro corto (archivo viejo, escritor no estándar) no puede tumbar
    // la extracción: se saltea esa celda y se sigue con las demás.
    if (largo < 6 && tipo !== REG.BOF) { pos = datos + largo; continue; }

    if (tipo === REG.BOF && inicioDeHoja.has(pos)) {
      hojaActual = inicioDeHoja.get(pos)!;
    } else if (tipo === REG.LABELSST && largo >= 10) {
      const idx = dv.getUint32(datos + 6, true);
      poner(dv.getUint16(datos, true), dv.getUint16(datos + 2, true), limpiar(sst[idx] ?? ""));
    } else if (tipo === REG.LABEL || tipo === REG.RSTRING) {
      const { texto } = leerCadena(dv, datos + 6, wb, biff8);
      poner(dv.getUint16(datos, true), dv.getUint16(datos + 2, true), limpiar(texto));
    } else if (tipo === REG.NUMBER && largo >= 14) {
      const n = dv.getFloat64(datos + 6, true);
      poner(dv.getUint16(datos, true), dv.getUint16(datos + 2, true), String(Math.round(n * 1e6) / 1e6));
    } else if (tipo === REG.RK && largo >= 10) {
      const n = valorRK(dv.getUint32(datos + 6, true));
      poner(dv.getUint16(datos, true), dv.getUint16(datos + 2, true), String(Math.round(n * 1e6) / 1e6));
    } else if (tipo === REG.MULRK) {
      const fila = dv.getUint16(datos, true);
      const primera = dv.getUint16(datos + 2, true);
      const cantidad = Math.floor((largo - 6) / 6);
      for (let i = 0; i < cantidad; i++) {
        const n = valorRK(dv.getUint32(datos + 4 + i * 6 + 2, true));
        poner(fila, primera + i, String(Math.round(n * 1e6) / 1e6));
      }
    }
    pos = datos + largo;
  }

  const salida: string[] = [];
  let filasEscritas = 0;
  for (let h = 0; h < hojas.length && filasEscritas < maxFilas; h++) {
    const hoja = celdas.get(h);
    if (!hoja || hoja.size === 0) continue;
    salida.push(`— Hoja: ${hojas[h].nombre} —`);
    for (const fila of [...hoja.keys()].sort((a, b) => a - b)) {
      if (filasEscritas >= maxFilas) break;
      const cols = hoja.get(fila)!;
      const texto = [...cols.keys()].sort((a, b) => a - b).map((c) => cols.get(c)!).join(" | ");
      if (texto.trim()) { salida.push(texto); filasEscritas++; }
    }
  }
  return salida.join("\n");
}
