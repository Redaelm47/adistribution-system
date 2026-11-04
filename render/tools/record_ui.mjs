// Records the interface while it replays a saved run, for the demo film. The replay shows the run's real events
// (every Meta call, its request, response, time and cost) at the run's own pace with long waits shortened, and says so on screen.
//   node tools/record_ui.mjs <run-id> <out.mp4> [--hold=6] [--calls]
//   node tools/record_ui.mjs home <out.mp4> --video=a.mp4 --ad=b.mp4 [--prompt="..."] [--send] [--hold=6]
// `home` films the first screen: both files dropped in, the request typed. With --send it also presses the arrow and keeps
// filming the run live until it ends (real Meta calls: it costs a run). Needs the interface (../app/server.py on :8000) and Google Chrome.

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
const UI = process.env.UI_URL || 'http://localhost:8000'; // the interface (UI_URL to film another port)

const [id, outArg, ...rest] = process.argv.slice(2);
if (!id || !outArg) {
	console.error('usage: node tools/record_ui.mjs <run-id> <out.mp4> [--hold=6] [--calls]');
	process.exit(2);
}
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const hold = Number(opt.hold ?? 6);
const out = resolve(outArg);
mkdirSync(dirname(out), {recursive: true});
const webm = out.replace(/\.mp4$/, '') + '.webm';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Films the page in real time: each frame Chrome sends is kept with its timestamp and held until the next one,
 * so quiet moments (nothing changes on screen) keep their real length. Returns stop(), which writes the mp4. */
const record = async (page, out) => {
	const dir = out.replace(/\.mp4$/, '') + '.frames';
	rmSync(dir, {recursive: true, force: true});
	mkdirSync(dir, {recursive: true});
	const client = await page.createCDPSession();
	const frames = [];
	const t0 = Date.now() / 1000;
	client.on('Page.screencastFrame', (f) => {
		const file = `${dir}/f${String(frames.length).padStart(5, '0')}.jpg`;
		writeFileSync(file, Buffer.from(f.data, 'base64'));
		frames.push({file, ts: f.metadata.timestamp ?? Date.now() / 1000});
		client.send('Page.screencastFrameAck', {sessionId: f.sessionId}).catch(() => {});
	});
	await client.send('Page.startScreencast', {format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1});
	return {
		t0,
		stop: async () => {
			const tEnd = Date.now() / 1000;
			await client.send('Page.stopScreencast').catch(() => {});
			if (!frames.length) throw new Error('no frame recorded');
			const lines = [];
			frames.forEach((f, i) => {
				const next = i + 1 < frames.length ? frames[i + 1].ts : tEnd;
				const start = i === 0 ? t0 : f.ts;
				lines.push(`file '${f.file}'`, `duration ${Math.max(1 / 60, next - start).toFixed(4)}`);
			});
			lines.push(`file '${frames[frames.length - 1].file}'`);
			writeFileSync(`${dir}/list.txt`, lines.join('\n') + '\n');
			execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'scale=1920:1080:flags=lanczos,fps=30', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', out]);
			rmSync(dir, {recursive: true, force: true});
		},
	};
};


const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: true,
	defaultViewport: {width: 1440, height: 810, deviceScaleFactor: 4 / 3},
	args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
if (id === 'home') {
	await page.goto(`${UI}/`, {waitUntil: 'networkidle2'});
	await pause(600);
	const rec = await record(page, out);
	await pause(900);
	const pick = await page.$('#pick');
	await pick.uploadFile(resolve(String(opt.video)));
	await pause(900);
	await pick.uploadFile(resolve(String(opt.ad)));
	await pause(900);
	await page.click('#ask');
	await page.type('#ask', String(opt.prompt ?? 'Put my ad in this video'), {delay: 55});
	await pause(700);
	if (opt.send) {
		await page.click('#send');
		await page.waitForFunction(() => location.hash.startsWith('#/run/'), {timeout: 60000});
		await page.waitForFunction(() => !!document.querySelector('.done-line'), {timeout: 900000, polling: 500});
		console.log('run', await page.evaluate(() => location.hash));
	}
	await pause(hold * 1000);
	await rec.stop();
	await browser.close();
	console.log(out);
	process.exit(0);
}
await page.goto(`${UI}/#/run/${id}`, {waitUntil: 'networkidle2'});
// wait for the saved run to be fully drawn, then start from a clean replay
await page.waitForFunction(() => !!document.querySelector('.done-line'), {timeout: 30000});
await new Promise((r) => setTimeout(r, 800));
const rec = await record(page, out);
const t0 = rec.t0 * 1000;
await new Promise((r) => setTimeout(r, 400));
await page.click('#replay');
const marks = {};
const watch = setInterval(async () => {
	try {
		const now = (Date.now() - t0) / 1000;
		const seen = await page.evaluate(() => [...document.querySelectorAll('#thread .st')].filter((li) => /\b(done|skip|error)\b/.test(li.className)).map((li) => li.dataset.step).concat([...document.querySelectorAll('#thread .way')].map((w) => 'card:' + (w.querySelector('small')?.textContent || ''))));
		for (const k of seen) {
			if (k in marks) continue;
			marks[k] = Math.round(now * 100) / 100;
			// the stage scrolls by itself, as a person would: down to the cards once SAM has cut the subject out, back up to the player for the result
			if (k === 'cutout') page.evaluate(() => document.querySelector('.stage')?.scrollTo({top: (document.querySelector('#cards')?.offsetTop ?? 0) - 120, behavior: 'smooth'})).catch(() => {});
			if (k === 'animate') page.evaluate(() => document.querySelector('.stage')?.scrollTo({top: 0, behavior: 'smooth'})).catch(() => {});
		}
	} catch {}
}, 100);
await page.waitForFunction(() => document.querySelector('#replay')?.disabled === true, {timeout: 5000});
await page.waitForFunction(() => document.querySelector('#replay')?.disabled === false, {timeout: 180000, polling: 200});
if (opt.calls) {
	await new Promise((r) => setTimeout(r, 1200));
	await page.click('#calls-btn').catch(() => {});
}
await new Promise((r) => setTimeout(r, hold * 1000));
clearInterval(watch);
const k = 1920 / 1440;
const rects = await page.evaluate(() => Object.fromEntries(['#thread', '.steps', '#player', '#strip', '#cards', '#log', '.done-line'].map((q) => {
	const r = document.querySelector(q)?.getBoundingClientRect();
	return [q, r ? [r.x, r.y, r.width, r.height] : null];
})));
await rec.stop();
await browser.close();
const len = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
const scaled = Object.fromEntries(Object.entries(rects).map(([q, r]) => [q, r && r.map((v) => Math.round(v * k))]));
writeFileSync(out.replace(/\.mp4$/, '.marks.json'), JSON.stringify({run: id, len, marks, rects: scaled}, null, 1));
console.log(out, JSON.stringify(marks));
