"""Página 6 del folleto «Buleje para aserraderos»: «Quién le debe, cada tarde» (03-11).

Uso: python3 armar_p6.py <folleto de 5 págs> <correo.png> <whatsapp.png> <salida.pdf>
Las imágenes salen de armar-correo.mts (datos INVENTADOS de «Maderera El Bosque»,
armados con el mismo programa del parte del sistema) y Chrome a 400 px, escala 2.
"""
import fitz, sys

src, img_correo, img_wa, out = sys.argv[1:5]
d = fitz.open(src)
assert d.page_count == 5, d.page_count
p = d.new_page(width=595.2756, height=841.8898)
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255); NEGRO = (0, 0, 0)
BORDE = (0.85, 0.87, 0.86); TINTE = (0.902, 0.957, 0.945); RAYA = (0.898, 0.906, 0.922); CAJA = (0.059, 0.463, 0.431)


def tb(r, t, font="helv", size=10, color=NEGRO, align=0):
    R0 = fitz.Rect(*r); R0.y1 += 6
    rc = p.insert_textbox(R0, t, fontname=font, fontsize=size, color=color, align=align, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)


def imagen(r, img):
    R = fitz.Rect(*r)
    pm = fitz.Pixmap(img); asp = pm.height / pm.width
    if asp < R.height / R.width:
        hh = R.width * asp; R = fitz.Rect(R.x0, R.y0, R.x1, R.y0 + hh)
    else:
        ww = R.height / asp; R = fitz.Rect(R.x0, R.y0, R.x0 + ww, R.y1)
    p.insert_image(R + (1, 1, -1, -1), filename=img, keep_proportion=True)
    p.draw_rect(R, color=BORDE, width=0.8)
    return R


tb((40, 38, 555, 60), "9. Quién le debe, cada tarde en su correo", "hebo", 13, VERDE)
tb((40, 64, 555, 110), "El parte del día le llega solo, a la hora que usted elija, por correo o WhatsApp. "
   "Trae la lista de quién le debe: cada persona con lo que le adelantó y la madera que se llevó sin pagar, de mayor a menor.")
rc = imagen((40, 112, 290, 462), img_correo)
tb((rc.x0, rc.y1 + 4, rc.x1, rc.y1 + 18), "1. En el correo: la tabla completa", "heit", 8, GRIS, align=1)
rw = imagen((305, 112, 555, 330), img_wa)
tb((rw.x0, rw.y1 + 4, rw.x1, rw.y1 + 18), "2. En el WhatsApp: los que más deben", "heit", 8, GRIS, align=1)
tb((305, rw.y1 + 30, 555, rw.y1 + 110),
   "Es como el cuaderno donde anota quién le debe, pero se suma solo y se lo lee a usted cada tarde, "
   "sin que nadie tenga que abrirlo.", "heit", 10, GRIS)

filas = [
    ("Una sola cuenta", "Sale de la misma cuenta por persona del panel: lo que dice el correo es lo que dice el sistema."),
    ("Separado", "Adelantos y madera en columnas aparte; los dólares van fuera del total, sin inventar tipo de cambio."),
    ("Sin trabajo extra", "Usted no arma nada: marca «Quién te debe» en las opciones del parte una vez y llega todos los días."),
]
y = 512; h = 37
tb((51, y - 24, 400, y - 4), "Lo que hace", "hebo", 13, VERDE)
p.draw_rect(fitz.Rect(51, y, 159, y + h * len(filas)), color=None, fill=TINTE)
for i, (a, b) in enumerate(filas):
    yy = y + i * h
    if i:
        p.draw_line((51, yy), (544, yy), color=RAYA, width=0.8)
    tb((57, yy + 6, 158, yy + h), a, "hebo", 10)
    tb((167, yy + 6, 544, yy + h), b)
yb = y + h * len(filas) + 14
p.draw_rect(fitz.Rect(51, yb, 544, yb + 92), color=CAJA, width=1.2)
tb((60, yb + 8, 540, yb + 28), "Cobre a tiempo", "hebo", 13, VERDE)
tb((60, yb + 30, 540, yb + 62), "Una deuda que nadie recuerda no se cobra. En el ejemplo, S/ 13,695.70 repartidos entre "
   "5 personas aparecen en una sola mirada. Incluido en los S/ 349 al mes.")
tb((60, yb + 68, 540, yb + 84), "Pida un parte de ejemplo por WhatsApp: 917 013 738.", "hebo")
tb((40, 760, 400, 772), "Correo y WhatsApp con datos de prueba.", "heit", 8, GRIS)
tb((51, 805, 300, 817), "Buleje · sistema para aserraderos", "helv", 8, GRIS)
tb((480, 805, 544, 817), "Página 6", "helv", 8, GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count)
