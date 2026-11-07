# ADR-468 — T6 con motivo al importar una guía que SERFOR ya emitió

- **Estado:** aceptado (2026-10-04), ajustado el mismo día tras revisión independiente + seguridad (puntos 7-10). Construido y probado (`__tests__/loth-importar-guia-t6-con-motivo.test.ts`, 24 casos; vista previa por curl en `main`). Sin cambio de schema.
- **Relacionados:** ADR-461 (importar guías ya despachadas al Libro TH), ADR-459 (plantación: el techo es lo registrado), T9 con motivo (cupo de la especie, `loth_tala_sobre_cupo`), ADR-312 (la ficha del navegador no lleva el sello de «verificada»), ADR-114 (RLS de `ActivityLog`).
- **Pedido (Brandon, 04-10):** una guía que SERFOR ya emitió y verificó, pero que pasa lo autorizado, quedaba fuera del libro («No se puede importar, ni con motivo»). Eligió: para guías verificadas, admin o dueño la importan con motivo y queda el rastro para OSINFOR.

## Contexto

- **T6** (`ForestLothDB.enforceT6`, regla pura `lib/forestal/loth-t6.ts`): lo movilizado de una especie no puede pasar lo AUTORIZADO del POA (o lo REGISTRADO de una plantación). Es el tope legal y no admitía motivo en ningún camino.
- El importador (ADR-461) anota guías que **ya viajaron**. Si SERFOR emitió la guía, la madera ya salió: rechazarla no deshace el despacho, sólo deja el libro sin la guía — un libro que no cuadra con SNIFFS es peor ante OSINFOR que uno que muestra el exceso con su explicación.
- «Verificada» ya existe y la decide el SERVIDOR (`resolverFuente` en `lib/forestal/loth-importar-guia-fuentes.ts`): `serfor` = la ficha la trajo el SNIFFS por el N° de registro; `ctp` = la ficha que guardó un ingreso del Libro CTP del negocio; `ficha` (foto/PDF leída por la IA) = **no** verificada. El cuerpo del pedido no la trae (el schema ni la acepta).

## Decisión

1. **Sólo en el importador, sólo verificada, sólo admin o dueño, sólo con motivo.** `importarGuia` arma la excepción si `verificada` (del servidor) **y** `puedeExcederDespacho` (`puedePasarT6ConMotivo(auth.role)`, del JWT: `admin`/`owner`) **y** `motivoCupoValido(motivoSobreCupo)`. Si falta cualquiera: el mismo `T6_EXCESO_AUTORIZADO` de siempre.
2. **Un solo motivo** para T9 y T6: `ItemImportarGuia.motivoSobreCupo` (5 letras o más, limpio de invisibles). La pantalla pide un único campo y lo dice («Un solo motivo vale para la tala y el despacho»).
3. **La regla no se duplica.** `enforceT6` recibe un `Map` opcional (`excepcion`): con él, misma especie, mismo lock sobre `ForestPlanSpecies`, misma `medidaT6`, pero anota la troza (`anotarDespachoT6`) en vez de rechazar; el exceso lo calcula `excesosDelDespacho` con `excedeT6`. Sin el Map —despacho a mano, despacho con guía, producto en m³, la distribución— el código es el de antes, palabra por palabra.
4. **El rastro para OSINFOR, en la misma transacción:** `ActivityLog` `loth_despacho_sobre_autorizado` (entidad `ForestGtf`, la guía nueva) con GTF, registro SERFOR, especie, lo ya movilizado + lo de la guía = total, lo autorizado, el exceso en m³, el motivo y el usuario de la sesión. Si el evento no se escribe, la guía no entra. El Control del permiso marca el exceso por su cuenta (`exceso_autorizado` de `loth-extraccion`).
5. **No se toca la observación de la GTF** (`observacionGuia`): «Deshacer importación» reconoce una guía importada por ese texto exacto.
6. **Vista previa:** la ruta pasa `puedePasarT6` (JWT) a `ForestLothImportarDB.vistaPrevia` → `ContextoTanda.puedePasarT6`. `rehacerTanda`: verificada + rol → la guía queda `lista` con `t6ConMotivo` y las cuentas en `sobreAutorizado` (línea roja + campo de motivo en `LothImportarGuiasCupo`); verificada sin rol → bloqueada «Sólo el dueño o el administrador pueden importarla, con motivo»; no verificada → bloqueada «No se puede importar, ni con motivo» (igual que antes).

7. **Lo que se exime es lo que SERFOR verificó** (`porQueNoAplicaExcepcionT6`, `lib/forestal/loth-importar-guia.ts`, la misma en vista previa e importación): (a) el título de la guía resuelve (`detectarPermiso`) al plan de destino —o lo cuenta entre los candidatos si el código es ambiguo—: «verificada» prueba que la guía existe, no que sea de ese permiso; (b) cada troza que YA estaba en el Trozado mide en el libro lo que dice la guía (± `TOLERANCIA_VOLUMEN_M3` = 0,01 m³): el despacho cuenta la línea del libro, que pudo escribirse a mano. Si no: T6 duro, y el aviso y el rechazo dicen por qué («Aunque está verificada en SERFOR, el título de la guía (X) no es el del permiso elegido (Y)» / «… 25 m³ en el Trozado, 2,5 m³ en la guía»).
8. **`confirmaDespacho`** en el ítem: la pantalla lo manda sólo si la vista mostró `t6ConMotivo` y hay motivo. Es consentimiento, no permiso (el permiso sigue siendo rol + verificada + motivo): un motivo escrito para T9 no destraba un exceso de T6 que nadie vio.
9. **Aporte propio:** en una tanda el exceso es acumulado; el evento dice además cuánto pone ESTA guía (`min(despacha, exceso)`).
10. **IP y navegador** (`ActivityLog.ipAddress`/`userAgent`, `getClientIp` + `user-agent`) en `loth_despacho_sobre_autorizado` y también en `loth_tala_sobre_cupo` (alta e importador).

## Alternativas descartadas

- **T6 con motivo en todo despacho:** abriría el tope legal a guías que el propio sistema emite (el CTP y el despacho a mano sí pueden frenarse antes de que la madera salga).
- **Aceptar también la ficha de foto/PDF:** la IA puede leer mal un volumen; sin la verificación de SERFOR el exceso podría ser un error de lectura convertido en infracción declarada.
- **Importar sin motivo y sólo avisar:** el exceso es la infracción que sanciona OSINFOR; quien lo asienta tiene que firmarlo con su usuario y su explicación.
- **Un booleano `verificada` en el cuerpo:** cualquiera con sesión lo mandaría en `true`.

## Consecuencias

- El libro puede mostrar movilizado > autorizado para una especie; el Control del permiso lo marca en rojo y el evento explica por qué.
- El encargado no ve el motivo (la vista previa no se lo ofrece y la ruta de importar ya es sólo de admin y dueño: 403).
- Deshacer la importación anula la guía y sus despachos; el evento queda como historia.
