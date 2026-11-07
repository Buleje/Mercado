"""Página 11 del folleto «Buleje para aserraderos»: «Nada se pierde del libro» (04-11, ADR-535).

Uso: python3 armar_p11.py <folleto de 10 págs> <21 lista recortada.png> <22 vista previa recortada.png> <salida.pdf>
Capturas del tenant QA forestal con la papelera PARCHEADA (papelera/pasos.json: «Aserradero Ejemplo»,
usuarios y trozas inventados; los textos de las reglas son los del sistema). Nada de Blas.
El aviso de Telegram es el texto real de `textoAvisoBorrado` con esos datos (probado 04-11 en el chat de Brandon).
"""
import fitz, sys

src, img1, img2, out = sys.argv[1:5]
d = fitz.open(src)
assert d.page_count == 10, d.page_count
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255); NEGRO = (0, 0, 0)
BORDE = (0.85, 0.87, 0.86); CAJA = (0.059, 0.463, 0.431); BURBUJA = (0.93, 0.95, 0.94)
NB = " "  # Helvética base14 parte «S/» de su cifra si no va con espacio duro (y no tiene «…» ni «›»)


def tb(p, r, t, font="helv", size=10, color=NEGRO, align=0):
    R0 = fitz.Rect(*r); R0.y1 += 6
    rc = p.insert_textbox(R0, t, fontname=font, fontsize=size, color=color, align=align, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)


def captura(p, y, img, pie):
    pm = fitz.Pixmap(img)
    w = 495; h = w * pm.height / pm.width; x0 = 40 + (515 - w) / 2
    r = fitz.Rect(x0, y, x0 + w, y + h)
    p.insert_image(r + (1, 1, -1, -1), filename=img, keep_proportion=True)
    p.draw_rect(r, color=BORDE, width=0.8)
    tb(p, (r.x0, r.y1 + 4, r.x1, r.y1 + 16), pie, "heit", 8, GRIS, align=1)
    return r.y1 + 22


p = d.new_page(width=595.2756, height=841.8898)
tb(p, (40, 38, 555, 60), "14. Nada se pierde del libro", "hebo", 13, VERDE)
tb(p, (40, 64, 555, 104), "Si alguien borra líneas del Libro de Operaciones, quedan en la papelera: usted ve qué se "
   "borró, quién y cuándo, y lo devuelve con un clic. Antes de devolver, el sistema revisa cada línea con las reglas "
   "del libro, para que no regrese nada que hoy no cuadre.")

y = captura(p, 108, img1, "1. Lo borrado, agrupado por momento y con quién lo hizo (Libro TH > ... > Papelera del libro)")
y = captura(p, y + 4, img2, "2. Antes de devolver: qué vuelve, qué no y por qué (el mismo texto que daría anotarla hoy)")

# Fila 3: el aviso al celular (izq.) y el «Es como» + lo que hace (der.).
y3 = y + 6
tb(p, (40, y3, 290, y3 + 16), "Y si alguien borra mucho, le avisa", "hebo", 11, VERDE)
rb = fitz.Rect(40, y3 + 22, 290, y3 + 104)
p.draw_rect(rb, color=BORDE, fill=BURBUJA, width=0.8, radius=0.08)
tb(p, (rb.x0 + 10, rb.y0 + 8, rb.x1 - 8, rb.y0 + 22), "Se borraron 12 líneas del Libro TH", "hebo", 9.5)
tb(p, (rb.x0 + 10, rb.y0 + 24, rb.x1 - 8, rb.y1 - 6),
   "Por: ayudante-patio · 03/11 18:42\n"
   "6 Trozado · 6 Despacho de trozas · 17.000 m³\n"
   "Si no fue a propósito: Libro TH > ... > Papelera del libro.", "helv", 9)
tb(p, (40, rb.y1 + 4, 290, rb.y1 + 28), "Llega a su Telegram desde 10 líneas borradas de una vez (o 10 sueltas en "
   "10 minutos). Ejemplo con datos inventados.", "heit", 8, GRIS)

xr = 306
tb(p, (xr, y3, 555, y3 + 48), "Es como el cuaderno de borradores: lo tachado no se arranca. Se puede pasar en limpio "
   "otra vez, pero solo si todavía cuadra.", "heit", 10, GRIS)
tb(p, (xr, y3 + 54, 555, y3 + 70), "Lo que hace", "hebo", 11, VERDE)
tb(p, (xr, y3 + 74, 555, y3 + 160),
   "Revisa mes cerrado, troza repetida, guía anulada y cupo de la especie antes de devolver.\n"
   "Devuelve la línea con su mismo N.º: el libro no se descuadra.\n"
   "El trozado no vuelve sin su tala, ni la salida sin su trozado.")

yb = max(rb.y1 + 34, y3 + 164); hb = 70
p.draw_rect(fitz.Rect(51, yb, 292, yb + hb), color=CAJA, width=1.2)
tb(p, (60, yb + 8, 286, yb + 28), "El libro que mira OSINFOR, en orden", "hebo", 12, VERDE)
tb(p, (60, yb + 30, 286, yb + hb - 6), "Un borrado por error ya no es para siempre, y nada vuelve si rompe una regla.")
p.draw_rect(fitz.Rect(303, yb, 544, yb + hb), color=CAJA, width=1.2)
tb(p, (312, yb + 8, 538, yb + 28), f"Incluido en los S/{NB}349 al mes", "hebo", 12, VERDE)
tb(p, (312, yb + 30, 538, yb + hb - 6), "Viene con el Libro de Operaciones y el aviso por Telegram; no se instala nada.")
tb(p, (51, yb + hb + 12, 544, yb + hb + 28), "Pida la prueba sin costo por WhatsApp: 917 013 738.", "hebo")
assert yb + hb + 28 < 784, yb
tb(p, (40, 790, 555, 802), "Ejemplo: «Aserradero Ejemplo», sus usuarios y sus trozas son inventados; los textos de "
   "las reglas son los que da el sistema.", "heit", 8, GRIS)
tb(p, (51, 805, 300, 817), "Buleje · sistema para aserraderos", "helv", 8, GRIS)
tb(p, (480, 805, 544, 817), "Página 11", "helv", 8, GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count, round(yb + hb + 28))
