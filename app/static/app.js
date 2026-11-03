// AdistributionSystem interface. Plain JS, no build step: the server streams the run's events and this page draws them.

const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') el.className = v;
		else if (k === 'text') el.textContent = v;
		else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
		else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
	}
	for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
	return el;
};
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const money = (x) => (x > 0 && x < 0.0001 ? '<$0.0001' : `$${(x || 0).toFixed(4)}`);
const num = (x) => (x || 0).toLocaleString('en-US');
const MODEL_NAME = {
	'muse-spark-1.3': 'Muse Spark',
	'muse-wonder-1.0': 'Muse Wonder',
	'sam-3.1': 'SAM 3.1',
	'muse-voice-transcribe-1.0': 'Muse Voice Transcribe',
	'muse-image-1.0': 'Muse Image',
};
const tag = (model) => h('span', {class: 'tag', 'data-m': model, text: MODEL_NAME[model] || model});

// ------------------------------------------------------------ mode

async function loadMode() {
	try {
		const {mode} = await (await fetch('/api/status')).json();
		const el = $('#mode');
		el.classList.add(mode);
		$('#mode-text').textContent = mode === 'live' ? 'Live · Meta Model API' : 'Simulation · no API key';
	} catch {
		$('#mode-text').textContent = 'Server offline';
	}
}

// ------------------------------------------------------------ home: two slots, a request, a tone

const picked = {video: null, ad: null};
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
			c.width = 240;
			c.height = Math.round((240 * v.videoHeight) / v.videoWidth) || 135;
			c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
			resolve({src: c.toDataURL('image/jpeg', 0.8), duration: v.duration});
		}, {once: true});
		v.addEventListener('error', () => resolve({src: '', duration: 0}), {once: true});
	});
}

async function setSlot(kind, file) {
	const slot = $(`.slot[data-kind="${kind}"]`);
	picked[kind] = file;
	if (!file) {
		slot.classList.remove('filled');
		return refresh();
	}
	$('.slot-name', slot).textContent = file.name;
	$('.slot-dur', slot).textContent = '…';
	slot.classList.add('filled');
	refresh();
	const {src, duration} = await thumbOf(file);
	$('img', slot).src = src;
	$('.slot-dur', slot).textContent = duration ? clock(duration) : 'video';
}

function refresh() {
	const ready = picked.video && picked.ad;
	$('#send').disabled = !ready;
	$('#hint').textContent = ready ? 'Ready' : !picked.video && !picked.ad ? 'Add a video and an ad' : picked.video ? 'Now the ad' : 'Now the video';
}

function setupHome() {
	document.querySelectorAll('.slot').forEach((slot) => {
		const input = $('input', slot);
		input.addEventListener('change', () => input.files[0] && setSlot(slot.dataset.kind, input.files[0]));
		$('.slot-x', slot).addEventListener('click', (e) => {
			e.preventDefault();
			input.value = '';
			setSlot(slot.dataset.kind, null);
		});
	});
	const form = $('#composer');
	['dragenter', 'dragover'].forEach((t) => form.addEventListener(t, (e) => (e.preventDefault(), form.classList.add('drag'))));
	['dragleave', 'drop'].forEach((t) => form.addEventListener(t, () => form.classList.remove('drag')));
	form.addEventListener('drop', (e) => {
		e.preventDefault();
		const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('video/'));
		for (const f of files) setSlot(!picked.video ? 'video' : 'ad', f);
	});
	$('#tones').addEventListener('click', (e) => {
		const b = e.target.closest('button');
		if (!b) return;
		tone = b.dataset.tone;
		document.querySelectorAll('#tones button').forEach((x) => x.setAttribute('aria-checked', x === b));
	});
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (!picked.video || !picked.ad) return;
		$('#send').disabled = true;
		$('#hint').textContent = 'Uploading…';
		const body = new FormData();
		body.append('video', picked.video);
		body.append('ad', picked.ad);
		body.append('prompt', $('#ask').value.trim() || 'Put my ad in this video');
		body.append('tone', tone);
		try {
			const res = await fetch('/api/runs', {method: 'POST', body});
			if (!res.ok) throw new Error(await res.text());
			const {id} = await res.json();
			location.hash = `#/run/${id}`;
		} catch (err) {
			$('#hint').textContent = `Upload failed: ${err.message}`;
			$('#send').disabled = false;
		}
	});
}

async function loadHistory() {
	const runs = await (await fetch('/api/runs')).json().catch(() => []);
	$('#history').hidden = !runs.length;
	$('#history-list').replaceChildren(...runs.map((r) => h('li', {}, h('a', {href: `#/run/${r.id}`},
		h('span', {class: 'h-names'}, h('b', {text: r.names.video || 'video'}), ' with ', r.names.ad || 'ad', r.lines ? h('span', {class: 'h-line', text: `  “${r.lines.join(' ')}”`}) : ''),
		h('span', {class: 'h-meta', text: `${r.mode === 'simulation' ? 'sim · ' : ''}${r.total.calls} calls · ${money(r.total.cost)}`}),
	))));
}

