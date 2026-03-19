/**
 * ESC/POS thermal printer utility.
 * Uses the Web Serial API (Chrome 89+) to communicate directly with USB/serial thermal printers.
 */

// Web Serial API types (not yet in standard TS lib)
declare global {
  interface Navigator {
    serial: {
      requestPort(): Promise<SerialPort>;
    };
  }
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    writable: WritableStream<Uint8Array> | null;
  }
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const encoder = new TextEncoder();

function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(len);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Commands
const CMD = {
  init: new Uint8Array([ESC, 0x40]),
  alignCenter: new Uint8Array([ESC, 0x61, 1]),
  alignLeft: new Uint8Array([ESC, 0x61, 0]),
  alignRight: new Uint8Array([ESC, 0x61, 2]),
  boldOn: new Uint8Array([ESC, 0x45, 1]),
  boldOff: new Uint8Array([ESC, 0x45, 0]),
  doubleHeight: new Uint8Array([ESC, 0x21, 0x10]),
  normalSize: new Uint8Array([ESC, 0x21, 0x00]),
  cut: new Uint8Array([GS, 0x56, 0x00]),
  partialCut: new Uint8Array([GS, 0x56, 0x01]),
  feedLines: (n: number) => new Uint8Array([ESC, 0x64, n]),
  lineFeed: new Uint8Array([LF]),
};

function line(text: string): Uint8Array {
  return concat(encode(text), CMD.lineFeed);
}

function separator(char = "-", width = 32): Uint8Array {
  return line(char.repeat(width));
}

function columns(left: string, right: string, width = 32): Uint8Array {
  const gap = width - left.length - right.length;
  const spaces = gap > 0 ? " ".repeat(gap) : " ";
  return line(left + spaces + right);
}

export type ReceiptItem = {
  name: string;
  quantity: number;
  price: number;
  unit: string;
};

export type ReceiptData = {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  ticketId: string;
  date: Date;
  items: ReceiptItem[];
  total: number;
  payment: string;
  amountPaid?: number;
  change?: number;
};

const PAY_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  fiado: "Fiado",
};

function buildReceipt(data: ReceiptData): Uint8Array {
  const W = 32; // typical 58mm printer character width
  const parts: Uint8Array[] = [];

  const add = (...cmds: Uint8Array[]) => cmds.forEach((c) => parts.push(c));

  // Init
  add(CMD.init);

  // Header
  add(CMD.alignCenter, CMD.boldOn, CMD.doubleHeight);
  add(line(data.businessName));
  add(CMD.normalSize, CMD.boldOff);
  if (data.businessAddress) add(line(data.businessAddress));
  if (data.businessPhone) add(line(`Tel: ${data.businessPhone}`));
  add(CMD.lineFeed);
  add(CMD.boldOn, line("TICKET DE VENTA"), CMD.boldOff);
  add(separator("=", W));

  // Meta
  add(CMD.alignLeft);
  add(columns("Ticket:", `#${data.ticketId.slice(0, 12).toUpperCase()}`, W));

  const d = data.date;
  const dateStr = d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  add(columns("Fecha:", dateStr, W));
  add(columns("Hora:", timeStr, W));
  add(columns("Pago:", PAY_LABELS[data.payment] ?? data.payment, W));
  add(separator("-", W));

  // Items
  for (const item of data.items) {
    const subtotal = (item.price * item.quantity).toFixed(2);
    const nameLine = item.name.length > W - 2 ? item.name.slice(0, W - 2) : item.name;
    add(CMD.boldOn, line(nameLine), CMD.boldOff);
    add(columns(`  ${item.quantity} x S/${item.price.toFixed(2)}`, `S/${subtotal}`, W));
  }

  add(separator("-", W));

  // Totals
  add(CMD.boldOn, CMD.doubleHeight);
  add(columns("TOTAL", `S/${data.total.toFixed(2)}`, W));
  add(CMD.normalSize, CMD.boldOff);

  if (data.payment === "efectivo" && data.amountPaid != null) {
    add(columns("Pago con", `S/${data.amountPaid.toFixed(2)}`, W));
    if (data.change != null && data.change > 0) {
      add(columns("Vuelto", `S/${data.change.toFixed(2)}`, W));
    }
  }

  add(separator("=", W));

  // Footer
  add(CMD.alignCenter);
  add(CMD.lineFeed);
  add(line("¡Gracias por su compra!"));
  add(line(`${data.businessName} - Pucallpa`));
  add(CMD.feedLines(4));
  add(CMD.partialCut);

  return concat(...parts);
}

/** Check if Web Serial API is available */
export function isThermalPrintSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/** Print receipt via Web Serial API (ESC/POS) */
export async function printThermal(data: ReceiptData): Promise<void> {
  if (!isThermalPrintSupported()) {
    throw new Error("Tu navegador no soporta impresión serial (usa Chrome)");
  }

  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });

  const writer = port.writable?.getWriter();
  if (!writer) {
    await port.close();
    throw new Error("No se pudo abrir el puerto de escritura");
  }

  try {
    const receipt = buildReceipt(data);
    await writer.write(receipt);
  } finally {
    writer.releaseLock();
    await port.close();
  }
}
