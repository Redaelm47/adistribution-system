// Thought (level 2, needs a subject): the subject's idea rises in a soft, breathing bubble, the line types itself inside it,
// then the bubble swallows the screen one blob at a time and becomes the ad. Ported from the launch film (film7 TThinkV), motion untouched:
// only the bubble's place (from the subject's head, toward the side with more room), the line and its timing come from the spec.

import React from 'react';
import {AbsoluteFill, interpolate, random} from 'remotion';
import {ACCENTS, Click, Clip, H, INK, MoveProps, Pic, READ, SANS, SERIF, Spec, W, clamp, inOut, lerp, lineLen, measure, out3, seg, sp} from '../kit';

const in2 = (x: number) => Math.pow(clamp(x), 2);
const PAL = {blue: '#0866ff', red: '#ff2a3c', yellow: '#ffd000', pink: '#ff3ea5', violet: '#7c3aed', cyan: '#00c2e0'};
const POP = [PAL.pink, PAL.yellow, PAL.cyan, PAL.violet, PAL.blue, PAL.red];

const TP = 1.1; // the video plays this long before it freezes
const TA = TP + 0.3; // the line starts typing
const TGL = 0.78; // the swallow

// ---------------------------------------------------------------- the line: the spec's lines, typed letter by letter, the last word of each in serif and colour

type Wd = {w: string; serif: boolean; color: string};
const words = (s: Spec): Wd[] => {
	const ls = s.lines.filter((l) => l && l.trim());
	return ls.flatMap((l, li) => {
		const ws = l.split(' ').filter(Boolean);
		return ws.map((w, i) => ({w, serif: i === ws.length - 1, color: i === ws.length - 1 ? (li === ls.length - 1 ? PAL.violet : ACCENTS[0]) : INK}));
	});
};
const breaks = (s: Spec) => {
	const ls = s.lines.filter((l) => l && l.trim());
	const out: number[] = [];
	let n = 0;
	ls.forEach((l) => {
		if (n) out.push(n);
		n += l.split(' ').filter(Boolean).length;
	});
	return out; // word indexes that must start a new line (where a second spec line begins)
};
const wordCount = (s: Spec) => words(s).length;

export const thoughtTimes = (s: Spec) => {
	const n = Math.max(1, wordCount(s));
	const R = Math.max(0.5, n * READ); // typing time, a calm reading pace (the film's line took 0.25 s a word)
	const TG = TA + lineLen(s.lines.join(' ')) + 0.08;
	return {R, TG, end: TG + TGL + (s.adSeconds ?? 4)};
};
export const thoughtSeconds = (s: Spec) => thoughtTimes(s).end;

// ---------------------------------------------------------------- where the bubble goes: beside the head, toward the side with more room, always inside the frame

// The film's cloud, offsets from its centre, drawn for a bubble to the LEFT of the face (side -1). Mirrored for the other side.
const CLOUD = [[-310, 10, 170], [-170, -80, 165], [20, -110, 175], [220, -80, 165], [340, 20, 160], [190, 105, 150], [-40, 120, 160], [-230, 100, 140], [0, 0, 220]];
// Its edges from the centre, counting the pop's overshoot (x1.28), the breathing and the wobble, so it never leaves the frame.
const FAR = 535; // far edge (480 at rest)
const NEAR = 552; // edge toward the face (500 at rest)
const TOP = 340; // 285 at rest
const BOT = 330; // 280 at rest
const M = 24; // margin to the frame
const SAFE = 1;

const anchor = (s: Spec) => {
	if (s.face) return {x: s.face[0], y: s.face[1]};
	if (s.box) return {x: (s.box[0] + s.box[2]) / 2, y: s.box[1]};
	if (s.center) return {x: s.center[0], y: s.center[1]};
	return {x: W / 2, y: H * 0.36};
};

