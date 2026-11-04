// Throw (level 1, any picture): the frozen picture backs off into a card, a hand-held mouse grabs it, winds up and throws it off screen with colour trails;
// the next card slides in, the ad, a yellow circle draws itself on it, and it grows to full screen.
// Ported from the launch film (film7/transitions.tsx, TForgetV, "He's looking for..."): same springs, trails, pointer and timings; only the inputs change.

import {loadFont as loadSans} from '@remotion/google-fonts/Geist';
import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {Click, Clip, H, fr, MoveProps, Pic, READ, Rings, SANS, Spec, W, clamp, inOut, lerp, measure, out3, seg, sp, voiced} from '../kit';

loadSans('normal', {weights: ['600'], subsets: ['latin']}); // the film's line is Geist 600

const PAL = {yellow: '#ffd000', pink: '#ff3ea5', cyan: '#00c2e0'};
const INK = '#101114';
const in2 = (x: number) => Math.pow(clamp(x), 2);

// ---------------------------------------------------------------- timing: the film's beats, the voice replaced by the line's reading time

const FP = 1.0; // the video plays this long before it freezes
const FA = FP + 0.08;
const EACH = 0.03; // seconds between letters
const WIND = 0.604; // grab to throw, as in the film
/** How long a line holds before the throw: the film's voice took 0.884 s for "He's looking for...", longer lines get reading time. */
const say = (text: string) => Math.max(0.884, text.length * EACH + 0.3, text.split(' ').filter(Boolean).length * READ + 0.16, voiced(text) + 0.1);
const clean = (text: string) => (text ?? '').replace(/…/g, '...').replace(/'/g, '’').trim();

export const throwTimes = (s: Spec) => {
	const l0 = clean(s.lines[0] ?? '');
	const l1 = s.lines[1] ? clean(s.lines[1]) : '';
	const THROW = FA + say(l0) - 0.04;
	const GRAB = THROW - WIND;
	const FB = THROW + 0.12;
	const FC = FB + 0.42;
	const AD = FC + 0.34; // the ad starts playing (the film's grow)
	// A second line replaces the first once it has flown off, and the card waits in place (the ad already playing) until it is read.
	const OUT = THROW + 0.02;
	const L2 = Math.max(FB + 0.04, OUT + l0.length * EACH * 0.4 + 0.08);
	const FG = Math.max(AD, l1 ? L2 + say(l1) + 0.1 : 0);
	return {l0, l1, GRAB, THROW, OUT, L2, FB, FC, AD, FG, end: FG + (s.adSeconds ?? 4)};
};

export const throwSeconds = (s: Spec) => throwTimes(s).end;
/** When each line starts, for the voice. */
export const throwLineAt = (s: Spec) => [FA, throwTimes(s).L2];

// ---------------------------------------------------------------- the cards

const CY = 610;
const CS = 0.72;
const CW = W * CS;
const CH = H * CS;

const Flat: React.FC<{x: number; y: number; r: number; c: string}> = ({x, y, r, c}) => <div style={{position: 'absolute', left: x - CW / 2, top: y - CH / 2, width: CW, height: CH, borderRadius: 26, background: c, transform: `rotate(${r}deg)`}} />;

// directional blur on the card that flies away (film7/fx BlurDefs, own ids)
const BlurDefs: React.FC = () => (
	<svg width={0} height={0} style={{position: 'absolute'}}>
		<defs>
			{Array.from({length: 50}, (_, i) => (i + 1) * 2).map((n) => (
				<filter key={n} id={`thbx${n}`} x="-60%" width="220%" y="-20%" height="140%">
					<feGaussianBlur stdDeviation={`${n} 0`} />
				</filter>
			))}
		</defs>
	</svg>
);
const bx = (v: number) => (v < 1 ? 'none' : `url(#thbx${Math.min(100, Math.max(2, Math.round(v / 2) * 2))})`);

// ---------------------------------------------------------------- the hand on the mouse (film2/kit)

type Pose = {t: number; x: number; y: number; d?: number; arc?: number};
/** A hand on a mouse: speeds up, slows down, a slight curve, and it arrives a touch early, then settles. */
const pointer = (t: number, keys: Pose[]) => {
	let x = keys[0].x;
	let y = keys[0].y;
	for (let i = 1; i < keys.length; i++) {
		const a = keys[i - 1];
		const b = keys[i];
		const d = b.d ?? 0.62;
		const u = clamp((t - (b.t - d)) / d);
		if (u <= 0) break;
		const e = 1 - Math.pow(1 - u, 3.2) * (1 - u * 0.15);
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const arc = (b.arc ?? 0.09) * Math.sin(Math.PI * Math.min(1, e));
		x = a.x + dx * e - dy * arc;
		y = a.y + dy * e + dx * arc;
	}
	return {x, y};
};
const pressAt = (t: number, at: number) => seg(t, at - 0.04, 0.05) - seg(t, at + 0.07, 0.09);
const Pointer: React.FC<{x: number; y: number; press?: number; scale?: number; grab?: boolean}> = ({x, y, press = 0, scale = 1.7, grab}) => (
	<svg width={44} height={52} viewBox="0 0 22 26" style={{position: 'absolute', left: x - 3, top: y - 3, transformOrigin: '4px 4px', transform: `scale(${scale * (1 - press * 0.14) * (grab ? 0.94 : 1)})`, overflow: 'visible', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.32))', zIndex: 50}}>
		<path d="M2 1.5 L2 20 L7 15.8 L10.2 23.4 L13.6 22 L10.4 14.6 L17 14.4 Z" fill={INK} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
	</svg>
);

// ---------------------------------------------------------------- the line: letters land one by one, the three dots bounce (film7/moves Letters)

const Letters: React.FC<{t: number; text: string; at: number; x: number; y: number; size: number; color?: string; weight?: number; each?: number; out?: number; dots?: boolean}> = ({t, text, at, x, y, size, color = INK, weight = 600, each = 0.034, out, dots}) => {
	const font = `${weight} ${size}px ${SANS}`;
	const spacing = -size * 0.025;
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
					<div key={i} style={{position: 'absolute', left, top: y, lineHeight: 1, whiteSpace: 'pre', transformOrigin: '50% 70%', transform: `translateY(calc(-50% + ${(1 - k) * size * 0.62 - clamp(ex) * size * 0.7 + hop}px)) scale(${lerp(0.35, 1, k)}) rotate(${(1 - k) * (i % 2 ? 16 : -16)}deg)`, opacity: Math.min(1, u * 16) * (1 - clamp(ex)), fontFamily: SANS, fontWeight: weight, fontSize: size, color}}>
						{ch}
					</div>
				);
			})}
		</>
	);
};

