## Figurennamen aus characters.json (Muster: "Namen entkoppeln"). Skripte fragen CHARS, nie einen festen Namen.
## Beispiel: frage_name(CHARS["rika"]["var"], CHARS["rika"]["name"]).  Umbenennen = nur die JSON ändern.
init -10 python:
    import json
    CHARS = json.loads(renpy.file("characters.json").read().decode("utf-8"))["characters"]

    def char_name(key):
        """Der Anzeigename einer Figur: der vom Spieler gewählte, sonst der Standard aus characters.json."""
        c = CHARS[key]
        return getattr(store, c["var"], None) or c["name"]
