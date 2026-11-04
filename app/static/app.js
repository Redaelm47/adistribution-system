// AdistributionSystem interface. Plain JS, no build step: the server streams a run's events, this page draws them as a conversation.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') el.className = v;
		else if (k === 'text') el.textContent = v;
		else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
		else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
		else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
	}
	for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
	return el;
};
const icon = (id) => {
	const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
	u.setAttribute('href', `#i-${id}`);
	s.append(u);
	return s;
};
const clock = (t) => `${Math.floor((t || 0) / 60)}:${String(Math.floor((t || 0) % 60)).padStart(2, '0')}`;
const clockTenth = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const money = (x) => (x > 0 && x < 0.0001 ? '<$0.0001' : `$${(x || 0).toFixed(4)}`);
const num = (x) => (x || 0).toLocaleString('en-US');
const stem = (name) => (name || '').replace(/\.[^.]+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODEL_NAME = {
	'muse-spark-1.3': 'Muse Spark',
	'muse-wonder-1.0': 'Muse Wonder',
	'sam-3.1': 'SAM 3.1',
	'muse-voice-transcribe-1.0': 'Muse Voice Transcribe',
	'muse-image-1.0': 'Muse Image',
	'muse-code': 'Muse Code',
};
const tag = (model, cls = '') => h('span', {class: `tag ${cls}`, 'data-m': model, text: MODEL_NAME[model] || model});

// What each step says while it works, in the words of the film.
const STEP_TEXT = {
	look: 'Watching the video and the ad',
	transcribe: 'Listening to the video',
	moment: 'Finding the moment',
	ad: 'Reading the ad',
	cutout: 'Cutting out the subject',
	write: 'Writing the way in',
	invent: 'Writing a new move',
	animate: 'Animating the way in',
	review: 'Watching the result',
	face: 'Finding the face',
	voice: 'Taking your voice',
};

// ============================================================ mode and recents

let MODE = 'simulation';
let SYSVOICE = null; // the system voice of this machine, if it has a good one (a Premium Mac voice)

async function loadMode() {
	const el = $('#mode');
	try {
		const st = await (await fetch('/api/status')).json();
		MODE = st.mode;
		SYSVOICE = st.voice || null;
		el.className = `mode ${MODE}`;
		$('#mode-text').textContent = MODE === 'live' ? 'Live · Meta Model API' : 'Simulation · no API key';
	} catch {
		$('#mode-text').textContent = 'Server offline';
	}
}

async function loadRecents() {
	let runs = [];
	try {
		runs = await (await fetch('/api/runs')).json();
	} catch {}
	const list = $('#recents');
	if (!runs.length) return list.replaceChildren(h('div', {class: 'recents-empty', text: 'Your runs will appear here'}));
	list.replaceChildren(...runs.map((r) => h('a', {
		href: `#/run/${r.id}`,
		class: r.status === 'running' ? 'running' : '',
		title: r.lines ? `“${r.lines.join(' ')}”` : r.status,
	}, `${stem(r.names.video) || 'video'} × ${stem(r.names.ad) || 'ad'}`)));
}

// ============================================================ home: the composer

const picked = []; // [video, ad], in the order they were dropped
let tone = 'funny';

function thumbOf(file) {
	return new Promise((resolve) => {
		const v = document.createElement('video');
		v.muted = true;
		v.preload = 'metadata';
		v.src = URL.createObjectURL(file);
		v.addEventListener('loadedmetadata', () => (v.currentTime = Math.min(0.6, v.duration / 2)), {once: true});
		v.addEventListener('seeked', () => {
			const c = document.createElement('canvas');
			c.width = 200;
			c.height = Math.round((200 * v.videoHeight) / v.videoWidth) || 112;
			c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
			resolve({src: c.toDataURL('image/jpeg', 0.8), duration: v.duration});
		}, {once: true});
		v.addEventListener('error', () => resolve({src: '', duration: 0}), {once: true});
	});
}

function addFiles(files) {
	for (const f of files) {
		if (!f.type.startsWith('video/')) continue;
		if (picked.length >= 2) picked.shift();
		const item = {file: f, src: '', duration: 0};
		picked.push(item);
		thumbOf(f).then((t) => (Object.assign(item, t), drawFiles()));
	}
	drawFiles();
}

function drawFiles() {
	const roles = ['Video', 'Ad'];
	const chips = picked.map((p, i) => h('div', {class: 'file'},
		h('img', {src: p.src || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: ''}),
		h('div', {class: 'meta'}, h('b', {text: p.file.name}), h('small', {}, h('i', {text: roles[i]}), p.duration ? ` · ${clock(p.duration)}` : '')),
		h('button', {type: 'button', class: 'rm', 'aria-label': `Remove ${p.file.name}`, onclick: () => (picked.splice(i, 1), drawFiles())}, icon('x')),
	));
	if (picked.length === 2) chips.splice(1, 0, h('button', {type: 'button', class: 'swap', title: 'Swap video and ad', onclick: () => (picked.reverse(), drawFiles())}, '⇄'));
	const wanted = (role, sub) => h('label', {class: 'file wanted', title: `Add the ${role.toLowerCase()}`}, h('span', {class: 'box'}, icon('plus')), h('div', {class: 'meta'}, h('b', {text: role}), h('small', {text: sub})), h('input', {type: 'file', accept: 'video/*', multiple: true, hidden: true, onchange: (e) => addFiles(e.target.files)}));
	if (picked.length === 0) chips.push(wanted('Video', 'The video to put the ad in'), wanted('Ad', 'Your ad, as a video'));
	if (picked.length === 1) chips.push(wanted('Ad', 'Your ad, as a video'));
	$('#files').replaceChildren(...chips);
	const ready = picked.length === 2;
	$('#send').disabled = !ready;
	const hint = $('#hint');
	hint.classList.remove('err');
	hint.textContent = ready ? 'Ready' : picked.length ? 'Now the ad' : 'Drop your video, then your ad';
}

function setTone(t) {
	tone = t;
	$('#tone-select').value = t;
	$('#tone-label').textContent = $(`#tone-select option[value="${t}"]`).textContent;
	$$('#tones button').forEach((b) => b.setAttribute('aria-checked', b.dataset.tone === t));
}

function setupHome() {
	$('#pick').addEventListener('change', (e) => (addFiles(e.target.files), (e.target.value = '')));
	$('#tone-select').addEventListener('change', (e) => setTone(e.target.value));
	$('#tones').addEventListener('click', (e) => e.target.closest('button') && setTone(e.target.closest('button').dataset.tone));
	const ask = $('#ask');
	ask.addEventListener('input', () => ((ask.style.height = 'auto'), (ask.style.height = `${ask.scrollHeight}px`)));
	ask.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			$('#composer').requestSubmit();
		}
	});
	const home = $('#home');
	let depth = 0;
	home.addEventListener('dragenter', (e) => (e.preventDefault(), depth++, home.classList.add('dragging')));
	home.addEventListener('dragover', (e) => e.preventDefault());
	home.addEventListener('dragleave', () => --depth <= 0 && ((depth = 0), home.classList.remove('dragging')));
	home.addEventListener('drop', (e) => {
		e.preventDefault();
		depth = 0;
		home.classList.remove('dragging');
		addFiles(e.dataTransfer.files);
	});
	$('#composer').addEventListener('submit', async (e) => {
		e.preventDefault();
		if (picked.length < 2) return;
		$('#send').disabled = true;
		$('#hint').textContent = 'Uploading…';
		const body = new FormData();
		body.append('video', picked[0].file);
		body.append('ad', picked[1].file);
		body.append('prompt', ask.value.trim() || 'Put my ad in this video');
		body.append('tone', tone);
		try {
			const res = await fetch('/api/runs', {method: 'POST', body});
			if (!res.ok) throw new Error(await res.text());
			const {id} = await res.json();
			picked.length = 0;
			ask.value = '';
			drawFiles();
			location.hash = `#/run/${id}`;
		} catch (err) {
			$('#hint').textContent = `Upload failed: ${err.message}`;
			$('#hint').classList.add('err');
			$('#send').disabled = false;
		}
	});
	drawFiles();
}

