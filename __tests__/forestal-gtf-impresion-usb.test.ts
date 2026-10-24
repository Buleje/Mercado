// @vitest-environment node
/**
 * «Imprimir directo» por WebUSB (16-10) con un `navigator.usb` simulado: pide
 * permiso filtrando impresoras, reusa la ya autorizada, parte en bloques,
 * cierra aunque falle y dice qué hacer en cada error.
 */

import { describe, expect, it, vi } from "vitest";
import {
  BLOQUE_USB,
  enviarPorUsb,
  imprimirPorUsb,
  interfazDeImpresora,
  soporteImpresionDirecta,
  urlIntentRawbt,
  type ArchivoSalida,
  type UsbConfigurationLike,
  type UsbDeviceLike,
  type UsbLike,
  type UsbTransferOutResultLike,
} from "@/lib/forestal/gtf-impresion-usb";
import { avisoRecortados, bajarSalida } from "@/lib/forestal/gtf-cola-monte-imprimir";

const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A146M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1";
const UA_FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0";

/** La Epson: interfaz 0 de clase 7 con bulk OUT 1 y bulk IN 2. */
const CONFIG_EPSON: UsbConfigurationLike = {
  configurationValue: 1,
  interfaces: [
    {
      interfaceNumber: 0,
      alternates: [
        {
          alternateSetting: 0,
          interfaceClass: 7,
          endpoints: [
            { endpointNumber: 2, direction: "in", type: "bulk" },
            { endpointNumber: 1, direction: "out", type: "bulk" },
          ],
        },
      ],
    },
  ],
};

const domError = (name: string, msg = name) => new DOMException(msg, name);

function impresora(o: { configurada?: boolean; config?: UsbConfigurationLike; transferOut?: (ep: number, d: Uint8Array) => Promise<UsbTransferOutResultLike> } = {}) {
  const config = o.config ?? CONFIG_EPSON;
  const enviados: number[] = [];
  const d = {
    manufacturerName: "EPSON",
    productName: "LX-350",
    opened: false as boolean,
    configuration: o.configurada === false ? null : config,
    configurations: [config],
    open: vi.fn(async () => {
      d.opened = true;
    }),
    close: vi.fn(async () => {
      d.opened = false;
    }),
    selectConfiguration: vi.fn(async () => {
      d.configuration = config;
    }),
    claimInterface: vi.fn(async () => undefined),
    releaseInterface: vi.fn(async () => undefined),
    selectAlternateInterface: vi.fn(async () => undefined),
    transferOut: vi.fn(
      o.transferOut ??
        (async (_ep: number, data: Uint8Array): Promise<UsbTransferOutResultLike> => {
          enviados.push(data.length);
          return { bytesWritten: data.length, status: "ok" };
        }),
    ),
    clearHalt: vi.fn(async () => undefined),
  } satisfies UsbDeviceLike;
  return { d, enviados };
}

function usbCon(autorizadas: UsbDeviceLike[], elegir: () => Promise<UsbDeviceLike>) {
  return {
    getDevices: vi.fn(async () => autorizadas),
    requestDevice: vi.fn(elegir),
  } satisfies UsbLike;
}

const prn = (n: number): ArchivoSalida => ({ blob: new Blob([new Uint8Array(n).fill(0x41)]), nombre: "guia.prn" });

