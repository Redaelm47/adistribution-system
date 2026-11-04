// Iris (level 2, aims at the subject's face): the video freezes, a coloured iris snaps in around the face while the first line lands,
// tightens and turns pink on the second line, shuts, and opens on the ad in a burst of rays, rings and confetti.
// Ported from the launch film (film7/transitions.tsx, TWaitV, "Sorry... did someone say treats?"): same radii, springs, colours and easing.
// What changed: the face comes from the spec, line timings from the text (no voice), the treats are plain shapes in the palette.

import React from 'react';
import {AbsoluteFill, random} from 'remotion';
import {Click, Clip, H, MoveProps, Pic, SANS, SERIF, Spec, W, clamp, lerp, measure, out3, seg, sp} from '../kit';

// The film's palette (film7/kit.tsx PAL)
const PAL = {blue: '#0866ff', red: '#ff2a3c', yellow: '#ffd000', pink: '#ff3ea5', violet: '#7c3aed', cyan: '#00c2e0'};
const POP = [PAL.pink, PAL.yellow, PAL.cyan, PAL.violet, PAL.blue, PAL.red];
const INK = '#101114';
const GLOW = '0 0 26px rgba(255,255,255,0.9)';
const in2 = (x: number) => Math.pow(clamp(x), 2);
const out5 = (x: number) => 1 - Math.pow(1 - clamp(x), 5);

const LP = 1.0; // the video plays this long before it freezes
const T0 = LP - 0.25; // the film's t = 0 (its first spring, WA = 0.25, lands on the freeze)
const READ = 0.24;
const MAXW = 1760; // the widest a line may be

// ---------------------------------------------------------------- timings, from the text (the film took them from the voice)

const words = (text: string) => text.split(' ').filter(Boolean).length;
/** Letters land `each` apart (the film's 0.034 / 0.045, faster on long lines), then the line holds long enough to read. */
const eachFor = (text: string, film: number, most: number) => Math.min(film, most / Math.max(1, text.length));
const durFor = (text: string, each: number) => Math.max(text.length * each + 0.35, words(text) * READ + 0.35);

const linesOf = (s: Spec) => [(s.lines[0] ?? '').trim(), (s.lines[1] ?? '').trim() || undefined] as const;

export const irisTimes = (s: Spec) => {
	const [l0, l1] = linesOf(s);
	const each0 = eachFor(l0, 0.034, 1.2);
	const each1 = l1 ? eachFor(l1, 0.045, 1.5) : 0;
	const WA = LP;
	const WB = WA + durFor(l0, each0) + 0.12;
	const WC = l1 ? WB + durFor(l1, each1) + 0.02 : WB + 0.6;
	return {WA, WB, WC, each0, each1, end: WC + (s.adSeconds ?? 4)};
};

export const irisSeconds = (s: Spec) => irisTimes(s).end;
/** When each line starts, for the voice. */
export const irisLineAt = (s: Spec) => {
	const c = irisTimes(s);
	return [c.WA, c.WB];
};

// ---------------------------------------------------------------- primitives copied from film7/moves.tsx

