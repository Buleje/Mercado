import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ALARMA_HABILITADA,
  alarmaQuizaSonando,
  ERROR_RED_EZVIZ,
  esUrlDeFotoEzviz,
  leerCapacidades,
  leerEstado,
  leerMicrofono,
  leerRespuestaEzviz,
  leerSalud,
  leerUrlFoto,
  pedidoAlarma,
  pedidoArmado,
  pedidoMicrofono,
  pedidoMover,
  pedidoParar,
  traducirErrorEzviz,
} from "@/lib/camaras/ezviz-control";
import { cifrarComoHik, decodificarFotoHik, estaCifrada } from "@/lib/camaras/ezviz-foto";
import { medidaQueEntra } from "@/components/admin/forestal/camaras/reproductor-nube";

/**
 * Controles por EZVIZ Open (ADR-472) con las respuestas REALES de las dos
 * DS-2CFSP4/4G de Blas medidas el 05-10 (`docs/camaras/funciones-hikvision.md`).
 */

/** `capacity` real (recortado a lo que se lee). */
const CAPACIDAD_REAL = {
  ptz_45: "1",
  ptz_left_right: "1",
  ptz_top_bottom: "1",
  support_active_defense: "1",
  support_audio_onoff: "1",
  support_capture: "1",
  support_defence: "1",
  support_ptz: "1",
  support_talk: "1",
};

describe("pedidos (doc EZVIZ + ezuikit-js)", () => {
  it("mover: dirección 0-3 y velocidad nunca 0 (Hikvision)", () => {
    expect(pedidoMover("GU2373717", "right")).toEqual({
      ruta: "/api/lapp/device/ptz/start",
      campos: { deviceSerial: "GU2373717", channelNo: "1", direction: "3", speed: "1" },
    });
    expect(pedidoMover("X", "up", 2).campos).toMatchObject({ direction: "0", speed: "2" });
    expect(pedidoMover("X", "down").campos.direction).toBe("1");
    expect(pedidoMover("X", "left").campos.direction).toBe("2");
  });

  it("frenar con y sin la dirección que se movía", () => {
    expect(pedidoParar("X", "left")).toEqual({
      ruta: "/api/lapp/device/ptz/stop",
      campos: { deviceSerial: "X", channelNo: "1", direction: "2" },
    });
    expect(pedidoParar("X").campos).not.toHaveProperty("direction");
  });

  it("armado 1/0, micrófono 1/0", () => {
    expect(pedidoArmado("X", true).campos.isDefence).toBe("1");
    expect(pedidoArmado("X", false).campos.isDefence).toBe("0");
    expect(pedidoMicrofono("X", false)).toEqual({
      ruta: "/api/lapp/camera/video/sound/set",
      campos: { deviceSerial: "X", enable: "0" },
    });
  });

  it("alarma: 2 dispara, 1 apaga, serie en el header", () => {
    expect(pedidoAlarma("X", true)).toEqual({
      ruta: "/api/v3/device/defence",
      cabeceras: { deviceSerial: "X" },
      campos: { status: "2" },
    });
    expect(pedidoAlarma("X", false).campos.status).toBe("1");
  });
});