describe("imprimirPorUsb", () => {
  it("sin impresora autorizada pide permiso filtrando la clase 7, y lo pide ANTES de bajar la hoja", async () => {
    const orden: string[] = [];
    const { d } = impresora();
    const usb = usbCon([], async () => {
      orden.push("permiso");
      return d;
    });
    const r = await imprimirPorUsb(
      async () => {
        orden.push("bajar");
        return prn(288);
      },
      { usb, ua: UA_ANDROID },
    );
    expect(r).toMatchObject({ ok: true, impresora: "EPSON LX-350", bytes: 288 });
    expect(usb.requestDevice).toHaveBeenCalledWith({ filters: [{ classCode: 7 }] });
    expect(orden).toEqual(["permiso", "bajar"]);
  });

  it("reusa la impresora ya autorizada sin volver a preguntar", async () => {
    const { d } = impresora();
    const usb = usbCon([d], async () => d);
    const r = await imprimirPorUsb(async () => prn(10), { usb, ua: UA_ANDROID });
    expect(r.ok).toBe(true);
    expect(usb.getDevices).toHaveBeenCalledTimes(1);
    expect(usb.requestDevice).not.toHaveBeenCalled();
  });

  it("cerrar el selector = cancelado, y no baja nada", async () => {
    const obtener = vi.fn(async () => prn(10));
    const usb = usbCon([], async () => {
      throw domError("NotFoundError", "No device selected.");
    });
    const r = await imprimirPorUsb(obtener, { usb, ua: UA_ANDROID });
    expect(r).toMatchObject({ ok: false, motivo: "cancelado", android: true, archivo: null });
    expect(r.ok ? "" : r.mensaje).toContain("cable OTG");
    expect(obtener).not.toHaveBeenCalled();
  });

  it("SecurityError del selector = sin permiso", async () => {
    const usb = usbCon([], async () => {
      throw domError("SecurityError", "Must be handling a user gesture to show a permission request.");
    });
    const r = await imprimirPorUsb(async () => prn(10), { usb, ua: UA_ANDROID });
    expect(r).toMatchObject({ ok: false, motivo: "sin-permiso" });
  });

  it("si la hoja no baja, devuelve el porqué del servidor y no toca la impresora", async () => {
    const { d } = impresora();
    const usb = usbCon([d], async () => d);
    const r = await imprimirPorUsb(async () => "Sin señal: no se pudo bajar la hoja.", { usb, ua: UA_ANDROID });
    expect(r).toMatchObject({ ok: false, motivo: "bajada", mensaje: "Sin señal: no se pudo bajar la hoja." });
    expect(d.open).not.toHaveBeenCalled();
  });

  it("iPhone y Firefox: dice qué hacer en vez de fallar", async () => {
    const iphone = await imprimirPorUsb(async () => prn(10), { usb: undefined, ua: UA_IPHONE });
    expect(iphone).toMatchObject({ ok: false, motivo: "sin-webusb", android: false });
    expect(iphone.ok ? "" : iphone.mensaje).toContain("iPhone");
    const firefox = soporteImpresionDirecta(undefined, UA_FIREFOX);
    expect(firefox).toMatchObject({ puede: false, android: true });
    expect(firefox.mensaje).toContain("Chrome");
    expect(soporteImpresionDirecta(undefined, "Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0").mensaje).toContain(".prn");
  });

  it("con el envío roto devuelve el archivo para las salidas (bajar el .prn / RawBT)", async () => {
    const { d } = impresora({
      transferOut: async () => {
        throw domError("NetworkError", "A transfer error has occurred.");
      },
    });
    const usb = usbCon([d], async () => d);
    const archivo = prn(10);
    const r = await imprimirPorUsb(async () => archivo, { usb, ua: UA_ANDROID });
    expect(r).toMatchObject({ ok: false, motivo: "desconectada", android: true });
    expect(r.archivo).toBe(archivo);
  });
});

