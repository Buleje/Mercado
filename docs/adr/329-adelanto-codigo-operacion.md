# ADR-329 · Código de operación, recibo manual y modalidad de planilla en Adelantos

**Fecha:** 2026-08-03 · **Estado:** aceptado · **Migración:** `prisma/manual-migrations/329-adelanto-operacion.sql`

## Contexto

El módulo de Adelantos identificaba cada registro sólo por su `id`: un cuid de 25
caracteres (`cmsdqdweb004803vz0pa3scj9`). Nadie lo dicta por teléfono, nadie lo
escribe en el recibo de papel, y buscarlo obliga a copiar y pegar desde otra
pantalla. En la práctica los adelantos se referenciaban de palabra («el de Juana,
el del martes»), que es exactamente lo que falla cuando hay dos.

Además faltaban dos cosas que el negocio ya usaba fuera del sistema:

- el **número del talonario de papel** que firma la persona, que quedaba en las
  notas cuando quedaba;
- el **adelanto de sueldo**, que había que forzar como «cuenta corriente» y así
  perdía el motivo — siendo de los más comunes acá.

## Decisión

### 1. `codigoOperacion` — el número que se dice en voz alta

Formato `ADL-<año>-<correlativo de 4 dígitos>`, **por tenant y por año**.

- Se **reinicia cada año**, como cualquier talonario, y el año adentro resuelve
  el «el 0007 ¿de cuál año?».
- El correlativo se calcula sobre los **códigos ya emitidos**, nunca con un
  `count(*)`: si un adelanto se cancela, el contador no puede retroceder y reusar
  un número que ya anda escrito en un papel.
- Índice único **parcial** `(tenantId, codigoOperacion) WHERE NOT NULL`: dos
  bodegas pueden tener su `ADL-2026-0001` sin pisarse, y los adelantos viejos
  —que no tienen código— no chocan entre sí.
- La búsqueda tolera cómo lo dicta una persona: `2026-7`, `adl-2026-7` y
  `ADL-2026-0007` encuentran lo mismo.

La lógica es pura y vive en `lib/adelantos/codigo-operacion.ts`, con tests.

### 2. `reciboManual` — el puente con el papel

Texto libre, indexado. Se busca igual que el código: quien tiene el recibo en la
mano no sabe a qué persona pertenece hasta encontrarlo.

### 3. `DESCUENTO_PLANILLA` — tercera modalidad

La mecánica de liquidación es la misma que cuenta corriente (entregas que
consumen el saldo); lo que cambia es de dónde sale la entrega: del pago del mes,
no de un producto. Por eso entra como valor del enum y no como un modelo aparte.

### 4. El tope de crédito pasa a poder forzarse, explícitamente

**Corrección de una contradicción introducida el mismo día.** La pantalla decía
«avisa, no bloquea» y pedía confirmación, pero el backend (ADR-118) rechazaba
igual: se confirmaba y aparecía un error. Ahora:

- el guard **sigue bloqueando por defecto** — un desborde por descuido es un
  desborde;
- `forzarLimite: true` sólo lo manda la pantalla **después** de que alguien
  confirmó un aviso con el monto exacto;
- cuando se fuerza, queda escrito en las notas del adelanto («Se autorizó por
  encima del límite (S/500.00; quedaba S/250.00)»), porque dentro de un mes nadie
  se acuerda de que fue una decisión y parece un error del sistema.

## Alternativas descartadas

- **Usar el `id` y mostrarlo cortado** (`…3scj9`): sigue sin poder dictarse y dos
  cuids pueden compartir sufijo.
- **Correlativo global (no por tenant)**: filtraría el volumen de un negocio a
  otro y obligaría a un contador central.
- **Tabla propia para el recibo de papel**: es un dato del adelanto, no una
  entidad; una tabla agregaría un join a cada lectura sin ganar nada.
- **Modelo aparte para adelanto de sueldo**: duplicaría toda la liquidación por
  un cambio de vocabulario.

## Consecuencias

- Los adelantos **anteriores a esta migración quedan sin código** (`NULL`). Se
  los sigue viendo y buscando por nombre y notas; el índice parcial lo permite.
  No se los numeró hacia atrás a propósito: un correlativo inventado hoy no
  coincide con ningún papel de entonces.
- `AdelantoModalidad` es un enum de Postgres: agregar valores es seguro, quitarlos
  no. `DESCUENTO_PLANILLA` viene para quedarse.
- La migración corre **por el pooler** con fallback automático — `DIRECT_URL`
  suele estar definida y aun así no resolver por DNS (gotcha del repo); el
  fallback tiene que ser por error de conexión, no por ausencia de la variable.