describe("respuestas", () => {
  it("lee las dos formas de EZVIZ (lapp y v3)", () => {
    expect(leerRespuestaEzviz({ code: "200", msg: "Operation succeeded" })).toEqual({
      ok: true,
      valor: {},
    });
    expect(
      leerRespuestaEzviz({ meta: { code: 200, message: "Operation succeeded", moreInfo: null } })
        .ok,
    ).toBe(true);
    const v3 = leerRespuestaEzviz({
      meta: { code: 60020, message: "the device does not support the signaling" },
    });
    expect(v3).toMatchObject({ ok: false, error: { codigo: "60020", tipo: "no_soporta" } });
    const hablar = leerRespuestaEzviz({ code: "20018", msg: "The user doesn't own the device." });
    expect(hablar).toMatchObject({ ok: false, error: { tipo: "permiso" } });
    expect(leerRespuestaEzviz("<html>")).toMatchObject({ ok: false, error: { codigo: "FORMA" } });
  });

  it("topes del movimiento y token vencido", () => {
    expect(traducirErrorEzviz("60005").mensaje).toMatch(/tope de la derecha/);
    expect(traducirErrorEzviz("10002").tipo).toBe("token");
    expect(traducirErrorEzviz("99999", "raro").mensaje).toMatch(/raro.*99999/);
  });

  it("capacidades de la DS-2CFSP4/4G: mueve, detecta, alarma, foto, micrófono", () => {
    expect(leerCapacidades(CAPACIDAD_REAL)).toEqual({
      mover: true,
      moverVertical: true,
      deteccion: true,
      alarma: true,
      foto: true,
      microfono: true,
    });
    expect(leerCapacidades({ support_ptz: "0", ptz_left_right: "1" }).mover).toBe(false);
    expect(leerCapacidades(null).mover).toBe(false);
  });

  it("estado, batería, microSD y micrófono reales", () => {
    expect(leerEstado({ model: "DS-2CFSP4/4G", status: 1, defence: 1, isEncrypt: 1 })).toEqual({
      enLinea: true,
      deteccion: true,
      modelo: "DS-2CFSP4/4G",
    });
    expect(leerEstado({ defence: 0 }).deteccion).toBe(false);
    expect(leerEstado({}).deteccion).toBeNull();
    expect(leerSalud({ battryStatus: 94, diskState: "2---------------" })).toEqual({
      bateria: 94,
      tarjeta: "sin_formato",
    });
    expect(leerSalud({ battryStatus: -1, diskState: "0---" })).toEqual({
      bateria: null,
      tarjeta: "ok",
    });
    expect(leerMicrofono({ deviceSerial: "X", channelNo: 1, enable: 1 })).toBe(true);
    expect(leerMicrofono([{ enable: "0" }])).toBe(false);
  });

  it("la foto sólo se baja de https://*.ezvizlife.com", () => {
    const real = "https://pmssa1.ezvizlife.com:8444/image/oracle/pic/abc/common?Expires=1";
    expect(leerUrlFoto({ picUrl: real })).toEqual({ ok: true, valor: real });
    for (const mala of [
      "http://pmssa1.ezvizlife.com/x",
      "https://ezvizlife.com.evil.io/x",
      "https://user:pw@pmssa1.ezvizlife.com/x",
      "https://169.254.169.254/latest",
      "file:///etc/passwd",
    ])
      expect(esUrlDeFotoEzviz(mala)).toBe(false);
    expect(leerUrlFoto({ picUrl: "https://evil.io/x.jpg" }).ok).toBe(false);
  });
});

describe("foto cifrada (hikencodepicture)", () => {
  it("descifra con el código, rechaza otro código y deja pasar la foto sin cifrar", async () => {
    const jpeg = await sharp({
      create: { width: 32, height: 18, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();
    const cifrada = cifrarComoHik(jpeg, "ABCDEF");
    expect(estaCifrada(cifrada)).toBe(true);
    const ok = decodificarFotoHik(cifrada, "ABCDEF");
    expect(ok.ok && ok.valor.equals(jpeg)).toBe(true);
    expect(decodificarFotoHik(cifrada, "ZZZZZZ")).toMatchObject({ ok: false });
    expect(decodificarFotoHik(cifrada, null)).toMatchObject({ ok: false });
    const plana = decodificarFotoHik(jpeg, null);
    expect(plana.ok && plana.valor.equals(jpeg)).toBe(true);
  });
});

describe("tamaño del video", () => {
  it("16:9 que entra: manda el ancho en la caja 16:9 y el alto en pantalla completa", () => {
    expect(medidaQueEntra(1280, 720)).toEqual({ ancho: 1280, alto: 720 });
    /* Celular acostado 800×360: si mandara el ancho, el video mediría 450 de alto. */
    expect(medidaQueEntra(800, 360)).toEqual({ ancho: 640, alto: 360 });
    expect(medidaQueEntra(640, 0)).toEqual({ ancho: 640, alto: 360 });
  });
});

describe("alarma: deshabilitada y «quizá sonando»", () => {
  it("la alarma sale DESHABILITADA (se habilita tras probarla en el sitio)", () => {
    expect(ALARMA_HABILITADA).toBe(false);
  });

  it("falla dudosa = quizá sonando; rechazo seguro = no", () => {
    expect(alarmaQuizaSonando(ERROR_RED_EZVIZ)).toBe(true);
    expect(alarmaQuizaSonando(traducirErrorEzviz("20006"))).toBe(true);
    expect(alarmaQuizaSonando(traducirErrorEzviz("20008"))).toBe(true);
    expect(alarmaQuizaSonando(traducirErrorEzviz("99999", "raro"))).toBe(true);
    expect(alarmaQuizaSonando(traducirErrorEzviz("20007"))).toBe(false);
    expect(alarmaQuizaSonando(traducirErrorEzviz("20018"))).toBe(false);
    expect(alarmaQuizaSonando(traducirErrorEzviz("10002"))).toBe(false);
  });
});
