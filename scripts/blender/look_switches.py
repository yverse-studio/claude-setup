"""look_switches.py: set every look switch for every state a sheet renders (companyxy 2026-11-12: the sheet script left
tights_on on for "nude", because it only set the switches a state named).

    from look_switches import apply_state, write_states
    SWITCHES = ['tights_on', 'shoes_on']                      # the body custom props that change the look
    rec = apply_state(body, SWITCHES, {'tights_on': 1})       # body['shoes_on'] is set to 0.0, never left over
    write_states('look_states.json', SWITCHES, {'office': rec})   # then: node scripts/pipeline-gates.mjs look look_states.json

`body` is anything with item assignment (a Blender object, a dict). A switch a state does not name gets `default` (0.0);
a name in the state that is not a listed switch is an error, so a typo cannot silently leave a switch on."""
import json


def apply_state(body, switches, state, default=0.0):
    unknown = sorted(set(state) - set(switches))
    if unknown:
        raise KeyError(f'not a listed look switch: {", ".join(unknown)}')
    record = {}
    for name in switches:
        record[name] = float(state.get(name, default))
        body[name] = record[name]
    return record


def write_states(path, switches, states):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'switches': list(switches), 'states': states}, f, indent=1)