/** A line whose letters land one by one, each with its own little overshoot. `dots`: the last three bounce in turn. */
const Letters: React.FC<{t: number; text: string; at: number; x: number; y: number; size: number; color?: string; colorAt?: (i: number) => string; serif?: boolean; weight?: number; each?: number; out?: number; dots?: boolean; shadow?: string}> = ({t, text, at, x, y, size, color = '#ffffff', colorAt, serif, weight = 500, each = 0.034, out, dots, shadow = '0 4px 34px rgba(0,0,0,0.55)'}) => {
	const font = serif ? `italic 400 ${size}px ${SERIF}` : `${weight} ${size}px ${SANS}`;
	const spacing = serif ? 0 : -size * 0.025;
	const whole = measure(text, font, spacing);
	const n = text.length;
	return (
		<>
			{text.split('').map((ch, i) => {
				const u = t - at - i * each;
				if (u <= 0 || ch === ' ') return null;
				const k = sp(u, 17, 7);
				const left = x - whole / 2 + measure(text.slice(0, i), font, spacing);
				const ex = out !== undefined ? in2((t - out - i * each * 0.4) / 0.18) * (t > out + i * each * 0.4 ? 1 : 0) : 0;
				if (ex >= 1) return null;
				const hop = dots && i >= n - 3 ? -Math.abs(Math.sin(Math.max(0, t - at - n * each) * 6.5 - (i - n + 3) * 0.8)) * size * 0.16 : 0;
				return (
					<div key={i} style={{position: 'absolute', left, top: y, lineHeight: 1, whiteSpace: 'pre', transformOrigin: '50% 70%', transform: `translateY(calc(-50% + ${(1 - k) * size * 0.62 - clamp(ex) * size * 0.7 + hop}px)) scale(${lerp(0.35, 1, k)}) rotate(${(1 - k) * (i % 2 ? 16 : -16)}deg)`, opacity: Math.min(1, u * 16) * (1 - clamp(ex)), fontFamily: serif ? SERIF : SANS, fontStyle: serif ? 'italic' : 'normal', fontWeight: serif ? 400 : weight, fontSize: size, color: colorAt ? colorAt(i) : color, textShadow: shadow}}>
						{ch}
					</div>
				);
			})}
		</>
	);
};

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

const Rings: React.FC<{t: number; at: number; x: number; y: number; r?: number; dur?: number; gap?: number; colors?: string[]}> = ({t, at, x, y, r = 1000, dur = 0.6, gap = 0.08, colors = POP.slice(0, 3)}) => (
	<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
		{colors.map((c, i) => {
			const u = (t - at - i * gap) / dur;
			if (u <= 0 || u >= 1) return null;
			return <circle key={i} cx={x} cy={y} r={out3(u) * r} fill="none" stroke={c} strokeWidth={(1 - u) * 34} />;
		})}
	</svg>
);

/** The film's TreatBurst with the treats replaced by plain shapes in the palette: same throw, same gravity, same spin. */
const Burst: React.FC<{t: number; at: number; x: number; y: number; n?: number; speed?: number}> = ({t, at, x, y, n = 30, speed = 1}) => {
	const u = t - at;
	if (u <= 0 || u > 1.5) return null;
	return (
		<>
			{Array.from({length: n}, (_, i) => {
				const a = random(`ta${i}`) * Math.PI * 2;
				const v = (560 + random(`tv${i}`) * 1250) * speed;
				const px = x + Math.cos(a) * v * u;
				const py = y + Math.sin(a) * v * u * 0.8 + 1450 * u * u;
				const s = 40 + random(`ts${i}`) * 52;
				const round = i % 3 === 2;
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: px,
							top: py,
							width: round ? s * 0.8 : s,
							height: round ? s * 0.8 : s * 0.74,
							borderRadius: round ? '50%' : s * 0.3,
							background: POP[i % POP.length],
							boxShadow: `inset 0 ${-s * 0.06}px ${s * 0.1}px rgba(0,0,0,0.22), 0 ${s * 0.08}px ${s * 0.2}px rgba(0,0,0,0.3)`,
							transform: `rotate(${(random(`tr${i}`) - 0.5) * 1300 * u}deg) scale(${Math.min(1, u * 12)})`,
						}}
					/>
				);
			})}
		</>
	);
};

// ---------------------------------------------------------------- the move

/** How far the farthest corner of the frame is from (x, y): an iris this wide covers nothing. */
const reach = (x: number, y: number) => Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) + 30;
const fit = (text: string, size: number) => Math.min(size, (size * MAXW) / Math.max(1, measure(text, `italic 400 ${size}px ${SERIF}`)));

