"""Pure helpers of clearance.py (no bpy, so a unit test can import them; #391)."""


def piece_name(name, prefix='_Cos_'):
    """The piece part of a garment object name: `Caesar_Cos_King_Legs` -> `King_Legs`, `CL_shirt__sleeve` -> `CL_shirt__sleeve`."""
    return name.split(prefix)[-1]


def arg_error(argv):
    """One line saying why the arguments cannot run, or None. `faces` adds polygon and edge samples that only report= can map back to vertices."""
    if 'faces' in argv and not any(a.startswith('report=') for a in argv):
        return 'clearance.py: `faces` only works with report=<file> (fix mode moves vertices, and the face samples are not vertices); drop `faces` or add report='
    return None


def summary_line(tag, name, smallest_mm, inside, share_pct):
    """One FINAL/rest line of summarize(): the piece part of the name, the smallest clearance, the vertices inside."""
    return f'{tag} {piece_name(name):12s} min {smallest_mm:7.1f} mm  inside {inside:4d} ({share_pct:.2f}%)'