// ============================================================ studio: one run, drawn from its events

let S = null; // the run on screen
let source = null;

function newState(id) {
	return {id, token: Symbol(id), events: [], calls: new Map(), steps: new Map(), frames: [], duration: 0, moment: null, ad: null, still: null, result: null, done: false, inputs: {}, file: (p) => `/api/runs/${id}/files/${p}`};
}

function clearStudio() {
	SCAN.stop();
	$('#radar').hidden = true;
	$('#player-box').classList.remove('scanning');
	$('#thread').replaceChildren();
	$('#log').replaceChildren(h('li', {class: 'log-empty', text: 'Calls appear here as they leave'}));
	$('#cards').replaceChildren();
	$('#frames').replaceChildren(...Array.from({length: 12}, () => h('div', {class: 'ghost'})));
	['#ad-block', '#p-dot', '#p-tag', '#seg', '#wayin-row', '#badge'].forEach((s) => ($(s).hidden = true));
	$('#calls-count').textContent = '0';
	$('#calls-cost').textContent = money(0);
	$('#total-cost').textContent = money(0);
	$('#total-sub').textContent = 'No call yet';
	$('#export').setAttribute('aria-disabled', 'true');
	$('#export').removeAttribute('href');
	$('#follow button').disabled = true;
	setView('video', true);
}

async function openRun(id) {
	if (source) source.close();
	S = newState(id);
	clearStudio();
	try {
		S.inputs = await (await fetch(`/api/runs/${id}/inputs`)).json();
	} catch {
		$('#thread').replaceChildren(h('div', {class: 'empty-run', text: 'This run does not exist.'}));
		return;
	}
	const names = S.inputs.names || {};
	S.files = S.inputs.files || {video: 'video.mp4', ad: 'ad.mp4'};
	$('#title').replaceChildren(h('b', {text: stem(names.video)}), h('span', {text: `with ${stem(names.ad)}`}));
	S.player = {video: S.file(S.files.video), bridge: null};
	setView('video', true);
	drawYou();
	cards();
	listen(id, S.token);
}

function listen(id, token) {
	source = new EventSource(`/api/runs/${id}/events`);
	let seen = -1;
	const live = []; // events that arrive while the run is still going are drawn with motion
	source.onmessage = (m) => {
		if (!S || S.token !== token) return source.close();
		const ev = JSON.parse(m.data);
		if (ev.n <= seen) return; // the browser reconnects and replays: keep each event once
		seen = ev.n;
		S.events.push(ev);
		apply(ev, {animate: S.liveSeen});
		if (ev.type === 'end') source.close();
	};
	source.onopen = () => setTimeout(() => S && S.token === token && (S.liveSeen = true), 400);
}

function apply(ev, opt = {}) {
	(ON[ev.type] || (() => {}))(ev, opt);
}

// ------------------------------------------------------------ the conversation

function drawYou() {
	const names = S.inputs.names || {};
	S.att = {
		video: h('img', {alt: ''}),
		ad: h('img', {alt: ''}),
	};
	$('#thread').append(
		h('div', {class: 'you'},
			h('div', {class: 'bubble', text: S.inputs.prompt || 'Put my ad in this video'}),
			h('div', {class: 'att'},
				h('span', {}, S.att.video, h('em', {text: names.video || 'video'})),
				h('span', {}, S.att.ad, h('em', {text: names.ad || 'ad'})),
			),
		),
	);
}

function typeInto(el, text, animate) {
	if (!animate) return void (el.textContent = text);
	const token = S.token;
	let i = 0;
	const step = () => {
		if (!S || S.token !== token) return;
		i = Math.min(text.length, i + Math.max(1, Math.round(text.length / 70)));
		el.replaceChildren(text.slice(0, Math.max(0, i - 8)), h('span', {class: 'tail', text: text.slice(Math.max(0, i - 8), i)}));
		if (i < text.length) requestAnimationFrame(step);
		else el.textContent = text;
	};
	step();
}

function scrollThread() {
	const t = $('#thread');
	t.scrollTo({top: t.scrollHeight, behavior: 'smooth'});
}