// ------------------------------------------------------------ studio: one run, drawn from its events

let source = null;
let run = null;

function resetStudio() {
	run = {id: null, seen: -1, calls: new Map(), frames: [], files: {}};
	['#says', '#plan', '#strip', '#cards', '#log', '#chips'].forEach((s) => $(s).replaceChildren());
	$('#marker').hidden = true;
	$('#count').textContent = '0';
	$('#total-cost').textContent = money(0);
	$('#total-sub').textContent = 'No call yet';
	$('#player').removeAttribute('src');
}

async function openRun(id) {
	if (source) source.close();
	resetStudio();
	run.id = id;
	const file = (p) => `/api/runs/${id}/files/${p}`;
	run.file = file;
	try {
		const inp = await (await fetch(`/api/runs/${id}/inputs`)).json();
		run.files = inp.files || {video: 'video.mp4', ad: 'ad.mp4'};
		$('#you').textContent = inp.prompt || 'Put my ad in this video';
		$('#crumb').replaceChildren(h('b', {text: inp.names.video}), ' with ', inp.names.ad);
		$('#chips').append(
			h('span', {class: 'chip'}, h('video', {src: file(run.files.video), muted: true, preload: 'metadata'}), h('span', {text: inp.names.video})),
			h('span', {class: 'chip'}, h('video', {src: file(run.files.ad), muted: true, preload: 'metadata'}), h('span', {text: inp.names.ad})),
		);
		$('#player').src = file(run.files.video);
	} catch {
		$('#you').textContent = 'Run not found';
	}
	source = new EventSource(`/api/runs/${id}/events`);
	source.onmessage = (m) => {
		const ev = JSON.parse(m.data);
		if (ev.n <= run.seen) return; // the browser reconnects and replays: keep each event once
		run.seen = ev.n;
		(ON[ev.type] || (() => {}))(ev);
		if (ev.type === 'end') source.close();
	};
}

const ON = {
	start(ev) {
		if (ev.mode === 'simulation') {
			$('#says').append(h('div', {class: 'banner', text: 'Simulation: no META_API_KEY in .env. Same steps and real local work, but no Meta call; every call below is marked simulated.'}));
		}
		$('#plan').replaceChildren(...ev.plan.map((p) => h('li', {'data-step': p.step},
			h('span', {class: 'ico'}),
			h('span', {class: 'p-title'}, p.title, p.model ? tag(p.model) : ''),
		)));
	},
	step(ev) {
		const li = $(`#plan li[data-step="${ev.step}"]`);
		if (!li) return;
		li.className = ev.status;
		$('.p-sum', li)?.remove();
		if (ev.summary) li.append(h('span', {class: 'p-sum', text: ev.summary}));
	},
	say(ev) {
		$('#says').append(h('p', {text: ev.text}));
	},
	call(ev) {
		let row = run.calls.get(ev.id);
		if (!row) {
			row = h('li', {class: 'call run'});
			run.calls.set(ev.id, row);
			row.data = {};
			$('#log').append(row);
			row.scrollIntoView({block: 'nearest', behavior: 'smooth'});
		}
		Object.assign(row.data, Object.fromEntries(Object.entries(ev).filter(([, v]) => v !== undefined)));
		drawCall(row);
		totals();
	},
	media(ev) {
		run.frames = ev.frames;
		$('#strip').replaceChildren(...ev.frames.map((f, i) => {
			const fig = h('figure', {style: `animation-delay:${i * 25}ms`, onclick: () => seek(f.t)}, h('img', {src: f.url, alt: `frame at ${f.t}s`, loading: 'lazy'}), h('figcaption', {text: clock(f.t)}));
			fig.dataset.t = f.t;
			return fig;
		}));
	},
	moment(ev) {
		seek(ev.at);
		$('#marker').hidden = false;
		$('#marker-label').textContent = `Freeze ${clock(ev.at)}`;
		$('#marker').onclick = () => seek(ev.at);
		let best = null;
		document.querySelectorAll('#strip figure').forEach((f) => {
			f.classList.remove('near');
			if (!best || Math.abs(f.dataset.t - ev.at) < Math.abs(best.dataset.t - ev.at)) best = f;
		});
		best?.classList.add('near');
		run.still = ev.url;
		card('moment', 'The moment', 'muse-spark-1.3', h('img', {class: 'still', src: ev.url, alt: ''}), h('p', {text: ev.why}));
	},
	ad(ev) {
		run.ad = ev;
	},
	cutout(ev) {
		const fg = h('img', {class: 'fg', src: run.still, alt: ''});
		fg.style.webkitMaskImage = fg.style.maskImage = `url(${ev.url})`;
		card('cutout', 'Cut out', 'sam-3.1', h('div', {class: 'cut'}, h('img', {class: 'bg', src: run.still, alt: ''}), fg));
	},
	bridge(ev) {
		const el = card('bridge', 'The way in', 'muse-spark-1.3',
			h('div', {class: 'wayin'},
				h('div', {class: 'from'}, h('img', {src: run.still, alt: ''}), h('div', {}, h('small', {text: 'From the video'}), ...ev.lines.map((l) => h('div', {class: 'line', text: l})))),
				h('div', {class: 'to'}, h('img', {src: run.ad?.url || run.file('ad/a00.jpg'), alt: ''}), h('div', {}, h('small', {text: 'To the ad'}), h('div', {class: 'line', text: run.ad ? `${run.ad.brand}: ${run.ad.product}` : 'The ad'}), run.ad ? h('div', {class: 'promise', text: run.ad.promise}) : '')),
				h('p', {text: ev.why}),
				h('div', {class: 'move', text: `Move: ${ev.move} · level ${ev.level}`}),
			));
		el.classList.add('big');
	},
	end(ev) {
		totals(ev.total);
		if (ev.status === 'no-bridge') card('none', 'No bridge here', null, h('p', {text: 'No moment was good enough. The ad plays as usual, and nothing is cut off.'}));
		if (ev.status === 'error') card('error', 'The run stopped', null, h('p', {text: 'See the failed step on the left; the full error is in the run folder (error.txt).'}));
	},
};