export const thoughtLayout = (s: Spec) => {
	const F = anchor(s);
	const side = F.x > W / 2 ? -1 : 1;
	const p1 = Math.max(M + 40, Math.min(W - M - 40, F.x + side * 100));
	const room = side < 0 ? p1 - M : W - M - p1;
	const g = Math.max(0.62, Math.min(1, room / ((645 + FAR) * SAFE)));
	const left = side < 0 ? FAR : NEAR;
	const right = side < 0 ? NEAR : FAR;
	const ccx = Math.max(M + left * g * SAFE, Math.min(W - M - right * g * SAFE, p1 + side * 645 * g));
	const ccy = Math.max(M + TOP * g * SAFE, Math.min(H - M - BOT * g * SAFE, F.y - 60 + 15 * g));
	// the two little bubbles, as in the film: the small one near the head, the bigger one touching the cloud
	const b1 = {x: ccx - side * 645 * g, y: ccy - 15 * g, r: 30 * g};
	const b2 = {x: ccx - side * 535 * g, y: ccy - 2 * g, r: 50 * g};
	return {F, side, g, cc: {x: ccx, y: ccy}, b1, b2};
};

// ---------------------------------------------------------------- fitting the line in the cloud (the film: two lines, 86 px sans, 112 px serif, in 940 px)

const sansFont = (k: number) => `500 ${86 * k}px ${SANS}`;
const serifFont = (k: number) => `italic 400 ${112 * k}px ${SERIF}`;

const fit = (ws: Wd[], must: number[], g: number) => {
	if (!ws.length) return {k: g, lines: [] as Wd[][]};
	const width = ws.map((w) => (w.serif ? measure(w.w, serifFont(1), 0) : measure(w.w, sansFont(1), -2.4)));
	const space = measure(' ', sansFont(1), -2.4);
	const wrap = (L: number) => {
		const lines: number[][] = [];
		let cur: number[] = [];
		let cw = 0;
		ws.forEach((_, i) => {
			const add = (cur.length ? space : 0) + width[i];
			if (cur.length && (must.includes(i) || cw + add > L)) {
				lines.push(cur);
				cur = [i];
				cw = width[i];
			} else {
				cur.push(i);
				cw += add;
			}
		});
		if (cur.length) lines.push(cur);
		return lines;
	};
	const lineW = (ln: number[]) => ln.reduce((a, i, j) => a + width[i] + (j ? space : 0), 0);
	const total = lineW(ws.map((_, i) => i));
	const minLines = wrap(1e9).length;
	const opts: {n: number; k: number; lines: number[][]}[] = [];
	const first = Math.max(minLines, Math.min(2, ws.length));
	for (let n = first; n <= Math.max(5, first); n++) {
		// the narrowest wrap that holds in n lines
		let lo = Math.max(...width);
		let hi = total + 1;
		for (let it = 0; it < 26; it++) {
			const mid = (lo + hi) / 2;
			if (wrap(mid).length <= n) hi = mid;
			else lo = mid;
		}
		const lines = wrap(hi);
		const widest = Math.max(...lines.map(lineW));
		const room = [900, 900, 900, 860, 760, 680][Math.min(5, lines.length)] * g; // the cloud gets narrower toward its top and bottom
		const tall = (400 * g) / (lines.length * 1.14 + 0.34);
		opts.push({n: lines.length, k: Math.min(g, room / widest, tall / 86), lines});
		if (lines.length < n) break;
	}
	const ok = opts.find((o) => o.k >= g * 0.82);
	const best = ok ?? opts.reduce((a, b) => (b.k > a.k ? b : a));
	return {k: best.k, lines: best.lines.map((ln) => ln.map((i) => ws[i]))};
};

// ---------------------------------------------------------------- primitives copied from the film (film7/moves.tsx)

const Rays: React.FC<{t: number; at: number; x: number; y: number; n?: number; r0?: number; r1?: number; dur?: number; w?: number; colors?: string[]; id?: string}> = ({t, at, x, y, n = 24, r0 = 70, r1 = 1150, dur = 0.55, w = 13, colors = POP, id = 'r'}) => {
	const u = (t - at) / dur;
	if (u <= 0 || u >= 1) return null;
	return (
		<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
			{Array.from({length: n}, (_, i) => {
				const a = (i / n) * Math.PI * 2 + random(`${id}a${i}`) * 0.12;
				const len = 0.55 + random(`${id}l${i}`) * 0.45;
				const head = lerp(r0, r1 * len, out3(u));
				const tail = lerp(r0, r1 * len, in2(u));
				return <line key={i} x1={x + Math.cos(a) * tail} y1={y + Math.sin(a) * tail} x2={x + Math.cos(a) * head} y2={y + Math.sin(a) * head} stroke={colors[i % colors.length]} strokeWidth={w * (1 - u * 0.6)} strokeLinecap="round" />;
			})}
		</svg>
	);
};