export const Iris: React.FC<MoveProps> = ({t, s}) => {
	const {WA, WB, WC, each0, each1, end} = irisTimes(s);
	const [l0, l1] = linesOf(s);
	const [fx, fy] = s.face ?? s.center ?? [W / 2, H / 2];
	const f = {x: fx, y: fy};
	// The ad opens from where the iris shut, kept off the very edge so the burst stays on screen
	const o = {x: Math.max(240, Math.min(W - 240, fx)), y: Math.max(180, Math.min(H - 180, fy))};
	const R0 = Math.max(1500, reach(f.x, f.y));
	const R1 = Math.max(1500, reach(o.x, o.y));
	const ft = t - T0;
	const a = sp(t - WA, 7, 4);
	const b = sp(t - WB, 7, 4);
	const c = in2(seg(t, WC - 0.24, 0.24));
	const beat = Math.sin(ft * 7) * 7 * clamp(a) * (1 - c);
	const r = lerp(lerp(lerp(R0, 560, a), 350, b), 0, c) + beat;
	const band = t < WB ? PAL.blue : PAL.pink;
	const outer = '#ffffff';
	const open = out5(seg(t, WC + 0.03, 0.56));
	const shake = t > WB && t < WC ? Math.sin(ft * 60) * Math.min(t - WB, 1.4) * 2 : 0;
	const size0 = fit(l0, 190);
	const size1 = l1 ? fit(l1, 136) : 0;
	const last1 = l1 ? l1.lastIndexOf(' ') + 1 : 0;
	const last0 = l0.includes(' ') ? l0.lastIndexOf(' ') + 1 : 9999; // a single line: its last word in pink, like the film's punchline
	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			{t < WC + 0.04 && (
				<AbsoluteFill style={{transformOrigin: `${f.x}px ${f.y}px`, transform: `scale(${1 + seg(ft, 0, WC - T0) * 0.22}) translateX(${shake}px)`}}>
					{t < LP ? <Clip src={s.video} at={0} len={LP} from={Math.max(0, s.freezeAt - LP)} muted /> : <Pic src={s.still} />}
				</AbsoluteFill>
			)}
			{t >= T0 && t < WC + 0.04 && <AbsoluteFill style={{background: `radial-gradient(circle at ${f.x}px ${f.y}px, transparent ${r}px, ${band} ${r + 1}px, ${band} ${r + 26}px, ${outer} ${r + 27}px)`}} />}
			{t >= WC && (
				<AbsoluteFill style={{transformOrigin: `${o.x}px ${o.y}px`, transform: `scale(${lerp(1.34, 1, open)})`}}>
					{open < 0.999 && <Pic src={s.adFirst} />}
					<Clip src={s.ad} from={s.adFrom ?? 0} at={WC} len={end - WC + 0.1} volume={1} />
				</AbsoluteFill>
			)}
			{t >= WC && open < 0.999 && <AbsoluteFill style={{background: `radial-gradient(circle at ${o.x}px ${o.y}px, transparent ${open * R1}px, ${PAL.yellow} ${open * R1 + 1}px, ${PAL.yellow} ${open * R1 + 26}px, #ffffff ${open * R1 + 27}px)`}} />}
			<Rays t={t} at={WC + 0.02} x={o.x} y={o.y} />
			<Rings t={t} at={WC + 0.02} x={o.x} y={o.y} />
			<Burst t={t} at={WC + 0.05} x={o.x} y={o.y} />
			{t >= WA && t < (l1 ? WB : WC) && <Letters t={t} text={l0} at={WA} x={960} y={930} size={size0} serif color={INK} colorAt={l1 ? undefined : (i) => (i >= last0 ? PAL.pink : INK)} each={each0} dots={l0.endsWith('...')} out={l1 ? WB - 0.1 : WC - 0.06} shadow={GLOW} />}
			{l1 && t >= WB && t < WC && <Letters t={t} text={l1} at={WB} x={960} y={930} size={size1} serif each={each1} colorAt={(i) => (i >= last1 ? PAL.pink : INK)} out={WC - 0.06} shadow={GLOW} />}
			<Click at={WA} v={0.6} />
			{l1 && <Click at={WB} v={0.5} />}
			<Click at={WC - 0.02} v={0.5} />
			<Click at={WC + 0.06} v={0.8} />
		</AbsoluteFill>
	);
};