/** The film's line sits at y 118, 124 px. A longer line shrinks to fit the width, then breaks into two rows above the card. */
const MAXW = 1720;
const fit = (text: string) => {
	const w = (s: string) => measure(s, `600 124px ${SANS}`, -124 * 0.025);
	const one = Math.min(124, (124 * MAXW) / Math.max(1, w(text)));
	const words = text.split(' ').filter(Boolean);
	if (one >= 76 || words.length < 2) return {rows: [text], size: one};
	let best = {rows: [text], wide: Infinity};
	for (let i = 1; i < words.length; i++) {
		const rows = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
		const wide = Math.max(w(rows[0]), w(rows[1]));
		if (wide < best.wide) best = {rows, wide};
	}
	return {rows: best.rows, size: Math.min(80, (124 * MAXW) / best.wide)};
};

const Line: React.FC<{t: number; text: string; at: number; out?: number}> = ({t, text, at, out}) => {
	const {rows, size} = fit(text);
	const dots = text.endsWith('...');
	const ys = rows.length === 1 ? [118] : [58, 58 + size * 1.08];
	let start = at;
	return (
		<>
			{rows.map((r, i) => {
				const a = start;
				start += (r.length + 1) * EACH;
				return <Letters key={i} t={t} text={r} at={a} x={960} y={ys[i]} size={size} each={EACH} dots={dots && i === rows.length - 1} out={out} />;
			})}
		</>
	);
};

// ---------------------------------------------------------------- the move

