// node render.mjs out_dir  -> out_dir/video.mp4 (1080x1920, 30 fps, voice mixed with a quiet music bed if out_dir/music.* exists)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = path.resolve(process.argv[2]);
const here = path.dirname(fileURLToPath(import.meta.url));
const timing = JSON.parse(readFileSync(path.join(out, 'timing.json'), 'utf8'));
const FPS = 30, frames = Math.ceil(timing.duration * FPS);
const music = readdirSync(out).find(f => /^music\./.test(f));
const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', path.join(out, 'voice.wav')];
if (music) args.push('-stream_loop', '-1', '-i', path.join(out, music), '-filter_complex', '[2:a]volume=0.12[m];[1:a][m]amix=inputs=2:duration=first[a]', '-map', '0:v', '-map', '[a]');
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', path.join(out, 'video.mp4'));
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + path.join(here, 'explainer.html'));
await page.evaluate(t => window.setup(t), timing);
for (let i = 0; i < frames; i++) {
  await page.evaluate(t => window.seek(t), i / FPS);
  ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 92 }));
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close();