const ON = {
	start(ev, {animate}) {
		S.mode = ev.mode;
		S.tone = ev.tone;
		if (ev.mode === 'simulation') {
			$('#badge').hidden = false;
			$('#badge').className = 'badge sim';
			$('#badge').textContent = 'Simulation';
			$('#thread').append(h('div', {class: 'note-sim', text: 'Simulation: no Meta API key on this machine. Every step runs on your files, but the model calls are simulated and marked so.'}));
		}
		S.msg = h('p', {class: 'msg'});
		$('#thread').append(S.msg);
		S.voiceOf = ev.voice_of;
		radar(true, ev.voice_of ? 'Taking your voice' : 'Watching the video');
		if (ev.voice_of) typeInto(S.msg, 'Same script, new voice: the bridge is rendered again.', animate);
		else {
			typeInto(S.msg, 'Watching your video and your ad…', animate);
			S.msg.classList.add('pending');
		}
		const list = h('ol', {class: 'steps'});
		for (const p of ev.plan) {
			const row = h('button', {type: 'button', class: 'st-row', 'aria-expanded': 'false'},
				h('span', {class: 'st-ico'}),
				h('span', {class: 'st-text'}, h('span', {class: 'st-label'}, STEP_TEXT[p.step] || p.title, p.model ? tag(p.model) : ''), h('span', {class: 'st-line'}, h('span', {class: 'st-sum'}), h('span', {class: 'st-meta'}))),
			);
			const li = h('li', {class: 'st wait', 'data-step': p.step}, row, h('div', {class: 'st-calls'}));
			row.addEventListener('click', () => {
				if (!li.classList.contains('has-calls')) return;
				li.classList.toggle('open');
				row.setAttribute('aria-expanded', li.classList.contains('open'));
			});
			S.steps.set(p.step, li);
			list.append(li);
		}
		$('#thread').append(list);
	},
	step(ev) {
		const li = S.steps.get(ev.step);
		if (!li) return;
		li.classList.remove('wait', 'run', 'done', 'skip', 'error');
		li.classList.add(ev.status);
		if (ev.summary) $('.st-sum', li).textContent = ev.summary;
		if (ev.status === 'run' && ev.step === 'animate') $('.st-sum', li).textContent = 'Rendering the move on this machine';
		if (ev.status === 'run') $('#radar-label').textContent = STEP_TEXT[ev.step] || ev.title || '';
		if (ev.status === 'error') li.classList.add('open');
	},
	say(ev, {animate}) {
		if (/^The way in/.test(ev.text)) return; // drawn as a card by the bridge event
		if (S.msg.classList.contains('pending')) {
			S.msg.classList.remove('pending');
			typeInto(S.msg, ev.text, animate);
		} else {
			const p = h('p', {class: 'msg'});
			S.msg.after(p);
			typeInto(p, ev.text, animate);
		}
	},
	call(ev) {
		let c = S.calls.get(ev.id);
		if (!c) {
			c = {data: {}, row: h('li', {class: 'call'}), detail: h('div', {class: 'call-detail'})};
			S.calls.set(ev.id, c);
			if (S.calls.size === 1) $('#log').replaceChildren();
			$('#log').append(c.row);
			const li = S.steps.get(ev.step);
			if (li) (li.classList.add('has-calls'), $('.st-calls', li).append(c.detail));
		}
		Object.assign(c.data, Object.fromEntries(Object.entries(ev).filter(([, v]) => v !== undefined)));
		drawCall(c);
		stepMeta(ev.step);
		totals();
	},
	media(ev, {animate}) {
		S.frames = ev.frames;
		S.duration = ev.video?.duration || 0;
		$('#frames').replaceChildren(...ev.frames.map((f, i) => h('img', {src: f.url, alt: '', style: {animationDelay: animate ? `${i * 30}ms` : '0ms'}})));
		S.att.video.src = ev.frames[0]?.url || '';
		if (S.view === 'video' && ev.frames[0]) $('#player').poster = ev.frames[0].url;
		S.att.ad.src = S.file('ad/a00.jpg');
		S.att.ad.onerror = () => S.att.ad.removeAttribute('src');
	},
	moment(ev) {
		S.moment = ev;
		S.still = ev.url;
		markMoment();
		if (S.view === 'video') seek(ev.at);
		$('#player').addEventListener('seeked', () => SCAN.sample(), {once: true});
	},
	ad(ev) {
		S.ad = ev;
		fillWrite();
	},
	cutout(ev) {
		SCAN.subject(ev.url);
		const fg = h('img', {class: 'fg', src: S.still, alt: 'The subject, cut out'});
		fg.style.webkitMaskImage = fg.style.maskImage = `url(${ev.url})`;
		fillCard('cut', h('div', {class: 'cut'}, h('img', {class: 'bg', src: S.still, alt: ''}), fg), h('p', {class: 'c-note', text: S.mode === 'simulation' ? 'Simulated mask: with a key, SAM 3.1 returns the real outline of the subject.' : `${ev.prompt ? `“${ev.prompt}”, ` : ''}cut out of the frozen frame by SAM 3.1. The move uses it to step out of its own picture.`}));
	},
	bridge(ev, {animate}) {
		S.bridge = ev;
		const card = h('div', {class: 'way'},
			h('small', {text: 'The way in'}),
			h('div', {class: 'lines'}, ...ev.lines.map((l) => h('div', {text: l}))),
			ev.why ? h('p', {class: 'why', text: ev.why}) : '',
			h('div', {class: 'chips'}, h('span', {text: `Move: ${ev.move}`}), h('span', {text: `Level ${ev.level}`}), S.tone ? h('span', {text: `Tone: ${S.tone}`}) : ''),
		);
		$('.steps', $('#thread'))?.after(card);
		$('#wayin-row').hidden = false;
		$('#wayin-pills').replaceChildren(...ev.lines.map((l) => h('i', {text: l})));
		fillWrite();
		if (animate) scrollThread();
	},
	invented(ev, {animate}) {
		const card = h('div', {class: 'way invented'},
			h('small', {text: 'New move, written by Muse Code'}),
			h('div', {class: 'lines'}, h('div', {text: ev.said || ev.move})),
			h('div', {class: 'chips'}, h('span', {text: `Move: ${ev.move}`}), h('span', {text: 'Level 3'}), h('span', {text: 'Type-checked, added to the library'})),
		);
		$('#thread').append(card);
		if (animate) scrollThread();
	},
	review(ev, {animate}) {
		const strip = h('div', {class: 'rv-frames'}, ...(ev.frames || []).map((f) => h('img', {src: f.url, alt: `at ${f.t}s`})));
		const verdict = ev.ok || !ev.problems?.length
			? h('p', {class: 'rv-ok', text: ev.round > 1 ? 'Watched again after the fix: nothing left to fix.' : 'Watched frame by frame: nothing to fix.'})
			: h('ul', {class: 'rv-problems'}, ...ev.problems.map((p) => h('li', {}, h('b', {text: `${Number(p.at).toFixed(1)} s `}), p.what)));
		const card = h('div', {class: `way review ${ev.ok ? 'ok' : 'bad'}`},
			h('small', {text: ev.round > 1 ? 'Muse Spark watched it again' : 'Muse Spark watched the bridge'}),
			strip, verdict,
			!ev.ok && ev.advice ? h('p', {class: 'why', text: `Fix: ${ev.advice}`}) : '',
		);
		$('#thread').append(card);
		if (animate) scrollThread();
	},
	result(ev) {
		radar(false);
		S.result = ev;
		S.player.bridge = ev.url;
		$('#seg').hidden = false;
		setView('bridge');
		const ex = $('#export');
		ex.href = ev.url;
		ex.setAttribute('download', `${stem(S.inputs.names?.video)}-with-ad.mp4`);
		ex.removeAttribute('aria-disabled');
		fillAnimate(ev);
	},
	end(ev, {animate}) {
		radar(false);
		S.done = true;
		totals(ev.total);
		$('#follow button').disabled = !$('#follow-text').value.trim();
		const t = ev.total || {};
		if (ev.status === 'no-bridge') $('#thread').append(h('p', {class: 'msg', text: 'No moment here was good enough, so there is no bridge: the ad plays as usual, and nothing gets cut off.'}));
		if (ev.status === 'error') $('#thread').append(h('p', {class: 'msg', style: {color: 'var(--red)'}, text: 'The run stopped. The failed step above says why.'}));
		$('#thread').append(h('div', {class: 'done-line'},
			h('span', {}, ev.status === 'done' ? 'Done in ' : 'Stopped after ', h('b', {text: `${Math.round(t.seconds || 0)} s`})),
			h('span', {}, h('b', {text: String(t.calls || 0)}), ' Meta calls'),
			h('span', {}, h('b', {text: money(t.cost)}), S.mode === 'simulation' ? ' estimated' : ''),
			h('button', {type: 'button', text: 'See every call', onclick: () => openCalls(true)}),
		));
		if (ev.status === 'done') voiceCard();
		if (animate) scrollThread();
		loadRecents();
	},
};