describe("enviarPorUsb", () => {
  it("parte en bloques de 4 KB: 10 000 bytes = 4096 + 4096 + 1808", async () => {
    const { d, enviados } = impresora();
    const r = await enviarPorUsb(d, new Uint8Array(10_000));
    expect(r).toMatchObject({ ok: true, bytes: 10_000 });
    expect(BLOQUE_USB).toBe(4096);
    expect(enviados).toEqual([4096, 4096, 1808]);
    expect(d.transferOut).toHaveBeenCalledWith(1, expect.any(Uint8Array));
  });

  it("elige la configuración si el dispositivo no tiene ninguna, reclama la interfaz y cierra al terminar", async () => {
    const { d } = impresora({ configurada: false });
    await enviarPorUsb(d, new Uint8Array(5));
    expect(d.open).toHaveBeenCalledTimes(1);
    expect(d.selectConfiguration).toHaveBeenCalledWith(1);
    expect(d.claimInterface).toHaveBeenCalledWith(0);
    expect(d.selectAlternateInterface).not.toHaveBeenCalled();
    expect(d.releaseInterface).toHaveBeenCalledWith(0);
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it("cable sacado a mitad de la hoja: «desconectada» y aun así libera y cierra", async () => {
    let n = 0;
    const { d } = impresora({
      transferOut: async (_ep, data) => {
        if (++n === 2) throw domError("NotFoundError", "The device was disconnected.");
        return { bytesWritten: data.length, status: "ok" };
      },
    });
    const r = await enviarPorUsb(d, new Uint8Array(9000));
    expect(r).toMatchObject({ ok: false, motivo: "desconectada" });
    expect(r.ok ? "" : r.mensaje).toContain("cable OTG");
    expect(d.releaseInterface).toHaveBeenCalledTimes(1);
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it("interfaz tomada por otra app: no libera lo que no reclamó, pero cierra", async () => {
    const { d } = impresora();
    d.claimInterface.mockRejectedValueOnce(domError("NetworkError", "Unable to claim interface."));
    const r = await enviarPorUsb(d, new Uint8Array(5));
    expect(r).toMatchObject({ ok: false, motivo: "interfaz-tomada" });
    expect(r.ok ? "" : r.mensaje).toContain("RawBT");
    expect(d.releaseInterface).not.toHaveBeenCalled();
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it("si no se pudo abrir (Windows con su driver), no intenta cerrar", async () => {
    const { d } = impresora();
    d.open.mockRejectedValueOnce(domError("SecurityError", "Access denied."));
    const r = await enviarPorUsb(d, new Uint8Array(5));
    expect(r).toMatchObject({ ok: false, motivo: "interfaz-tomada" });
    expect(d.close).not.toHaveBeenCalled();
  });

  it("un «stall» se destraba una vez (clearHalt) y sigue", async () => {
    let n = 0;
    const { d } = impresora({
      transferOut: async (_ep, data) => (++n === 1 ? { bytesWritten: 0, status: "stall" } : { bytesWritten: data.length, status: "ok" }),
    });
    const r = await enviarPorUsb(d, new Uint8Array(100));
    expect(r).toMatchObject({ ok: true, bytes: 100 });
    expect(d.clearHalt).toHaveBeenCalledWith("out", 1);
    expect(d.transferOut).toHaveBeenCalledTimes(2);
  });

  it("si la impresora no recibe todo, no lo da por impreso", async () => {
    const { d } = impresora({ transferOut: async (_ep, data) => ({ bytesWritten: Math.min(data.length, 3000), status: "ok" }) });
    const r = await enviarPorUsb(d, new Uint8Array(4096));
    expect(r).toMatchObject({ ok: false, motivo: "fallo" });
    expect(r.ok ? "" : r.mensaje).toContain("3000 de 4096");
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it("un aparato sin interfaz de impresora no se abre", async () => {
    const { d } = impresora({
      config: { configurationValue: 1, interfaces: [{ interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 8, endpoints: [{ endpointNumber: 1, direction: "out", type: "bulk" }] }] }] },
    });
    const r = await enviarPorUsb(d, new Uint8Array(5));
    expect(r).toMatchObject({ ok: false, motivo: "sin-interfaz" });
    expect(d.open).not.toHaveBeenCalled();
  });
});

describe("interfazDeImpresora y RawBT", () => {
  it("saltea la interfaz del fabricante (clase 255) y toma la de impresora con su alterna", () => {
    const { d } = impresora({
      config: {
        configurationValue: 2,
        interfaces: [
          { interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 255, endpoints: [{ endpointNumber: 3, direction: "out", type: "bulk" }] }] },
          {
            interfaceNumber: 1,
            alternates: [
              { alternateSetting: 0, interfaceClass: 7, endpoints: [{ endpointNumber: 4, direction: "out", type: "interrupt" }] },
              { alternateSetting: 1, interfaceClass: 7, endpoints: [{ endpointNumber: 5, direction: "out", type: "bulk" }] },
            ],
          },
        ],
      },
    });
    expect(interfazDeImpresora(d)).toEqual({ configuracion: 2, interfaz: 1, alterna: 1, endpoint: 5 });
  });

  it("intent de RawBT con el .prn en base64", () => {
    expect(urlIntentRawbt(new Uint8Array([0x1b, 0x40]))).toBe("intent:base64,G0A=#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;");
  });
});

describe("X-Recortados: los valores que no entran en su casillero", () => {
  it("el aviso dice cuántos; 0 o sin cabecera, nada", () => {
    expect(avisoRecortados(0)).toBeNull();
    expect(avisoRecortados(undefined)).toBeNull();
    expect(avisoRecortados(1)).toBe("1 valor no entra en su casillero: revisa la disposición.");
    expect(avisoRecortados(3)).toBe("3 valores no entran en su casillero: revisa la disposición.");
  });

  it("bajarSalida lee la cabecera de la respuesta", async () => {
    const fetchFalso = vi.fn(async () => new Response(new Uint8Array([0x1b, 0x40]), { status: 200, headers: { "X-Recortados": "2" } }));
    vi.stubGlobal("fetch", fetchFalso);
    try {
      const r = await bajarSalida("/api/x", "guia.prn");
      expect(r).toMatchObject({ ok: true, nombre: "guia.prn", recortados: 2 });
      fetchFalso.mockResolvedValueOnce(new Response("x", { status: 200 }));
      expect(await bajarSalida("/api/x", "g.pdf")).toMatchObject({ ok: true, recortados: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
