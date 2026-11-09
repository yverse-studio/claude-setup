// Job type "cxy-scene-final" (wave D2, 2026-11-09; plans/render-audit.md §4).
// One job = one position of a scene: every cam, every frame, in ONE Blender process.
// Tasks: gate (STOP file, free RAM, no other blender.exe, WHO.md line) -> render -> verify (counts PNGs, DONE marker, rendered > 0).
// Helpers live in {cxytools} (StudioLibrary\tools\flamenco\cxy). Submit with cxy_submit.py, not by hand.

const JOB_TYPE = {
    label: "CXY Scene Final",
    description: "One scene position: all cams, all frames, gate + verify",
    settings: [
        { key: "blendfile", type: "string", required: true, description: "Scene .blend to load" },
        { key: "cams_json", type: "string", required: true, description: "cams.json (list or {key: {cams: [...]}})" },
        { key: "clip_key", type: "string", default: "-", description: "Key inside cams.json, '-' for a plain list" },
        { key: "frame_start", type: "int32", required: true },
        { key: "frame_end", type: "int32", required: true },
        { key: "out_dir", type: "string", required: true, description: "Output root; PNGs land in <out_dir>/<cam>/<frame:03d>.png" },
        { key: "scene", type: "string", required: true, description: "scene=<titten|sessel|mund|tisch|fenster>" },
        { key: "res", type: "string", default: "1920x1080" },
        { key: "samples", type: "int32", default: 16 },
        { key: "only", type: "string", default: "", description: "Comma list of cam names, empty = all" },
        { key: "pre_scripts", type: "string", default: "", description: "Pre scripts run in this order, separated by |" },
        { key: "render_script", type: "string", required: true, description: "Renderer, e.g. final_render_a14.py" },
        { key: "env", type: "string", default: "", description: "Env vars for the pre scripts, K=V separated by |" },
        { key: "overwrite", type: "bool", default: false, description: "Move existing PNGs of this range aside first (skip-existing trap)" },
        { key: "thread", type: "string", default: "flamenco", description: "Who submitted, for the WHO.md line" },
        { key: "min_free_gb", type: "float", default: 4.0 },
    ]
};

function compileJob(job) {
    const s = job.settings;
    if (s.frame_end < s.frame_start) throw `frame_end ${s.frame_end} < frame_start ${s.frame_start}`;
    const range = `${s.frame_start}-${s.frame_end}`;
    const common = [
        "--out", s.out_dir, "--cams", s.cams_json, "--key", s.clip_key,
        "--f0", `${s.frame_start}`, "--f1", `${s.frame_end}`, "--only", s.only,
    ];

    const gate = author.Task("gate", "misc");
    gate.addCommand(author.Command("exec", {
        exe: "{cxypython}",
        args: ["-I", "{cxytools}/cxy_gate.py", "--queue", "{cxyqueue}", "--job", job.name,
               "--thread", s.thread, "--min-free-gb", `${s.min_free_gb}`],
    }));
    job.addTask(gate);

    let args = ["--python-exit-code", "1", "--python", "{cxytools}/cxy_env.py"];
    for (const p of s.pre_scripts.split("|").map((x) => x.trim()).filter((x) => x)) {
        args = args.concat(["--python", p]);
    }
    args = args.concat(["--python", "{cxytools}/cxy_final.py", "--",
        s.cams_json, s.clip_key, `${s.frame_start}`, `${s.frame_end}`, s.out_dir,
        `scene=${s.scene}`, `res=${s.res}`, `samples=${s.samples}`,
        `render_script=${s.render_script}`, `overwrite=${s.overwrite ? 1 : 0}`]);
    if (s.only) args.push(`only=${s.only}`);
    if (s.env) args.push(`env=${s.env}`);

    const frames = s.frame_end - s.frame_start + 1;
    const render = author.Task(`render-${range}`, "blender");
    render.addCommand(author.Command("blender-render", {
        exe: "{blender}", exeArgs: "{blenderArgs}", argsBefore: [], blendfile: s.blendfile, args: args,
    }, frames));
    render.addDependency(gate);
    job.addTask(render);

    const verify = author.Task("verify", "misc");
    verify.addCommand(author.Command("exec", {
        exe: "{cxypython}",
        args: ["-I", "{cxytools}/cxy_verify.py"].concat(common),
    }));
    verify.addDependency(render);
    job.addTask(verify);
}