// ------------------------------------------------------------ the analysis drawn over the player while the run works
// The frame on screen is really analysed: its edges (a Sobel filter) light up as a scan line passes and stay found,
// the frame becomes a 3D mesh whose depth is its brightness and lifts in a wave under the scan, and once SAM 3.1
// has cut the subject out, its outline is traced. All drawn here, in white, on a canvas.

const SCAN = (() => {
	const SW = 192, SH = 108, GW = 64, GH = 36, BAND = 0.075, PERIOD = 2.8;
	const off = document.createElement('canvas');
	off.width = SW;
	off.height = SH;
	const octx = off.getContext('2d', {willReadFrequently: true});
	let cvs = null, ctx = null, raf = 0, t0 = 0, lum = null, edges = [], mem = null, outline = [], outlineAt = 0, box = null, mean = 0;

	function analyse(img) {
		let px;
		try {
			octx.clearRect(0, 0, SW, SH);
			octx.drawImage(img, 0, 0, SW, SH);
			px = octx.getImageData(0, 0, SW, SH).data;
		} catch {
			return;
		}
		const L = new Float32Array(SW * SH);
		let lo = 1, hi = 0;
		for (let i = 0; i < SW * SH; i++) {
			const v = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
			L[i] = v;
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		const k = hi > lo ? 1 / (hi - lo) : 1; // the night video is dark: stretch it before looking for edges
		mean = 0;
		for (let i = 0; i < L.length; i++) (L[i] = (L[i] - lo) * k), (mean += L[i]);
		mean /= L.length;
		const pts = [];
		for (let y = 1; y < SH - 1; y++)
			for (let x = 1; x < SW - 1; x++) {
				const a = (dx, dy) => L[(y + dy) * SW + x + dx];
				const gx = -a(-1, -1) - 2 * a(-1, 0) - a(-1, 1) + a(1, -1) + 2 * a(1, 0) + a(1, 1);
				const gy = -a(-1, -1) - 2 * a(0, -1) - a(1, -1) + a(-1, 1) + 2 * a(0, 1) + a(1, 1);
				const m = Math.hypot(gx, gy);
				if (m > 0.5) pts.push([x / SW, y / SH, Math.min(1, m / 1.5)]);
			}
		const step = Math.ceil(pts.length / 2600) || 1;
		edges = pts.filter((_, i) => i % step === 0);
		mem = new Float32Array(edges.length);
		lum = L;
	}

	function sample() {
		const v = $('#player');
		if (v && v.readyState >= 2 && v.videoWidth) return analyse(v);
		if (v?.poster) {
			const im = new Image();
			im.onload = () => analyse(im);
			im.src = v.poster;
		}
	}

	function subject(url) {
		const im = new Image();
		im.onload = () => {
			let d;
			try {
				octx.clearRect(0, 0, SW, SH);
				octx.drawImage(im, 0, 0, SW, SH);
				d = octx.getImageData(0, 0, SW, SH).data;
			} catch {
				return;
			}
			const on = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && d[(y * SW + x) * 4] > 127;
			const pts = [];
			let cx = 0, cy = 0, n = 0, x0 = 1, y0 = 1, x1 = 0, y1 = 0;
			for (let y = 0; y < SH; y++)
				for (let x = 0; x < SW; x++) {
					if (!on(x, y)) continue;
					cx += x, cy += y, n++;
					x0 = Math.min(x0, x / SW), y0 = Math.min(y0, y / SH), x1 = Math.max(x1, x / SW), y1 = Math.max(y1, y / SH);
					if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) pts.push([x / SW, y / SH]);
				}
			if (!n) return;
			cx /= n * SW, cy /= n * SH;
			outline = pts.map(([x, y]) => [x, y, Math.atan2(y - cy, x - cx)]).sort((a, b) => a[2] - b[2]);
			box = [x0, y0, x1, y1];
			outlineAt = performance.now();
		};
		im.src = url;
	}

	function draw(now) {
		raf = requestAnimationFrame(draw);
		const el = $('#player-box');
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const W = Math.round(el.clientWidth * dpr), H = Math.round(el.clientHeight * dpr);
		if (cvs.width !== W || cvs.height !== H) (cvs.width = W), (cvs.height = H);
		const t = (now - t0) / 1000;
		const sx = ((t % PERIOD) / PERIOD) * 1.3 - 0.15; // the scan line, from just off the left edge to just off the right
		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = 'rgba(6, 6, 10, 0.3)';
		ctx.fillRect(0, 0, W, H);
		const ar = W / H, f = 2.4;
		const lift = (u) => Math.exp(-(((u - sx) / BAND) ** 2));
		const at = (u, v) => (lum ? lum[Math.min(SH - 1, Math.round(v * (SH - 1))) * SW + Math.min(SW - 1, Math.round(u * (SW - 1)))] : 0.5);
		// a gentle camera sway, so the mesh reads as 3D even between two passes
		const yaw = Math.sin(t * 0.6) * 0.05, pitch = 0.08 + Math.sin(t * 0.45) * 0.03;
		const proj = (u, v, z) => {
			let X = (u - 0.5) * 2 * ar, Y = (v - 0.5) * 2, Z = z;
			const x2 = X * Math.cos(yaw) + Z * Math.sin(yaw), z2 = -X * Math.sin(yaw) + Z * Math.cos(yaw);
			const y3 = Y * Math.cos(pitch) - z2 * Math.sin(pitch), z3 = Y * Math.sin(pitch) + z2 * Math.cos(pitch);
			const s = f / (f - z3);
			return [W / 2 + (x2 * s * H) / 2, H / 2 + (y3 * s * H) / 2];
		};
		const depth = (u, v) => lift(u) * (0.12 + 0.42 * at(u, v)) + 0.025 * at(u, v);
		// the mesh: rows lit by a gradient that follows the scan, columns lit one by one
		const grad = ctx.createLinearGradient(0, 0, W, 0);
		const clamp01 = (x) => Math.max(0, Math.min(1, x));
		[-0.25, -0.1, 0, 0.1, 0.25].forEach((o, i) => grad.addColorStop(clamp01((sx + o * 1.0 + 0.0 - 0) * 1), `rgba(255,255,255,${[0.05, 0.16, 0.5, 0.16, 0.05][i]})`));
		ctx.lineWidth = 1 * dpr;
		ctx.strokeStyle = grad;
		for (let jy = 0; jy <= GH; jy++) {
			ctx.beginPath();
			for (let ix = 0; ix <= GW; ix++) {
				const u = ix / GW, v = jy / GH;
				const [x, y] = proj(u, v, depth(u, v));
				ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
			}
			ctx.stroke();
		}
		for (let ix = 0; ix <= GW; ix++) {
			const u = ix / GW;
			ctx.strokeStyle = `rgba(255,255,255,${(0.045 + 0.4 * lift(u)).toFixed(3)})`;
			ctx.beginPath();
			for (let jy = 0; jy <= GH; jy++) {
				const v = jy / GH;
				const [x, y] = proj(u, v, depth(u, v));
				jy ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
			}
			ctx.stroke();
		}
		// the edges: lit as the scan passes, then they stay found
		ctx.globalCompositeOperation = 'lighter';
		ctx.fillStyle = '#fff';
		const r = 1.6 * dpr;
		for (let i = 0; i < edges.length; i++) {
			const [u, v, m] = edges[i];
			const g = lift(u);
			mem[i] = Math.max(mem[i] * 0.994, g);
			const a = (0.06 + 0.9 * Math.max(g, mem[i] * 0.45)) * (0.35 + 0.65 * m);
			if (a < 0.03) continue;
			const [x, y] = proj(u, v, depth(u, v));
			ctx.globalAlpha = a;
			ctx.fillRect(x - r / 2, y - r / 2, r, r);
		}
		ctx.globalAlpha = 1;
		// the scan line itself: a soft band and a bright core
		const xs = proj(clamp01(sx), 0.5, 0)[0];
		const band = ctx.createLinearGradient(xs - 90 * dpr, 0, xs + 90 * dpr, 0);
		band.addColorStop(0, 'rgba(255,255,255,0)');
		band.addColorStop(0.5, 'rgba(255,255,255,0.16)');
		band.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = band;
		ctx.fillRect(xs - 90 * dpr, 0, 180 * dpr, H);
		ctx.fillStyle = 'rgba(255,255,255,0.95)';
		ctx.shadowColor = '#fff';
		ctx.shadowBlur = 18 * dpr;
		ctx.fillRect(xs - 1 * dpr, 0, 2 * dpr, H);
		ctx.shadowBlur = 0;
		// the subject SAM 3.1 found: its outline traced around it, then its box
		if (outline.length) {
			const k = Math.min(1, (now - outlineAt) / 1400);
			const shown = Math.floor(outline.length * k);
			ctx.fillStyle = '#fff';
			for (let i = 0; i < shown; i++) {
				const [u, v] = outline[i];
				const [x, y] = proj(u, v, depth(u, v));
				ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4 + i * 0.05);
				ctx.fillRect(x - 1.5 * dpr, y - 1.5 * dpr, 3 * dpr, 3 * dpr);
			}
			ctx.globalAlpha = 1;
			if (k >= 1 && box) {
				const [a0, b0] = proj(box[0], box[1], 0), [a1, b1] = proj(box[2], box[3], 0);
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 2 * dpr;
				const c = 22 * dpr;
				ctx.beginPath();
				[[a0, b0, 1, 1], [a1, b0, -1, 1], [a0, b1, 1, -1], [a1, b1, -1, -1]].forEach(([x, y, dx, dy]) => {
					ctx.moveTo(x + dx * c, y);
					ctx.lineTo(x, y);
					ctx.lineTo(x, y + dy * c);
				});
				ctx.stroke();
			}
		}
		ctx.globalCompositeOperation = 'source-over';
		// a viewfinder and the numbers being read
		const m = 22 * dpr, c = 26 * dpr;
		ctx.strokeStyle = 'rgba(255,255,255,0.85)';
		ctx.lineWidth = 2 * dpr;
		ctx.beginPath();
		[[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m - 46 * dpr, 1, -1], [W - m, H - m - 46 * dpr, -1, -1]].forEach(([x, y, dx, dy]) => {
			ctx.moveTo(x + dx * c, y);
			ctx.lineTo(x, y);
			ctx.lineTo(x, y + dy * c);
		});
		ctx.stroke();
		ctx.font = `500 ${11 * dpr}px "Geist Mono", ui-monospace, monospace`;
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		const found = mem ? mem.reduce((s, x) => s + (x > 0.3 ? 1 : 0), 0) : 0;
		const lines = [`EDGES   ${String(found).padStart(4, ' ')} / ${edges.length}`, `MESH    ${GW} x ${GH}  DEPTH ${mean.toFixed(2)}`, outline.length ? `SUBJECT ${outline.length} PX OUTLINE` : `SCAN    ${Math.round(clamp01(sx) * 100)}%`];
		lines.forEach((s, i) => ctx.fillText(s, m + 10 * dpr, m + 34 * dpr + i * 16 * dpr));
	}

	return {
		start() {
			if (!cvs) {
				cvs = $('#scan');
				ctx = cvs.getContext('2d');
			}
			cancelAnimationFrame(raf);
			outline = [];
			box = null;
			t0 = performance.now();
			sample();
			raf = requestAnimationFrame(draw);
		},
		stop() {
			cancelAnimationFrame(raf);
			raf = 0;
		},
		sample,
		subject,
	};
})();

