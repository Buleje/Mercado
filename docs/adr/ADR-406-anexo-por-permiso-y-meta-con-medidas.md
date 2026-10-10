# ADR-406 — El Anexo 04 por permiso, y la meta con sus medidas

- **Fecha:** 2026-09-09
- **Estado:** aceptado
- **Pedido por:** Brandon — «quiero que la meta también tenga sus medidas y cuadre; y un apartado de
  anexo cuadro para poder escoger el anexo y que ahí se junte todo —medidas, tipo, todo— de ese
  anexo: se unifica todo del permiso con todas las medidas juntas, ojo que tiene que cuadrar bien,
  así poder escoger entre otros permisos».
- **Depende de:** ADR-405 (anexo por jornada, auditoría de cuadre), ADR-404 (reprocesos sugeridos).

## Contexto

El Anexo 04 se podía emitir por bloque y —desde el ADR-405— por jornada, o juntando lo que se
tildara a mano. Pero **el papel se presenta contra un título habilitante**: un permiso puede tener
cuatro guías y lo que se declara es todo lo que ese permiso ampara. Armarlo obligaba a saber de
memoria qué bloque era de cuál y tildarlos uno por uno.

Y la meta de mix decía «50 % de comercial» sin decir **de qué medidas** está hecho ese porcentaje.
Una meta no se cumple con metros cúbicos: se cumple cortando escuadrías, y sin verlas no se sabe
qué pedirle a la sierra.

## Decisión

### 1. Un apartado «Anexo 04 por permiso»

Los permisos presentes en la distribución se listan con su volumen; se elige uno y la pantalla arma
su papel: **todas las piezas de todos sus bloques**, con las medidas iguales sumadas en una sola
línea (dos bloques que cortaron 6×6×10 declaran una fila, no dos — `unificarPorMedida`).

La tabla es la del anexo: **especie · tipo · medida · piezas · pie tablar · m³**, con su total. De
ahí sale el Anexo 04 con un botón.

### 2. El cuadre se muestra antes que el detalle

Cada permiso trae `cuadra`: la suma de sus medidas contra lo que sus bloques dicen amparar. Si da,
lo dice en una línea («las 3 medidas suman 2.736 m³, lo mismo que amparan GTF-0231 · GTF-0232»); si
no da, la línea se pone ámbar con la diferencia y el nombre de los bloques. **Un papel que declara
un total que su propio detalle no sostiene no se imprime.**

### 3. Lo que no se inventa

- Los bloques **sin permiso** van a su propio grupo, «Sin permiso declarado». Repartirlos entre los
  que sí lo tienen sería declarar un origen que nadie escribió.
- Un bloque que **no amparó nada** no abre un anexo vacío.
- Las especies no se mezclan en una fila: el Anexo 04 abre un bloque por especie × tipo, y
  `unificarPorMedida` ya separa por esas dos claves.

### 4. La meta, con las medidas de las que está hecha

Sección propia —**fuera del apartado de reprocesos**, porque la meta se mira haya o no reprocesos
que sugerir— con el porcentaje de hoy, el pie tablar que falta, y desplegable: cada medida de ese
tipo con sus piezas, su pie tablar, su m³ y qué parte del tipo aporta.

El detalle sale de **las mismas piezas que evalúa la meta** (`medidasDeMeta` sobre el lote
cubicado), no de otra fuente: así el porcentaje de arriba y la tabla de abajo no pueden
contradecirse. Eso es lo que hace que «cuadre».

## Consecuencias

- Emitir el papel de un título habilitante pasa de «acordarse de qué bloques eran» a un clic.
- Aparece una cuarta forma de armar el anexo (bloque · jornada · selección a mano · permiso). Las
  cuatro salen del mismo `piezasDeGrupos`, así que declaran lo mismo; lo que cambia es el recorte.
- El cuadre por permiso es una lectura más de la misma cuenta que ya audita el panel «Revisar»
  (ADR-405): dos avisos del mismo problema, en el lugar donde cada uno se mira.
- La meta sigue siendo del **lote cubicado**, no de lo distribuido. Si falta cubicar, el porcentaje
  se mueve — es lo correcto, pero conviene saberlo al leerlo.

## Alternativas

- **Tildar los bloques del permiso a mano** (lo que ya existía). Funciona con dos bloques y falla
  con diez: obliga a recordar la relación permiso→bloque que la pantalla ya conoce.
- **Un anexo por permiso Y por especie.** El formato ya separa por especie × tipo adentro; partirlo
  antes daría dos papeles donde la ley pide uno.
- **Calcular las medidas de la meta desde lo distribuido.** Sería un segundo conjunto que puede no
  coincidir con el porcentaje de la meta — justo la contradicción que este ADR viene a evitar.
