## Art slot template from docs/renpy.md: copy to game/, rename the slots to the new story.
## Bild- und Loop-Slots.
## Jede Szene zeigt einen Platzhalter, bis eine echte Datei da ist:
##   Bilder: game/art/<datei>.webp|.png|.jpg   (1920x1080, Sprites 700x1000 transparent)
##   Loops:  game/art/loops/<datei>.webm       (1920x1080, nahtlos)
## Datei reinlegen, Spiel neu starten, fertig. Liste: ASSETS.txt

transform loop_pulse:
    zoom 1.0
    ease 1.6 zoom 1.015
    ease 1.6 zoom 1.0
    repeat

init 1 python:

    ART_EXT = (".webp", ".png", ".jpg")

    def _art(name):
        for ext in ART_EXT:
            path = "art/" + name + ext
            if renpy.loadable(path):
                return path
        return None

    def _placeholder(label, size, color, hint):
        return Fixed(
            Solid(color),
            Text(label, size=48, color="#ffffffd0", xalign=0.5, yalign=0.44, text_align=0.5),
            Text(hint, size=24, color="#ffffff80", xalign=0.5, yalign=0.56),
            xysize=size,
        )

    def slot_image(tag, name, color, label, size=(1920, 1080)):
        path = _art(name)
        renpy.image(tag, path if path else _placeholder(label, size, color, "art/%s.png" % name))

    def slot_loop(tag, name, color, label):
        path = "art/loops/%s.webm" % name
        if renpy.loadable(path):
            renpy.image(tag, Movie(play=path, loop=True, size=(1920, 1080)))
        else:
            ph = _placeholder("LOOP · " + label, (1920, 1080), color, path)
            renpy.image(tag, At(ph, loop_pulse))

    SPRITE = (700, 1000)

    # Hintergründe
    slot_image("bg tower_morning", "bg_tower_morning", "#3b4a63", "Shinagawa, Turm am Morgen")
    slot_image("bg office_day", "bg_office_day", "#4a5468", "Büro, 10. Etage, Tag")
    slot_image("bg reception", "bg_reception", "#5a4f45", "Empfang, 10. Etage")
    slot_image("bg lift", "bg_lift", "#3d3a42", "Aufzug, innen")
    slot_image("bg office_night", "bg_office_night", "#1f2433", "Büro bei Nacht")
    slot_image("bg lobby_night", "bg_lobby_night", "#2a2433", "Lobby bei Nacht")

    # Sprites
    for _expr in ("neutral", "smile", "blush", "pout", "shock", "soft"):
        slot_image("rika " + _expr, "rika_" + _expr, "#8a7440", "Rika · " + _expr, SPRITE)
    for _expr in ("neutral", "smirk"):
        slot_image("erza " + _expr, "erza_" + _expr, "#7a2f2a", "Erza · " + _expr, SPRITE)

    # Standbilder (CGs)
    slot_image("cg bow_spill", "cg_bow_spill", "#6b5a3a", "CG · Die Verbeugung, der Tee kippt")
    slot_image("cg blouse", "cg_blouse", "#6b4f4a", "CG · Nasser Kragen, Strickjacke aus")
    slot_image("cg lift_close", "cg_lift_close", "#4a3f55", "CG · Im Dunkeln an deinem Arm")
    slot_image("cg desk_pact", "cg_desk_pact", "#33405a", "CG · Auf deiner Schreibtischkante")
    slot_image("cg lobby_stream", "cg_lobby_stream", "#3a2f4a", "CG · Rikachan streamt in die leere Lobby")

    # Loops (Tease-Animationen, kommen vom fertigen Base-Körper)
    slot_loop("loop rika_idle", "rika_idle", "#7a6638", "Rika am Empfang, Idle")
    slot_loop("loop rika_lift", "rika_lift", "#45394f", "Rika im Aufzug, atmet schnell")
    slot_loop("loop rika_stretch", "rika_stretch", "#2f3a52", "Rika streckt sich auf dem Schreibtisch")