function seek(t) {
	const p = $('#player');
	const go = () => {
		p.pause();
		p.currentTime = t;
	};
	p.readyState >= 1 ? go() : p.addEventListener('loadedmetadata', go, {once: true});
}

function card(id, title, model, ...body) {
	$(`#cards .card[data-id="${id}"]`)?.remove();
	const el = h('article', {class: 'card', 'data-id': id}, h('div', {class: 'card-head'}, h('span', {text: title}), model ? tag(model) : ''), h('div', {class: 'card-body'}, ...body));
	$('#cards').append(el);
	return el;
}

function drawCall(row) {
	const c = row.data;
	row.className = `call ${c.status}${row.classList.contains('open') ? ' open' : ''}`;
	const u = c.usage || {};
	const meta = [];
	if (c.ms !== undefined) meta.push(`${(c.ms / 1000).toFixed(1)} s`);
	if (u.input !== undefined) meta.push(`${num(u.input)} in${u.estimated ? '*' : ''}`);
	if (u.output !== undefined) meta.push(`${num(u.output)} out`);
	if (u.cached) meta.push(`${num(u.cached)} cached`);
	if (u.audio_seconds !== undefined) meta.push(`${u.audio_seconds} s audio`);
	if (u.images !== undefined) meta.push(`${u.images} image`);
	const pretty = (x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2).replace(/\\n/g, '\n'));
	row.replaceChildren(
		h('button', {type: 'button', 'aria-expanded': row.classList.contains('open'), onclick: () => (row.classList.toggle('open'), drawCall(row))},
			h('span', {class: 'c-top'}, tag(c.model), h('span', {class: 'c-label', text: c.label})),
			h('span', {class: 'c-cost', text: c.status === 'run' ? '' : c.status === 'error' ? 'failed' : money(c.cost)}),
			h('span', {class: 'c-meta'}, ...meta.map((m) => h('span', {text: m})), c.simulated ? h('span', {class: 'sim', text: 'simulated'}) : ''),
		),
		h('div', {class: 'c-detail'},
			h('h3', {text: 'Sent'}), h('pre', {text: pretty(c.request)}),
			c.error ? [h('h3', {text: 'Error'}), h('pre', {text: c.error})] : [h('h3', {text: 'Received'}), h('pre', {text: c.status === 'run' ? 'waiting…' : pretty(c.response)})],
		),
	);
}

function totals(final) {
	const done = [...run.calls.values()].map((r) => r.data).filter((c) => c.status === 'done');
	const cost = done.reduce((s, c) => s + (c.cost || 0), 0);
	const tin = done.reduce((s, c) => s + ((c.usage || {}).input || 0), 0);
	const tout = done.reduce((s, c) => s + ((c.usage || {}).output || 0), 0);
	$('#count').textContent = run.calls.size;
	$('#total-cost').textContent = money(final ? final.cost : cost);
	const sim = done.some((c) => c.simulated);
	$('#total-sub').textContent = `${done.length} calls · ${num(tin)} tokens in · ${num(tout)} out${final ? ` · ${final.seconds} s` : ''}${sim ? ' · simulated, estimates' : ''}`;
}

// ------------------------------------------------------------ routing

function route() {
	const m = location.hash.match(/^#\/run\/([\w-]+)/);
	$('#home').hidden = !!m;
	$('#studio').hidden = !m;
	if (m) openRun(m[1]);
	else {
		if (source) source.close();
		$('#crumb').replaceChildren();
		loadHistory();
	}
}

setupHome();
loadMode();
window.addEventListener('hashchange', route);
route();
