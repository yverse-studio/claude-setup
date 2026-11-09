# Flamenco (render farm on the laptop)

Live install of Flamenco 3.9.3 (wave D2, 2026-11-09). Source of the scripts and the rules: claude-setup
`scripts/laptop/flamenco/` and `docs/pc-claude-user.md` (Render farm). Change them there, then copy here.

- Manager: Windows service `FlamencoManager` (WinSW wrapper `flamenco-manager-service.exe` + `.xml`), web UI http://127.0.0.1:8080, config `flamenco-manager.yaml`, DB `flamenco-manager.sqlite`.
- Worker: scheduled task `CXY Flamenco Worker` at logon of claude runs `worker-loop.ps1` (EEVEE needs GPU + desktop session; a service has neither). `WORKER_OFF` file here ends the loop.
- Job type `cxy-scene-final` (`scripts/cxy_scene_final.js`): gate (STOP, RAM >= 4 GB, no other blender.exe, WHO.md line) -> render one position (all cams, all frames, one Blender) -> verify (every PNG > 0 bytes, DONE marker, rendered > 0).
- Submit: `<blender python> -I cxy\cxy_submit.py submit job.json`; status: `... status <job-id>`. Example: `tests\job_good_tisch.json`.
- Install / reinstall (admin, once): `install_flamenco_admin.ps1`. Blender path: `variables.blender` in the yaml must equal `StudioLibrary\BLENDER_EXE.txt`.
- Downloads with checksums: `_dl\` (flamenco sha256 from flamenco.blender.org; WinSW v2.12.0 from github.com/winsw/winsw, Defender-scanned).
