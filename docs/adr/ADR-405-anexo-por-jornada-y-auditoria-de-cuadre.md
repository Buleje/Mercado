# ADR-405 — Un Anexo 04 por jornada, y la auditoría de cuadre

- **Fecha:** 2026-09-09
- **Estado:** aceptado
- **Pedido por:** Brandon — «si un bloque tiene 2 o más días, quiero que cada día tenga su propio
  Anexo 04, y también poder juntarlos y verlos todos en uno o individualmente; una auditoría general
  que toda la distribución —aserrada, lotes, rolliza— cuadre según medidas y tipo; y en los
  reprocesos, el desglose de las medidas que se usarán, igual que en los bloques distribuidos».
- **Depende de:** la distribución de rolliza sobre lo aserrado (jornadas, `repartirPorDia`),
  ADR-404 (reprocesos sugeridos).

## Contexto

El Anexo 04 se emitía **por bloque**. Pero el Libro de Operaciones se registra **día por día** —por
eso cada bloque declara sus jornadas y el reparto las parte en piezas enteras—, así que el papel que
respalda el día 2 no puede traer las piezas del día 1. Con un bloque de tres jornadas, el único
anexo posible mezclaba las tres.

Y a medida que la pantalla creció —jornadas, overrides por línea, aserrada directa, reprocesos
sugeridos— aparecieron cuentas que **tienen que dar por construcción** y que nadie estaba
verificando: que la línea cierre con sus medidas, que las jornadas sumen el bloque, que lo cubicado
sea lo amparado más lo que falta. Ninguna la ve `tsc`; todas terminan en un papel que se firma.

## Decisión

### 1. El Anexo 04 se emite por jornada, por bloque, o juntando lo que se elija

Cada día trae dos controles propios: **«Anexo del día»** (el papel de esa jornada, sólo con sus
piezas) y **«juntar»** (tildarlo para el anexo conjunto). El botón del bloque entero sigue donde
estaba.

La selección conjunta pasa a guardar claves `bloqueId` **o** `bloqueId#dia`. Las claves viejas
—sólo el id— siguen valiendo, así que lo que estuviera tildado antes no se pierde.

**Elegir un día suelta el bloque entero, y al revés** (`alternarClaveAnexo`): marcar los dos
duplicaría esas piezas en el papel. Y la capacidad del conjunto se cuenta **una vez por bloque**
aunque se elijan tres de sus días — el respaldo no ampara tres veces.

### 2. La auditoría de cuadre: cinco cuentas que tienen que dar

Se suman a `revisarDistribucion`, el panel «Revisar» que ya existía:

| Qué | Severidad | Por qué |
|---|---|---|
| La línea vs. la suma de sus medidas | error | El Anexo declararía un total que su propio detalle no sostiene |
| Las jornadas vs. el bloque (m³ y piezas) | error | Cada día se registra por separado: si no suman, un papel declara madera que otro no tiene |
| El bloque vs. su capacidad, con margen de cierre | aviso | Más de 50 litros no es diferencia de medición, es madera que necesita otro bloque |
| Cubicado = amparado + faltante (en pie tablar) | error | Si no cierra, hay piezas contadas dos veces o ninguna |
| Reprocesos que el respaldo da por hecho | aviso | Un bloque de comercial amparando paquetería es un reproceso que el Libro no tiene (ADR-404) |

Una línea con `m3Declarado` **no** se audita contra sus medidas: ahí el operario declaró el total a
conciencia y la pantalla ya lo marca.

### 3. Los reprocesos, con sus medidas

Cada conversión sugerida se despliega y muestra las escuadrías que salen —`6×6×10 · 4 pzas ·
0.283 m³ · 120 PT`—, igual que los bloques distribuidos. El aserrador corta escuadrías, no metros
cúbicos: sin la medida, la sugerencia dice un volumen que nadie puede mandar a la sierra.

Van **plegadas** por la misma razón que en los bloques: desplegadas son cuatro veces las filas y se
pierde la lectura de cuánto ampara cada tipo.

## Consecuencias

- Un bloque de tres jornadas puede emitir tres anexos, uno conjunto de dos días, o el del bloque
  entero. La misma madera nunca entra dos veces al mismo papel.
- El panel «Revisar» ahora mezcla dos clases de hallazgo: los de **datos que faltan** (sin GTF, sin
  permiso) y los de **cuentas que no cierran**. Los segundos deberían ser siempre cero; si aparecen,
  hay un bug del reparto y no un dato mal cargado.
- La auditoría de medidas es sobre lo que la pantalla ya calculó: no vuelve a cubicar. Si el motor
  se equivoca igual en las dos puntas, la revisión no lo ve — para eso está el cruce con el Libro.

## Alternativas

- **Un anexo por bloque y que el día se aclare a mano en observaciones.** Es lo que se venía
  haciendo; el papel no puede depender de una nota escrita a mano para saber a qué jornada
  corresponde.
- **Auditar dentro del motor de reparto.** El motor decide; la revisión es un segundo par de ojos.
  Mezclarlos deja al mismo código juzgándose a sí mismo.