/** The film's treat, as a plain shape in the palette: a soft rounded pill with a highlight. */
const Bit: React.FC<{s: number; c: string; style?: React.CSSProperties}> = ({s, c, style}) => (
	<div style={{position: 'absolute', width: s, height: s * 0.74, borderRadius: s * 0.3, background: c, boxShadow: `inset 0 ${-s * 0.06}px ${s * 0.1}px rgba(0,0,0,0.22), 0 ${s * 0.08}px ${s * 0.2}px rgba(0,0,0,0.3)`, ...style}}>
		<div style={{position: 'absolute', left: '26%', top: '28%', width: '48%', height: '44%', borderRadius: '50%', background: 'rgba(255,255,255,0.38)'}} />
	</div>
);
const BITS = [[-420, -150, 62], [420, -170, 48], [-430, 150, 54], [440, 160, 66]]; // top-left corners from the cloud's centre, in the film
const BIT_COLORS = [PAL.pink, PAL.yellow, PAL.cyan, PAL.violet];

// ---------------------------------------------------------------- the move

export const Thought: React.FC<MoveProps> = ({t, s}) => {
	const {R, TG, end} = thoughtTimes(s);
	const {F, side, g, cc, b1, b2} = thoughtLayout(s);
	const ws = words(s);
	const {k, lines} = fit(ws, breaks(s), g);
	const chars = lines.reduce((a, ln) => a + ln.map((w) => w.w).join(' ').length, 0);
	const n = Math.ceil(seg(t, TA, R) * chars);
	const at = (c: number) => TA + (R * c) / Math.max(1, chars); // when the c-th letter lands
	// where each word starts in the typed string
	const starts: number[][] = [];
	let c0 = 0;
	lines.forEach((ln) => {
		const row: number[] = [];
		let o = 0;
		ln.forEach((w) => {
			row.push(c0 + o);
			o += w.w.length + 1;
		});
		starts.push(row);
		c0 += Math.max(0, o - 1);
	});
	let lastSerif = TA + R * 0.45;
	lines.forEach((ln, li) => ln.forEach((w, wi) => w.serif && (lastSerif = at(starts[li][wi]))));

	const dim = out3(seg(t, TP, 0.4));
	const go = seg(t, TG, TGL);
	const txt = 1 - seg(t, TG, 0.12);
	const cx = lerp(cc.x, 960, inOut(go));
	const cy = lerp(cc.y, 540, inOut(go));
	const G = lerp(g, 1, inOut(go)); // the cloud's own size, back to the film's as it swallows the screen
	const small = (x: number, y: number, r: number, when: number) => {
		const q = sp(t - when, 15, 6);
		return q <= 0 ? null : <div key={when} style={{position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, background: '#fff', transform: `scale(${q * (1 + Math.sin(t * 6 + r) * 0.05)})`, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', opacity: 1 - seg(t, TG, 0.2)}} />;
	};
	const blob = (i: number) => {
		const pop = sp(t - TP - 0.3 - i * 0.022, 12, 5.2);
		const grow = lerp(1, 7.2, in2(seg(t, TG + i * 0.035, TGL)));
		const b = 1 + Math.sin(t * 4.6 + i * 1.7) * 0.022;
		return pop * grow * b;
	};
	const wob = (i: number) => ({x: Math.sin(t * 3.4 + i * 2.2) * 7, y: Math.cos(t * 2.9 + i * 1.3) * 6});
	const lh = 1.14 * 86 * k;
	const BW = 940 * g;
	const blockH = lines.length * lh + 0.34 * 86 * k;
	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			{t < TP ? (
				<Clip src={s.video} at={0} len={TP} from={Math.max(0, s.freezeAt - TP)} muted />
			) : (
				<AbsoluteFill style={{transformOrigin: `${F.x}px ${F.y}px`, transform: `scale(${1 + (t - TP) * 0.016})`, filter: `brightness(${lerp(1, 0.62, dim)})`}}>
					<Pic src={s.still} />
				</AbsoluteFill>
			)}
			{t >= TP && small(b1.x, b1.y, b1.r, TP + 0.04)}
			{t >= TP && small(b2.x, b2.y, b2.r, TP + 0.16)}
			{t >= TP + 0.3 && (
				<AbsoluteFill style={{filter: 'drop-shadow(0 18px 40px rgba(0,0,0,0.35))'}}>
					<svg width={0} height={0} style={{position: 'absolute'}}>
						<defs>
							<clipPath id="thought-cloud" clipPathUnits="userSpaceOnUse">
								{CLOUD.map(([x, y, r], i) => {
									const spread = lerp(1, 2.4, in2(go));
									const q = wob(i);
									return <circle key={i} cx={cx + (-side * x + q.x) * spread * G} cy={cy + (y + q.y) * spread * G} r={r * blob(i) * G} />;
								})}
							</clipPath>
						</defs>
					</svg>
					<AbsoluteFill style={{clipPath: 'url(#thought-cloud)', background: '#fff'}}>
						{t >= TG && <Pic src={s.adFirst} />}
						{t >= TG && <Clip src={s.ad} from={s.adFrom ?? 0} at={TG} len={end - TG + 0.1} volume={(f: number) => interpolate(f, [0, 14], [0.3, 1], {extrapolateRight: 'clamp'})} />}
						{txt > 0 && (
							<div style={{position: 'absolute', left: cx - BW / 2, width: BW, top: cy - blockH / 2 + 10 * k, height: blockH, textAlign: 'center', transform: `scale(${sp(t - TP - 0.32, 12, 5.2)})`, opacity: txt, fontFamily: SANS, fontWeight: 500, fontSize: 86 * k, lineHeight: 1.14, letterSpacing: -2.4 * k, color: INK, whiteSpace: 'pre'}}>
								{lines.map((ln, li) => (
									<div key={li} style={{minHeight: lh}}>
										{ln.map((w, wi) => {
											const st = starts[li][wi];
											const shown = w.w.slice(0, Math.max(0, n - st));
											const gap = wi < ln.length - 1 && n > st + w.w.length ? ' ' : '';
											if (!shown) return null;
											if (!w.serif) return <React.Fragment key={wi}>{shown + gap}</React.Fragment>;
											const pop = 1 + Math.exp(-Math.max(0, t - at(st) - 0.04) * 7) * 0.22;
											return (
												<React.Fragment key={wi}>
													<span style={{display: 'inline-block', fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 112 * k, letterSpacing: 0, color: w.color, transform: `scale(${pop})`}}>{shown}</span>
													{gap}
												</React.Fragment>
											);
										})}
									</div>
								))}
							</div>
						)}
					</AbsoluteFill>
				</AbsoluteFill>
			)}
			{t >= lastSerif - 0.02 && t < TG + 0.12 && BITS.map(([x, y, z], i) => {
				const q = sp(t - (lastSerif - 0.02) - i * 0.07, 16, 6);
				const sz = z * g;
				const ox = (x + z / 2) * -side * g; // centre of the film's treat, mirrored to our side
				return <Bit key={i} s={sz} c={BIT_COLORS[i]} style={{left: cc.x + ox - sz / 2 + Math.sin(t * 3 + i) * 6, top: cc.y + y * g + Math.cos(t * 4 + i) * 6, transform: `scale(${q}) rotate(${(i % 2 ? 1 : -1) * 18 + Math.sin(t * 3 + i) * 9}deg)`, opacity: 1 - seg(t, TG, 0.1)}} />;
			})}
			<Rays t={t} at={TG + 0.02} x={cc.x} y={cc.y} r1={1300} n={20} id="th" />
			<Click at={TP + 0.04} v={0.45} />
			<Click at={TP + 0.16} v={0.55} />
			<Click at={TP + 0.3} v={0.6} />
			<Click at={TG + 0.02} v={0.6} />
			<Click at={TG + TGL - 0.14} v={0.5} />
		</AbsoluteFill>
	);
};