// ------------------------------------------------------------ the radar over the player while the run works

function radar(on, label) {
	const r = $('#radar');
	if (!r) return;
	if (label) $('#radar-label').textContent = label;
	if (on) {
		r.classList.remove('out');
		r.hidden = false;
		$('#player-box').classList.add('scanning');
		SCAN.start();
	} else if (!r.hidden) {
		r.classList.add('out');
		$('#player-box').classList.remove('scanning');
		setTimeout(() => r.classList.contains('out') && ((r.hidden = true), SCAN.stop()), 500);
	}
}

// ------------------------------------------------------------ who says the script: asked once the bridge is there

function voiceCard() {
	const spec = S.result?.spec;
	if (!spec || !spec.lines?.length) return;
	const texts = spec.move === 'thought' ? [spec.lines.join(' ')] : spec.lines;
	const v = spec.voices?.[0];
	const now = !v ? 'nobody: text only' : v.voice === 'your recording' ? 'your own recording' : `the Mac's voice (${String(v.voice).split(' (')[0]})`;
	const status = h('p', {class: 'why vstat'});
	const send = async (choice, files = []) => {
		const body = new FormData();
		body.append('choice', choice);
		files.forEach((f) => body.append('files', f));
		status.textContent = 'Rendering the bridge again with this voice…';
		try {
			const res = await fetch(`/api/runs/${S.id}/voice`, {method: 'POST', body});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
			location.hash = `#/run/${(await res.json()).id}`;
		} catch (err) {
			status.textContent = `Could not start: ${err.message}`;
		}
	};
	const go = h('button', {type: 'submit', class: 'vgo', disabled: true, text: texts.length > 1 ? 'Put my recordings in' : 'Put my recording in'});
	const zones = texts.map((t) => {
		const name = h('span', {class: 'vname', text: texts.length > 1 ? `Drop your recording of “${t}”` : 'Drop your recording of the whole line'});
		const input = h('input', {type: 'file', accept: 'audio/*'});
		const label = h('label', {}, h('span', {class: 'ico', text: '♪'}), name, input);
		input.addEventListener('change', () => {
			const f = input.files[0];
			label.classList.toggle('ok', !!f);
			$('.ico', label).textContent = f ? '✓' : '♪';
			name.textContent = f ? `${f.name}  ·  “${t}”` : `Drop your recording of “${t}”`;
			go.disabled = zones.some((z) => !$('input', z).files[0]);
		});
		return label;
	});
	const own = h('form', {class: 'vown', hidden: true}, ...zones, go);
	own.addEventListener('submit', (e) => {
		e.preventDefault();
		const files = zones.map((z) => $('input', z).files[0]);
		if (files.some((f) => !f)) return (status.textContent = 'One recording per line, please.');
		send('own', files);
	});
	const pick = (btn) => $$('.vchoices button', card).forEach((b) => b.classList.toggle('on', b === btn));
	const card = h('div', {class: 'way voice'},
		h('small', {text: 'Who says it?'}),
		h('div', {class: 'lines'}, ...texts.map((t) => h('div', {text: t}))),
		h('p', {class: 'why', text: `This is what the bridge says. Right now: ${now}.` + (SYSVOICE ? '' : ' This machine has no system voice good enough: give your own recording, or keep it as text.')}),
		h('div', {class: `vchoices${SYSVOICE ? '' : ' two'}`},
			SYSVOICE ? h('button', {type: 'button', 'data-choice': 'system', text: "Mac's voice", onclick: (e) => (pick(e.currentTarget), send('system'))}) : null,
			h('button', {type: 'button', 'data-choice': 'own', text: 'My voice', onclick: (e) => (pick(e.currentTarget), (own.hidden = false), scrollThread())}),
			h('button', {type: 'button', 'data-choice': 'none', text: 'No voice', onclick: (e) => (pick(e.currentTarget), send('none'))}),
		),
		own, status,
	);
	$('#thread').append(card);
}


