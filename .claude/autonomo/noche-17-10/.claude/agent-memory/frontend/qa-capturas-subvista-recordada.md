---
name: qa-capturas-subvista-recordada
description: qa-capturas con varios temas falla en el 2.º tema si los pasos cambiaron de subvista (el panel recuerda la última); y rutas reales de Me deben / Equipo de reparto
metadata:
  type: reference
---

- qa-capturas repite los pasos en cada tema, pero el panel RECUERDA la última subvista del usuario: si los pasos terminan en otra sección (p. ej. «Cada fiado»), el tema oscuro arranca ahí y el primer `esperar` vence a los 30 s (17-10). Volver a la subvista inicial al final de los pasos, o correr `--temas claro`.
- Rutas: Me deben = `/admin?tab=fiados` (abre «Quién debe», la lista de cobranza `FilaDeudor`; la tabla `FiadosDeudoresTabla` es «Cada fiado»). Equipo de reparto = `/admin?tab=pedidos&vista=reparto&sub=repartidores` (`?tab=delivery-partners` NO muestra la tabla con `[data-qa=abrir-ficha-repartidor]`).
- `parchear` compara el pathname EXACTO (o prefijo con `/*`): para la ficha del repartidor, un parche por id (`/api/delivery/partners/<id>/ficha`).
- main no tiene `DeliveryAssignment` (sólo `mi-pollo` tiene 1): la ficha se prueba con parche.