export const Throw: React.FC<MoveProps> = ({t, s}) => {
	const {l0, l1, GRAB, THROW, OUT, L2, FB, FC, AD, FG, end} = throwTimes(s);
	const cardOut = (u: number) => {
		const wind = inOut(seg(u, GRAB + 0.05, THROW - GRAB - 0.05));
		const fly = in2(seg(u, THROW, 0.32));
		return {x: 960 + wind * 130 - fly * 2500, y: CY - wind * 26 + fly * 90, r: -2.5 + wind * 6 - fly * 34};
	};
	const cardIn = (u: number) => {
		const k = sp(u - FB + 0.04, 9.5, 5);
		return {x: lerp(W + 1200, 960, k), r: lerp(16, 0, k)};
	};
	const back = sp(t - FP, 10, 5.4);
	const s1 = lerp(1, CS, back);
	const o = cardOut(t);
	const moving = t >= THROW - 0.02 && t < THROW + 0.4;
	const inK = cardIn(t);
	const g = sp(t - FG, 8.5, 5.4);
	const s2 = lerp(CS, 1, g);
	const hand = pointer(t, [{t: FP, x: 1500, y: 1200}, {t: GRAB - 0.03, x: 1180, y: 760, d: 0.28}, {t: THROW, x: 1310, y: 740, d: THROW - GRAB - 0.05}, {t: THROW + 0.26, x: -300, y: 800, d: 0.26}]);
	const circle = out3(seg(t, FC, 0.3));
	// The film circled the product at a known place in its ad. Here the ad is unknown: the circle is drawn only if the spec says where the product is
	// (adSpot, fractions of the ad's frame, optional); otherwise it is left out, a circle round nothing looked wrong.
	const spot = (s as Spec & {adSpot?: [number, number]}).adSpot;
	const fx = spot ? 960 + (spot[0] - 0.5) * CW : 0;
	const fy = spot ? CY + (spot[1] - 0.5) * CH : 0;
	return (
		<AbsoluteFill style={{background: '#ffffff', overflow: 'hidden'}}>
			<BlurDefs />
			{/* colour trails behind what moves */}
			{moving && ([[0.1, PAL.yellow], [0.065, PAL.pink], [0.03, PAL.cyan]] as [number, string][]).map(([lag, c]) => { const q = cardOut(t - lag); return <Flat key={c} x={q.x} y={q.y} r={q.r} c={c} />; })}
			{t < THROW + 0.42 && (
				<div style={{position: 'absolute', left: t < FP ? 0 : o.x - W / 2, top: t < FP ? 0 : lerp(540, o.y, clamp(back)) - H / 2, width: W, height: H, transformOrigin: '50% 50%', transform: `rotate(${t < FP ? 0 : o.r * clamp(back)}deg) scale(${s1})`, borderRadius: 34 * clamp(back), overflow: 'hidden', filter: moving ? bx(in2(seg(t, THROW, 0.32)) * 70) : 'none', boxShadow: '0 30px 90px rgba(0,0,0,0.3)', background: '#000'}}>
					{t < FP ? <Clip src={s.video} at={0} len={FP} from={Math.max(0, s.freezeAt - FP)} muted /> : <Pic src={s.still} />}
				</div>
			)}
			{t >= FB - 0.04 && t < FB + 0.5 && ([[0.09, PAL.cyan], [0.06, PAL.pink], [0.03, PAL.yellow]] as [number, string][]).map(([lag, c]) => { const q = cardIn(t - lag); return <Flat key={c} x={q.x} y={CY} r={q.r} c={c} />; })}
			{t >= FB - 0.04 && (
				<div style={{position: 'absolute', left: inK.x - W / 2, top: lerp(CY, 540, clamp(g)) - H / 2, width: W, height: H, transformOrigin: '50% 50%', transform: `rotate(${inK.r}deg) scale(${s2})`, borderRadius: 34 * (1 - clamp(g)), overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,0.4)', background: '#000'}}>
					{t < AD ? <Pic src={s.adFirst} /> : <Clip src={s.ad} from={s.adFrom ?? 0} at={AD} len={end - AD + 0.1} volume={FG - AD < 0.05 ? 1 : (f: number) => interpolate(f, [0, fr(FG - AD), fr(FG - AD) + 14], [0.3, 0.3, 1], {extrapolateRight: 'clamp'})} />}
				</div>
			)}
			{spot && t >= FC && t < FG + 0.2 && (
				<svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: 1 - seg(t, FG, 0.14), overflow: 'visible'}}>
					<ellipse cx={fx} cy={fy} rx={205} ry={135} fill="none" stroke={PAL.yellow} strokeWidth={13} strokeLinecap="round" pathLength={1} strokeDasharray={`${circle} 1`} transform={`rotate(-82 ${fx} ${fy})`} />
				</svg>
			)}
			{t >= FA && t < FG + 0.3 && (
				<AbsoluteFill style={{opacity: 1 - seg(t, FG, 0.16)}}>
					<Line t={t} text={l0} at={FA} out={l1 ? OUT : undefined} />
					{l1 && t >= L2 && <Line t={t} text={l1} at={L2} />}
				</AbsoluteFill>
			)}
			{t >= FP && t < THROW + 0.3 && <Pointer x={hand.x} y={hand.y} press={Math.max(pressAt(t, GRAB), t > GRAB && t < THROW ? 1 : 0)} grab={t > GRAB && t < THROW} scale={2.6} />}
			<Rings t={t} at={FG + 0.32} colors={[PAL.yellow, '#ffffff']} />
			<Click at={FP} v={0.45} />
			<Click at={GRAB} v={0.9} />
			<Click at={THROW + 0.04} v={0.6} />
			<Click at={FB + 0.06} v={0.45} />
			{spot && <Click at={FC + 0.02} v={0.35} />}
			<Click at={FG + 0.04} v={0.55} />
		</AbsoluteFill>
	);
};