function stepMeta(step) {
	const li = S.steps.get(step);
	if (!li) return;
	const cs = [...S.calls.values()].map((c) => c.data).filter((c) => c.step === step);
	const done = cs.filter((c) => c.status === 'done');
	const ms = done.reduce((s, c) => s + (c.ms || 0), 0);
	const cost = done.reduce((s, c) => s + (c.cost || 0), 0);
	const meta = $('.st-meta', li);
	if (!done.length) return void (meta.textContent = cs.some((c) => c.status === 'run') ? 'calling…' : '');
	meta.replaceChildren(`${(ms / 1000).toFixed(1)} s · ${money(cost)}`, done.some((c) => c.simulated) ? h('span', {class: 'sim', text: ' · sim'}) : '');
}

function drawCall(c) {
	const d = c.data;
	const open = c.row.classList.contains('open');
	c.row.className = `call ${d.status}${open ? ' open' : ''}`;
	const u = d.usage || {};
	const meta = [];
	if (d.ms !== undefined) meta.push(`${(d.ms / 1000).toFixed(1)} s`);
	if (u.input !== undefined) meta.push(`${num(u.input)} tokens in${u.estimated ? '*' : ''}`);
	if (u.output !== undefined) meta.push(`${num(u.output)} out`);
	if (u.cached) meta.push(`${num(u.cached)} cached`);
	if (u.audio_seconds !== undefined) meta.push(`${u.audio_seconds} s of audio`);
	if (u.images !== undefined) meta.push(`${u.images} image`);
	const pretty = (x) => (x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x, null, 2).replace(/\\n/g, '\n'));
	const detail = () => [
		h('h4', {text: 'Sent'}), h('pre', {text: pretty(d.request)}),
		d.error ? [h('h4', {text: 'Error'}), h('pre', {class: 'err', text: d.error})] : [h('h4', {text: 'Received'}), h('pre', {text: d.status === 'run' ? 'Waiting for the answer…' : pretty(d.response)})],
	];
	c.detail.replaceChildren(...detail().flat());
	c.row.replaceChildren(
		h('button', {type: 'button', 'aria-expanded': String(open), onclick: () => (c.row.classList.toggle('open'), drawCall(c))},
			h('span', {class: 'c-top'}, tag(d.model), h('span', {text: d.label})),
			h('span', {class: 'c-cost', text: d.status === 'run' ? '' : d.status === 'error' ? 'failed' : money(d.cost)}),
			h('span', {class: 'c-meta'}, ...meta.map((m) => h('span', {text: m})), d.simulated ? h('span', {class: 'sim', text: 'simulated'}) : ''),
		),
		h('div', {class: 'call-detail'}, ...detail().flat()),
	);
}

