"""Página 7 del folleto «Buleje para aserraderos»: «El archivo de cada cliente, con la versión que vale» (04-11).

Uso: python3 armar_p7.py <folleto de 6 págs> <oficial.png> <archivado.png> <salida.pdf>
Las fotos salen del Archivo del panel (tenant main, carpeta «Clientes/Maderera El Bosque» con 5 papeles
INVENTADOS): archivo-cliente/sembrar.sh + qa-capturas con archivo-cliente/pasos-archivo.json.
"""
import fitz, sys

src, img_ofi, img_arch, out = sys.argv[1:5]
d = fitz.open(src)
assert d.page_count == 6, d.page_count
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


tb((40, 38, 555, 60), "10. El archivo de cada cliente, con la versión que vale", "hebo", 13, VERDE)
tb((40, 64, 555, 110), "Cada cliente tiene su carpeta con sus papeles: cubicación, estado de cuenta, cotización, guía. "
   "Cada papel dice si es el Oficial (el que vale y se manda), si está En revisión o si es una versión vieja.")
r1 = imagen((40, 108, 555, 345), img_ofi)
tb((r1.x0, r1.y1 + 4, r1.x1, r1.y1 + 18), "1. A la vista, solo los papeles que valen (la versión vieja no sale)", "heit", 8, GRIS, align=1)
r2 = imagen((40, r1.y1 + 26, 330, r1.y1 + 186), img_arch)
tb((r2.x0, r2.y1 + 4, r2.x1, r2.y1 + 18), "2. Un toque en «Archivado» y aparece la vieja", "heit", 8, GRIS, align=1)
tb((345, r2.y0 + 4, 555, r2.y0 + 120),
   "Es como el archivador del cliente: adelante la hoja que vale, atrás el sobre «Archivado». "
   "Nadie manda la versión equivocada y nada se bota.", "heit", 10, GRIS)

filas = [
    ("La que vale, adelante", "Solo se ven los papeles vigentes; la versión vieja no se confunde ni se manda por error."),
    ("Nada se pierde", "Lo viejo queda guardado en «Archivado», con su fecha; también sale si lo busca por nombre."),
    ("Corregir sin enredos", "Mientras se corrige dice «En revisión»; al terminar, un toque lo pone Oficial."),
]
y = r2.y1 + 52; h = 37
tb((51, y - 24, 400, y - 4), "Lo que hace", "hebo", 13, VERDE)
p.draw_rect(fitz.Rect(51, y, 170, y + h * len(filas)), color=None, fill=TINTE)
for i, (a, b) in enumerate(filas):
    yy = y + i * h
    if i:
        p.draw_line((51, yy), (544, yy), color=RAYA, width=0.8)
    tb((57, yy + 6, 169, yy + h), a, "hebo", 10)
    tb((178, yy + 6, 544, yy + h), b)
yb = y + h * len(filas) + 14
p.draw_rect(fitz.Rect(51, yb, 544, yb + 92), color=CAJA, width=1.2)
tb((60, yb + 8, 540, yb + 28), "Sin pleitos por la versión equivocada", "hebo", 13, VERDE)
tb((60, yb + 30, 540, yb + 62), "En el ejemplo, el estado de cuenta se corrigió porque faltaba el flete de S/ 300.00: a la vista "
   "queda el de S/ 3,989.32 y el de S/ 3,689.32 se guarda atrás. Incluido en los S/ 349 al mes.")
tb((60, yb + 68, 540, yb + 84), "Pida la prueba sin costo por WhatsApp: 917 013 738.", "hebo")
assert yb + 92 < 790, yb
tb((40, 790, 400, 802), "Papeles de un cliente de prueba.", "heit", 8, GRIS)
tb((51, 805, 300, 817), "Buleje · sistema para aserraderos", "helv", 8, GRIS)
tb((480, 805, 544, 817), "Página 7", "helv", 8, GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count, round(yb + 92))
