/**
 * vision-falsa — un endpoint OpenAI-compatible de mentira para PROBAR el
 * circuito de visión del drive sin depender de ningún proveedor.
 *
 * No inventa nada sobre el negocio: contesta una descripción fija y, sobre
 * todo, verifica lo que casi siempre se rompe — que la imagen haya llegado
 * INCRUSTADA (data URL con bytes de verdad). Si llega vacía, responde 400 y la
 * prueba falla, que es lo que queremos.
 *
 * Uso: node scripts/dev-helpers/vision-falsa.mjs [puerto]
 * Después: DOC_VISION_BASE_URL="http://localhost:4599/v1" en .env.local
 */
import { createServer } from "node:http";

const puerto = Number(process.argv[2] ?? 4599);

const RESPUESTA = {
  summary: "Factura de Distribuidora El Roble por S/ 2,680.00",
  description:
    "Factura electrónica F001-00004321 emitida por Distribuidora El Roble S.A.C. (RUC 20512345678) a Bodega San Martín el 12 de marzo de 2026, por 20 sacos de arroz, 12 cajas de aceite y 8 sacos de azúcar, con un total de S/ 2,680.00 a crédito 30 días.",
  keyFacts: ["Total: S/ 2680.00", "IGV: S/ 408.81", "Condición: crédito 30 días"],
  tags: ["factura", "proveedor", "arroz"],
  entities: { orgs: ["Distribuidora El Roble S.A.C."], places: ["Pucallpa"], dates: ["2026-03-12"], amounts: ["S/ 2680.00"] },
  structured: { docType: "factura", ruc: "20512345678", razonSocial: "Distribuidora El Roble S.A.C.", numero: "F001-00004321", fecha: "2026-03-12", moneda: "PEN", total: 2680, igv: 408.81 },
  ocrText: "DISTRIBUIDORA EL ROBLE S.A.C. RUC 20512345678 FACTURA ELECTRONICA F001-00004321 TOTAL S/ 2680.00 Vence el 11/04/2026",
  sugerencia: { carpeta: null, vencimiento: "2026-04-11" },
};

createServer((req, res) => {
  if (!req.url?.endsWith("/chat/completions")) {
    res.writeHead(404).end("no");
    return;
  }
  let cuerpo = "";
  req.on("data", (c) => { cuerpo += c; });
  req.on("end", () => {
    let imagen = "";
    try {
      const payload = JSON.parse(cuerpo);
      imagen = payload?.messages?.[0]?.content?.find((p) => p.type === "image_url")?.image_url?.url ?? "";
    } catch { /* payload ilegible: cae en el 400 de abajo */ }

    const bytes = imagen.startsWith("data:") ? imagen.split(",")[1]?.length ?? 0 : 0;
    if (bytes < 500) {
      console.log(`✗ llegó sin imagen usable (${bytes} chars en base64)`);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "la imagen no llegó incrustada" } }));
      return;
    }
    console.log(`✓ imagen recibida: ${Math.round((bytes * 3) / 4 / 1024)} KB en base64`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(RESPUESTA) } }] }));
  });
}).listen(puerto, () => console.log(`vision-falsa escuchando en http://localhost:${puerto}/v1`));