function totals(final) {
	const all = [...S.calls.values()].map((c) => c.data);
	const done = all.filter((c) => c.status === 'done');
	const cost = final ? final.cost : done.reduce((s, c) => s + (c.cost || 0), 0);
	const tin = done.reduce((s, c) => s + ((c.usage || {}).input || 0), 0);
	const tout = done.reduce((s, c) => s + ((c.usage || {}).output || 0), 0);
	$('#calls-count').textContent = all.length;
	$('#calls-cost').textContent = money(cost);
	$('#total-cost').textContent = money(cost);
	const sim = done.some((c) => c.simulated);
	$('#total-sub').textContent = `${done.length} calls · ${num(tin)} tokens in · ${num(tout)} out${final ? ` · ${Math.round(final.seconds)} s` : ''}${sim ? ' · simulated, so the figures are estimates' : ''}`;
	$('#calls-sub').textContent = sim ? 'Simulated: no API key on this machine' : 'Every call, as it happens';
}

// ------------------------------------------------------------ the cards: cut out, the way in, animate

const CARDS = [
	{id: 'cut', title: 'Cut out', model: 'sam-3.1', accent: 'var(--pink)', wait: 'Waiting for the moment'},
	{id: 'write', title: 'The way in', model: 'muse-spark-1.3', accent: 'var(--yellow)', wait: 'Waiting for the line'},
	{id: 'animate', title: 'Animate', model: 'Remotion', local: true, accent: 'var(--cyan)', wait: 'Waiting for the move', dark: true},
];

function cards() {
	$('#cards').replaceChildren(...CARDS.map((c) => h('article', {class: `card wait${c.dark ? ' dark' : ''}`, 'data-id': c.id, style: {'--accent': c.accent}},
		h('div', {class: 'c-head'}, h('h3', {text: c.title}), h('span', {class: 'grow'}), tag(c.model, c.local ? 'local' : '')),
		h('div', {class: 'c-body'}, h('div', {class: 'c-wait', text: c.wait})),
	)));
}

function fillCard(id, ...body) {
	const el = $(`#cards .card[data-id="${id}"]`);
	if (!el) return;
	const conf = CARDS.find((c) => c.id === id);
	el.classList.remove('wait');
	el.classList.add('in');
	el.style.setProperty('--accent', conf.accent);
	$('.c-body', el).replaceChildren(...body);
}

function fillWrite() {
	if (!S.bridge) return;
	const ad = S.ad;
	fillCard('write',
		h('div', {class: 'ft', style: {'--c': 'var(--pink)'}}, h('img', {src: S.still || '', alt: ''}), h('div', {class: 'tx'}, h('small', {text: 'From the video'}), h('div', {text: S.bridge.lines[0]}))),
		h('div', {class: 'ft', style: {'--c': 'var(--blue)'}}, h('img', {src: ad?.url || S.file('ad/a00.jpg'), alt: ''}), h('div', {class: 'tx'}, h('small', {text: 'To the ad'}), h('div', {text: S.bridge.lines[1] || (ad ? ad.product : '')}), ad ? h('p', {text: `${ad.brand}: ${ad.promise}`}) : '')),
	);
}

function fillAnimate(ev) {
	const spec = ev.spec || {};
	const show = {move: spec.move, freezeAt: spec.freezeAt, lines: spec.lines};
	const code = h('pre', {class: 'code'});
	const json = JSON.stringify(show, null, 2);
	code.innerHTML = json
		.replace(/&/g, '&amp;').replace(/</g, '&lt;')
		.replace(/"(\w+)":/g, '<span class="k">"$1"</span>:')
		.replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>')
		.replace(/^(\s+)"([^"]*)"(,?)$/gm, '$1<span class="s">"$2"</span>$3')
		.replace(/: (-?[\d.]+)/g, ': <span class="n">$1</span>');
	const mini = h('div', {class: 'mini'}, h('video', {src: ev.url, muted: true, loop: true, playsinline: true, autoplay: true, preload: 'auto'}));
	fillCard('animate', code, mini, h('p', {class: 'c-note', text: String(spec.move || '').startsWith('gen-') ? `Move “${spec.move}”, written by Muse Code for this video, rendered on this machine with Remotion.` : `Library move “${spec.move}”, rendered on this machine with Remotion. No model call here.`}));
}

