import { writeFileSync } from "node:fs";
import { armarReporteForestal } from "@/lib/forestal/reporte-diario-armado";
const personas = [
  { nombre: "Comercial Los Pinos", adelantos: 4500, madera: 2180.5, total: 6680.5 },
  { nombre: "Transportes Yarina", adelantos: 3200, madera: 0, total: 3200 },
  { nombre: "Rosa Huamán", adelantos: 0, madera: 1845.2, total: 1845.2 },
  { nombre: "Aserrío San Juan", adelantos: 950, madera: 420, total: 1370 },
  { nombre: "Pedro Saavedra", adelantos: 600, madera: 0, total: 600 },
];
const total = personas.reduce((s, p) => s + p.total, 0);
const r = armarReporteForestal({
  negocio: "Maderera El Bosque", nombreReporte: "Parte del día", fecha: "2026-11-03", rango: "hoy",
  desde: "2026-11-03", hasta: "2026-11-03", panelUrl: "https://buleje.vercel.app/admin",
  cobrar: { total, personas, mas: 0, otrasMonedas: [], truncado: false },
} as any, ["cobrar"]);
const out = process.argv[2];
writeFileSync(out + "/correo.html", r.html);
writeFileSync(out + "/whatsapp.txt", r.texto);
console.log(r.asunto, "| total", total.toFixed(2)); console.log(r.texto);
