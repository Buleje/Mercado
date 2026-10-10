# Verificar por el camino del usuario, no por el mío

> Reglas ganadas con bugs reales (importador CTP, 2026-08-04). Versión corta 2026-10-02; la historia completa está en `git log -p` de este archivo. Esto no pide MÁS gates: pide el gate que importa en vez del que siempre da verde.

1. **El script propio no es verificación.** Si hay camino de UI (modal → endpoint → DB), el gate es ese camino entero. Un script que llamó al parser dio 60 filas; el usuario vio 9 (el endpoint deduplicaba por GTF). Si no se puede llegar al final, decirlo.
2. **Un derivado nunca se presenta como el dato.** Antes de calcular un total, buscar si la fuente ya lo publica (el Cuadro Resumen 2 declaraba 152.922; yo estimé 167.798). Si se muestra un derivado, decir que lo es.
3. **«Cuadra» solo tras cruzar con la fuente**: primero verificar que la fórmula del propio cuadro cierre (`A+B+D−C−E = final`); si no cierra, la lectura está mal.
4. **Tolerancias en la unidad del negocio**, nunca en el epsilon del float (0,0001 m³ dio 7 rojos falsos: siete rojos falsos enseñan a ignorar la lista).
5. **Los gates estáticos no ven bugs de semántica de datos** (tsc + lint + vitest verdes con 51 trozas descartadas): correr los datos REALES y mirar los totales. Un número inexplicable es bug hasta demostrar lo contrario.
6. **«Salió mal» → medir antes de opinar**: primero el SELECT/fetch del estado, después la hipótesis.
7. **Descartar una hipótesis se reporta** igual que confirmarla: evita que el próximo turno la intente de nuevo.