// ------------------------------------------------------------ the player, the strip and the moment

function setView(view, quiet) {
	if (!S) return;
	const src = view === 'bridge' ? S.player?.bridge : S.player?.video;
	if (!src) return;
	S.view = view;
	$$('#seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view));
	const p = $('#player');
	const poster = view === 'bridge' ? S.still : S.frames[0]?.url;
	if (poster) p.poster = poster;
	if (p.getAttribute('src') !== src) {
		p.src = src;
		p.load();
	}
	$('#player-box').classList.remove('playing');
	$('#strip').style.opacity = view === 'bridge' ? 0.45 : 1;
	markMoment();
	if (!quiet && view === 'video' && S.moment) seek(S.moment.at);
}

function markMoment() {
	const show = S && S.moment && S.duration && S.view === 'video';
	['#p-dot', '#p-tag', '#ad-block'].forEach((s) => ($(s).hidden = !show));
	if (!show) return;
	const pct = `${(100 * S.moment.at) / S.duration}%`;
	$('#p-dot').style.left = pct;
	$('#p-tag').style.left = pct;
	$('#p-tag').textContent = `Best moment · ${clockTenth(S.moment.at)}`;
	$('#ad-block').style.left = pct;
}

function seek(t) {
	const p = $('#player');
	const go = () => {
		p.pause();
		p.currentTime = t;
	};
	p.readyState >= 1 ? go() : p.addEventListener('loadedmetadata', go, {once: true});
}

function setupPlayer() {
	const p = $('#player');
	const box = $('#player-box');
	const toggle = () => (p.paused ? p.play() : p.pause());
	p.addEventListener('click', toggle);
	$('#big-play').addEventListener('click', toggle);
	p.addEventListener('play', () => box.classList.add('playing'));
	p.addEventListener('pause', () => box.classList.remove('playing'));
	p.addEventListener('ended', () => box.classList.remove('playing'));
	const tick = () => {
		const d = p.duration || 0;
		const t = p.currentTime || 0;
		$('#p-fill').style.width = d ? `${(100 * t) / d}%` : '0';
		$('#p-time').textContent = `${clock(t)} / ${clock(d)}`;
		$('#head').style.left = S?.view === 'video' && d ? `${(100 * t) / d}%` : '-10px';
	};
	['timeupdate', 'loadedmetadata', 'seeked'].forEach((e) => p.addEventListener(e, tick));
	$('#p-bar').addEventListener('click', (e) => {
		const r = e.currentTarget.getBoundingClientRect();
		if (p.duration) p.currentTime = ((e.clientX - r.left) / r.width) * p.duration;
	});
	$('#p-tag').addEventListener('click', (e) => (e.stopPropagation(), S?.moment && seek(S.moment.at)));
	$('#strip').addEventListener('click', (e) => {
		if (!S?.duration) return;
		const r = e.currentTarget.getBoundingClientRect();
		const t = ((e.clientX - r.left) / r.width) * S.duration;
		if (S.view !== 'video') setView('video', true);
		seek(t);
	});
	$('#seg').addEventListener('click', (e) => e.target.closest('button') && setView(e.target.closest('button').dataset.view));
}

// ------------------------------------------------------------ the calls drawer, replay, follow-up

function openCalls(open) {
	$('#calls').hidden = !open;
	$('#calls-btn').setAttribute('aria-expanded', String(open));
}

async function replay() {
	if (!S || !S.events.length || !S.done) return;
	const events = S.events.slice();
	const keep = {inputs: S.inputs, files: S.files, id: S.id};
	S = Object.assign(newState(keep.id), keep, {done: false});
	const token = S.token;
	clearStudio();
	S.player = {video: S.file(S.files.video), bridge: null};
	setView('video', true);
	const badge = $('#badge');
	drawYou();
	cards();
	$('#replay').disabled = true;
	let last = 0;
	for (const ev of events) {
		// the run's own pace, with long waits cut short: model calls up to 1.6 s, the render to 2.5 s
		const gap = Math.max(0, ev.t - last);
		last = ev.t;
		const cap = ev.type === 'result' ? 2500 : 1600;
		await sleep(Math.min(gap * 1000, cap) + (ev.type === 'step' && ev.status === 'run' ? 260 : 0));
		if (!S || S.token !== token) return;
		S.events.push(ev);
		apply(ev, {animate: true});
		badge.hidden = false;
		badge.className = 'badge replay';
		badge.textContent = 'Replay · waits shortened';
	}
	S.done = true;
	$('#replay').disabled = false;
}

function setupStudio() {
	$('#calls-btn').addEventListener('click', () => openCalls($('#calls').hidden));
	$('#calls-close').addEventListener('click', () => openCalls(false));
	document.addEventListener('keydown', (e) => e.key === 'Escape' && openCalls(false));
	$('#replay').addEventListener('click', replay);
	const input = $('#follow-text');
	input.addEventListener('input', () => ($('#follow button').disabled = !input.value.trim() || !S?.done));
	$('#follow').addEventListener('submit', async (e) => {
		e.preventDefault();
		const text = input.value.trim();
		if (!text || !S?.done) return;
		$('#follow button').disabled = true;
		const body = new FormData();
		body.append('from_run', S.id);
		body.append('prompt', text);
		body.append('tone', S.tone || '');
		try {
			const res = await fetch('/api/runs', {method: 'POST', body});
			if (!res.ok) throw new Error(await res.text());
			input.value = '';
			location.hash = `#/run/${(await res.json()).id}`;
		} catch (err) {
			input.value = '';
			input.placeholder = `Could not start: ${err.message}`;
		}
	});
}

// ============================================================ routing

function route() {
	const m = location.hash.match(/^#\/run\/([\w-]+)/);
	$('#home').hidden = !!m;
	$('#studio').hidden = !m;
	openCalls(false);
	if (m) openRun(m[1]);
	else {
		if (source) source.close();
		S = null;
		$('#player').removeAttribute('src');
		loadRecents();
		$('#ask').focus();
	}
}

setupHome();
setupPlayer();
setupStudio();
loadMode();
window.addEventListener('hashchange', route);
route();
