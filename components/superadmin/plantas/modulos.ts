/**
 * Nombres de los módulos (especializaciones) para la cabecera de la ficha.
 *
 * `lib/specializations.ts` tiene los nombres largos pero importa prisma: no
 * entra en el navegador. Este mapa es el corto que se lee de un vistazo; una
 * clave nueva que no esté acá sale con un nombre genérico, nunca con la clave.
 */
import type { SpecializationKey } from "@/lib/specializations";

const NOMBRE: Record<SpecializationKey, string> = {
  "spec:forestal:ctp-libro": "Libro CTP",
  "spec:forestal:tramites": "Trámites forestales",
  "spec:forestal:lotes": "Lotes de producción",
  "spec:forestal:loth-libro": "Libro de operaciones TH",
  "spec:forestal:gtf-emisor": "Guías de transporte",
  "spec:forestal:herramientas": "Herramientas forestales",
  "spec:agricola:cacao-acopio": "Acopio de cacao",
  "spec:salud:recetas-medicas": "Recetas médicas",
  "spec:textil:cuero": "Trazabilidad de cuero",
};

export function nombreDeModulo(clave: string): string {
  return (NOMBRE as Record<string, string>)[clave] ?? "Otro módulo";
}

/** «Libro CTP, Lotes de producción y 3 módulos más» + la lista entera para el `title`. */
export function resumenDeModulos(claves: readonly string[], mostrar = 2): { texto: string; todos: string } {
  const nombres = claves.map(nombreDeModulo);
  const todos = nombres.join(", ");
  if (nombres.length <= mostrar + 1) return { texto: todos, todos };
  const resto = nombres.length - mostrar;
  return { texto: `${nombres.slice(0, mostrar).join(", ")} y ${resto} módulos más`, todos };
}
