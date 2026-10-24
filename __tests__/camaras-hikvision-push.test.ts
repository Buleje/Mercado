/**
 * El aviso que manda una Hikvision al «servidor de alarma» (ADR-411).
 *
 * El webhook respondía 400 «sin_imagen» al formato real: la foto viene en una
 * parte llamada `fielddetectionImage` (o como la nombre el firmware) junto a la
 * alerta en XML. Acá se prueba con ese formato, con la foto sin `filename` (que
 * el parser del estándar convierte en texto y corrompe) y con el latido que no
 * debe llenar el historial.
 */

import { describe, expect, it } from "vitest";
import {
  alertaDelAviso,
  boundaryDe,
  eventoDeAlerta,
  imagenDelAviso,
  leerAlerta,
  MAX_PARTES,
  notaDeAlerta,
  partesMultipart,
  tipoPorFirma,
} from "@/lib/camaras/hikvision-push";

/** Un JPEG mínimo con bytes que se rompen si pasan por texto (0xFF, 0x00, 0x0D 0x0A). */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x0d, 0x0a, 0x80, 0xfe, 0x0d, 0x0a, 0x2d, 0x2d, 0xff, 0xd9]);

const ALERTA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<ipAddress>10.20.30.40</ipAddress><channelID>1</channelID>
<dateTime>2026-10-01T10:15:00-05:00</dateTime>
<eventType>fielddetection</eventType><eventState>active</eventState>
<eventDescription>fielddetection alarm</eventDescription>
<channelName>Patio</channelName><targetType>human</targetType>
</EventNotificationAlert>`;

function multipart(boundary: string, partes: { cabeceras: string[]; datos: Buffer }[], salto = "\r\n"): Buffer {
  const trozos: Buffer[] = [];
  for (const p of partes) {
    trozos.push(Buffer.from(`--${boundary}${salto}${p.cabeceras.join(salto)}${salto}${salto}`, "latin1"));
    trozos.push(p.datos);
    trozos.push(Buffer.from(salto, "latin1"));
  }
  trozos.push(Buffer.from(`--${boundary}--${salto}`, "latin1"));
  return Buffer.concat(trozos);
}

describe("partesMultipart — el aviso real de la cámara", () => {
  const cuerpo = multipart("MIME_boundary", [
    {
      cabeceras: ['Content-Disposition: form-data; name="fielddetection"', "Content-Type: application/xml"],
      datos: Buffer.from(ALERTA_XML),
    },
    {
      cabeceras: [
        'Content-Disposition: form-data; name="fielddetectionImage"; filename="fielddetectionImage.jpg"',
        "Content-Type: image/jpeg",
        "Content-ID: image_1",
      ],
      datos: JPEG,
    },
  ]);
  const partes = partesMultipart(cuerpo, "multipart/form-data; boundary=MIME_boundary");

  it("separa la alerta y la foto con su nombre de firmware", () => {
    expect(partes.map((p) => p.nombre)).toEqual(["fielddetection", "fielddetectionImage"]);
  });

  it("encuentra la foto aunque no se llame file/image/picture, con los bytes intactos", () => {
    const imagen = imagenDelAviso(partes);
    expect(imagen?.tipo).toBe("image/jpeg");
    expect(imagen?.datos.equals(JPEG)).toBe(true);
  });

  it("lee la alerta: intrusión con blanco humano → persona", () => {
    const alerta = alertaDelAviso(partes);
    expect(alerta?.tipoEvento).toBe("fielddetection");
    expect(alerta && eventoDeAlerta(alerta)).toBe("persona");
    expect(alerta && notaDeAlerta(alerta)).toBe("fielddetection alarm · canal Patio");
  });
});

describe("partesMultipart — firmwares que se salen del estándar", () => {
  it("la foto SIN filename y con octet-stream igual sale como JPEG, sin corromperse", () => {
    const cuerpo = multipart("b", [
      { cabeceras: ['Content-Disposition: form-data; name="Picture"', "Content-Type: application/octet-stream"], datos: JPEG },
    ]);
    const imagen = imagenDelAviso(partesMultipart(cuerpo, 'multipart/form-data; boundary="b"'));
    expect(imagen?.tipo).toBe("image/jpeg");
    expect(imagen?.datos.equals(JPEG)).toBe(true);
  });

  it("acepta saltos LF pelados", () => {
    const cuerpo = multipart(
      "x",
      [{ cabeceras: ['Content-Disposition: form-data; name="img"; filename="a.jpg"', "Content-Type: image/jpeg"], datos: JPEG }],
      "\n",
    );
    expect(imagenDelAviso(partesMultipart(cuerpo, "multipart/form-data; boundary=x"))?.datos.equals(JPEG)).toBe(true);
  });

  it("el formulario del panel («Subir a mano», campo file) sigue entrando", () => {
    const cuerpo = multipart("----WebKitFormBoundaryAbc", [
      { cabeceras: ['Content-Disposition: form-data; name="file"; filename="foto.jpg"', "Content-Type: image/jpeg"], datos: JPEG },
    ]);
    const partes = partesMultipart(cuerpo, "multipart/form-data; boundary=----WebKitFormBoundaryAbc");
    expect(imagenDelAviso(partes)?.datos.equals(JPEG)).toBe(true);
    expect(alertaDelAviso(partes)).toBeNull();
  });

  it("sin boundary o sin partes no inventa nada", () => {
    expect(boundaryDe("multipart/form-data")).toBeNull();
    expect(partesMultipart(Buffer.from("hola"), "multipart/form-data")).toEqual([]);
    expect(imagenDelAviso([])).toBeNull();
  });

  it("un texto no es una foto", () => {
    expect(tipoPorFirma(Buffer.from("<xml/>"))).toBeNull();
  });
});

describe("leerAlerta / eventoDeAlerta", () => {
  it("el latido (videoloss inactive) se lee como alerta: sin foto, el webhook contesta 200 sin escribir", () => {
    const latido = leerAlerta(ALERTA_XML.replace(/fielddetection/g, "videoloss").replace(">active<", ">inactive<"));
    expect(latido?.tipoEvento).toBe("videoloss");
    expect(latido?.estado).toBe("inactive");
  });

  it("lee el formato JSON de los firmwares nuevos", () => {
    const alerta = leerAlerta(
      JSON.stringify({ ipAddress: "1.2.3.4", eventType: "linedetection", eventState: "active", channelName: "Portón" }),
    );
    expect(alerta?.tipoEvento).toBe("linedetection");
    expect(alerta && eventoDeAlerta(alerta)).toBe("movimiento");
  });

  it("traduce la jerga de Hikvision", () => {
    const base = { estado: "active", descripcion: null, canal: null };
    expect(eventoDeAlerta({ ...base, tipoEvento: "VMD", objetivo: null })).toBe("movimiento");
    expect(eventoDeAlerta({ ...base, tipoEvento: "fielddetection", objetivo: "vehicle" })).toBe("vehiculo");
    expect(eventoDeAlerta({ ...base, tipoEvento: "shelteralarm", objetivo: null })).toBe("otro");
  });

  it("lo que no es una alerta devuelve null", () => {
    expect(leerAlerta("")).toBeNull();
    expect(leerAlerta("{roto")).toBeNull();
    expect(leerAlerta("<html>hola</html>")).toBeNull();
    expect(leerAlerta(JSON.stringify({ hola: 1 }))).toBeNull();
  });
});

describe("cuerpos hostiles (revisión 2026-10-01)", () => {
  it("espacios sin cierre no cuelgan el proceso (el patrón viejo tardaba 19 s con 4 000)", () => {
    const hostil = `<EventNotificationAlert><eventType>${" ".repeat(20_000)}x`;
    const t0 = performance.now();
    leerAlerta(hostil);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("los espacios alrededor del valor se recortan igual", () => {
    expect(leerAlerta("<EventNotificationAlert><eventType>  VMD \n</eventType></EventNotificationAlert>")?.tipoEvento).toBe("VMD");
  });

  it("100 000 delimitadores vacíos dan como mucho MAX_PARTES partes", () => {
    const cuerpo = Buffer.from("--a\r\n\r\n".repeat(100_000) + "--a--");
    expect(partesMultipart(cuerpo, "multipart/form-data; boundary=a").length).toBeLessThanOrEqual(MAX_PARTES);
  });

  it("un texto de más de 64 KB no se interpreta como alerta", () => {
    expect(leerAlerta(`<EventNotificationAlert><eventType>VMD</eventType>${"x".repeat(70_000)}</EventNotificationAlert>`)).toBeNull();
  });
});
