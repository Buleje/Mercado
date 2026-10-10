/**
 * Documentos v2 — cuántos ids entran en UNA llamada a las acciones en lote
 * (borrar, mover, etiquetar, favorito, estado; también carpetas).
 *
 * El tope existe porque cada request se resuelve con un `updateMany` más su
 * auditoría: la lista no puede ser infinita. Pero el tope NO puede ser el
 * límite de lo que el usuario tiene derecho a seleccionar. Con 200, marcar
 * "todos" en una carpeta de 292 y darle borrar devolvía un 400 crudo
 * (`Too big: expected array to have <=200 items`) y no borraba NADA.
 *
 * Ahora el cliente parte la selección en lotes de este tamaño y los manda uno
 * tras otro, y el servidor valida contra esta MISMA constante — así no hay
 * forma de que cliente y servidor se desfasen.
 */
export const IDS_POR_LOTE = 500;
