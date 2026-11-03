// The bridge the product renders: one composition, driven by the run's spec (video, moment, ad, lines).
// The motion is the library's; only the inputs change from one video to the next. First move ported: `wall`
// (the picture falls back onto a gallery wall and swings on its nail; the ad is the next picture along).

import {loadFont as loadSans} from '@remotion/google-fonts/Geist';
import {loadFont as loadSerif} from '@remotion/google-fonts/InstrumentSerif';
import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const SANS = loadSans('normal', {weights: ['500'], subsets: ['latin']}).fontFamily;
const SERIF = loadSerif('italic', {weights: ['400'], subsets: ['latin']}).fontFamily;
export const W = 1920;
export const H = 1080;
export const FPS = 30;
const INK = '#101114';
const ACCENTS = ['#ff3ea5', '#7c3aed', '#0866ff', '#06b6d4'];

export type Spec = {
	move: 'wall';
	video: string; // files in the render's public folder
	still: string;
	ad: string;
	adFirst: string;
	freezeAt: number; // seconds into the video
	adFrom?: number; // where the ad starts playing
	lines: string[];
	adSeconds?: number; // how much of the ad is shown after the bridge
};

// ---------------------------------------------------------------- small motion kit (pure functions of time)

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, d: number) => clamp((t - a) / d);
const out3 = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const inOut = (x: number) => {
	const k = clamp(x);
	return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
/** From 0 to 1 with an overshoot. */
const sp = (u: number, w = 15, d = 6.5) => (u <= 0 ? 0 : 1 - Math.exp(-d * u) * Math.cos(w * u));
/** A pendulum that dies out. */
const swing = (u: number, amp: number, w = 7, d = 1.7) => (u <= 0 ? 0 : amp * Math.exp(-d * u) * Math.sin(w * u));
const fr = (s: number) => Math.round(s * FPS);
const mix = (a: string, b: string, k: number) => {
	const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
	const [x, y] = [p(a), p(b)];
	return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(k)))).join(',')})`;
};
let canvas: CanvasRenderingContext2D | null = null;
const measure = (text: string, font: string, spacing = 0) => {
	if (!canvas) canvas = document.createElement('canvas').getContext('2d');
	const c = canvas as CanvasRenderingContext2D & {letterSpacing: string};
	c.font = font;
	c.letterSpacing = `${spacing}px`;
	return c.measureText(text).width;
};

// ---------------------------------------------------------------- the line: words land one by one at reading pace, the last word in serif and colour

type Wd = {w: string; at: number; serif: boolean; color?: string};
const READ = 0.24; // seconds per word, a calm speaking pace
export const lineWords = (text: string, at: number, accent: string): Wd[] => {
	const parts = text.split(' ').filter(Boolean);
	return parts.map((w, i) => ({w, at: at + i * READ, serif: i === parts.length - 1, color: i === parts.length - 1 ? accent : undefined}));
};
export const lineLen = (text: string) => Math.max(1.1, text.split(' ').filter(Boolean).length * READ + 0.5);

const Words: React.FC<{t: number; words: Wd[]; size: number; x: number; y: number}> = ({t, words, size, x, y}) => {
	const spc = size * -0.02;
	const font = (w: Wd) => (w.serif ? `italic 400 ${size * 1.14}px ${SERIF}` : `500 ${size}px ${SANS}`);
	const items = words.map((w) => ({w, k: out3(seg(t, w.at, 0.36)), width: measure(w.w, font(w), w.serif ? 0 : spc)}));
	const gap = size * 0.27;
	const total = items.reduce((sum, it, i) => sum + (it.width + (i ? gap : 0)) * it.k, 0);
	let cur = x - total / 2;
	return (
		<>
			{items.map(({w, k, width}, i) => {
				if (i) cur += gap * k;
				const left = cur;
				cur += width * k;
				if (k <= 0) return null;
				return (
					<div key={i} style={{position: 'absolute', left, top: y, whiteSpace: 'nowrap', lineHeight: 1, fontFamily: w.serif ? SERIF : SANS, fontStyle: w.serif ? 'italic' : 'normal', fontSize: w.serif ? size * 1.14 : size, fontWeight: w.serif ? 400 : 500, letterSpacing: w.serif ? 0 : spc, color: mix('#b5b5ba', w.color ?? INK, seg(t, w.at + 0.1, 0.34)), transformOrigin: 'left center', transform: `translateY(-50%) translateY(${(1 - k) * size * 0.26}px) scale(${lerp(0.84, 1, k)})`, opacity: Math.min(1, k * 1.5), filter: k < 0.98 ? `blur(${(1 - k) * 7}px)` : 'none'}}>
						{w.w}
					</div>
				);
			})}
		</>
	);
};

const Rings: React.FC<{t: number; at: number; colors: string[]}> = ({t, at, colors}) => (
	<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
		{colors.map((c, i) => {
			const u = (t - at - i * 0.08) / 0.6;
			if (u <= 0 || u >= 1) return null;
			return <circle key={i} cx={W / 2} cy={H / 2} r={out3(u) * 1150} fill="none" stroke={c} strokeWidth={(1 - u) * 34} />;
		})}
	</svg>
);

const Clip: React.FC<{src: string; at: number; len: number; from?: number; muted?: boolean; volume?: number | ((f: number) => number)}> = ({src, at, len, from = 0, muted, volume = 1}) => (
	<Sequence from={fr(at)} durationInFrames={Math.max(1, fr(at + len) - fr(at)) + 1} layout="none">
		<OffthreadVideo src={staticFile(src)} startFrom={fr(from)} muted={muted} volume={volume} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
	</Sequence>
);
const Pic: React.FC<{src: string}> = ({src}) => <Img src={staticFile(src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />;
const Click: React.FC<{at: number; v?: number}> = ({at, v = 0.6}) => (
	<Sequence from={fr(at)} durationInFrames={fr(0.5)} layout="none">
		<Audio src={staticFile('click.ogg')} volume={v} />
	</Sequence>
);

// ---------------------------------------------------------------- wall

const LP = 1.0; // the video plays this long before it freezes
const LA = LP + 0.34;
const GAP = 1560;

export const wallTimes = (s: Spec) => {
	const [l0, l1] = s.lines;
	const LB = LA + lineLen(l0) + 0.16;
	const LW = l1 ? LB + 0.3 : LB - 0.1;
	const LWL = 0.62;
	const LG = (l1 ? LB + lineLen(l1) : LW + LWL + 0.3) - 0.06;
	const LGL = 0.66;
	return {LB, LW, LWL, LG, LGL, end: LG + LGL + (s.adSeconds ?? 4)};
};

const Hang: React.FC<{x: number; y: number; s: number; rot: number; wire: number; children: React.ReactNode}> = ({x, y, s, rot, wire, children}) => {
	const fw = W * s;
	const fh = H * s;
	const ny = y - fh / 2 - 86 * s * 2;
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: `${x}px ${ny}px`, transform: `rotate(${rot}deg)`}}>
			<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible', opacity: wire}}>
				<path d={`M${x - fw * 0.28} ${y - fh / 2} L${x} ${ny} L${x + fw * 0.28} ${y - fh / 2}`} stroke={INK} strokeWidth={3} fill="none" />
				<circle cx={x} cy={ny} r={7} fill={INK} />
			</svg>
			<div style={{position: 'absolute', left: x - fw / 2, top: y - fh / 2, width: fw, height: fh, background: '#000', boxShadow: `0 0 0 ${20 * s}px #ffffff, 0 0 0 ${23 * s}px rgba(0,0,0,0.85), 0 ${60 * s}px ${110 * s}px rgba(0,0,0,0.3)`}}>
				<div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>{children}</div>
			</div>
		</div>
	);
};

const Wall: React.FC<{t: number; s: Spec}> = ({t, s}) => {
	const {LB, LW, LWL, LG, LGL, end} = wallTimes(s);
	const k = sp(t - LP, 8, 4.4);
	const walk = inOut(seg(t, LW, LWL));
	const go = inOut(seg(t, LG, LGL));
	const s1 = lerp(1, 0.5, k);
	const y1 = lerp(540, 470, k);
	const camX = lerp(960, 960 + GAP, walk);
	const camY = lerp(540, 470, go);
	const z = lerp(1, 2, go) * (1 + seg(t, LP + 0.6, LG - LP - 0.6) * 0.018 * (1 - go));
	const rot1 = swing(t - LP - 0.42, 3.4) + swing(t - LB, -2.6, 9, 2.4);
	const rot2 = swing(t - LW - LWL + 0.3, 2.6, 8, 2.2);
	const w0 = lineWords(s.lines[0], LA, ACCENTS[0]);
	const w1 = s.lines[1] ? lineWords(s.lines[1], LB, ACCENTS[1]) : [];
	const dust = (i: number) => ({x: (i * 233) % 2600 - 300, y: 60 + ((i * 137) % 760), r: 2 + (i % 4)});
	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			<div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${960 - camX * z}px, ${540 - camY * z}px) scale(${z})`}}>
				<div style={{position: 'absolute', left: -1400, top: -900, width: 5600, height: 3000, background: '#f1f1f3'}} />
				<div style={{position: 'absolute', left: -1400, top: 1010, width: 5600, height: 1100, background: 'rgba(0,0,0,0.07)'}} />
				{Array.from({length: 26}, (_, i) => {
					const q = dust(i);
					return <div key={i} style={{position: 'absolute', left: q.x + Math.sin(t * 0.8 + i) * 22, top: q.y + Math.cos(t * 0.6 + i * 2) * 18 - t * 8, width: q.r * 2, height: q.r * 2, borderRadius: q.r, background: 'rgba(0,0,0,0.16)', opacity: clamp(k)}} />;
				})}
				<Hang x={960} y={y1} s={s1} rot={rot1} wire={seg(t, LP + 0.3, 0.2)}>{t < LP ? <Clip src={s.video} at={0} len={LP} from={Math.max(0, s.freezeAt - LP)} muted /> : <Pic src={s.still} />}</Hang>
				<Hang x={960 + GAP} y={470} s={0.5} rot={rot2 * (1 - go)} wire={1 - go}>
					{t < LG ? <Pic src={s.adFirst} /> : <Clip src={s.ad} from={s.adFrom ?? 0} at={LG} len={end - LG + 0.1} volume={(f: number) => interpolate(f, [0, 14], [0.3, 1], {extrapolateRight: 'clamp'})} />}
				</Hang>
				{t >= LA && <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H}}><Words t={t} x={960} y={852} size={96} words={w0} /></div>}
				{w1.length > 0 && t >= LB && <div style={{position: 'absolute', left: GAP, top: 0, width: W, height: H}}><Words t={t} x={960} y={852} size={96} words={w1} /></div>}
			</div>
			{clamp(k) > 0.5 && go < 0.6 && (
				<svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: (1 - go * 1.8) * seg(k, 0.5, 0.4)}}>
					{[-500, 560, 1620, 2680, 3740].map((x, i) => {
						const X = x - (camX - 960) * 1.7;
						return (
							<g key={i}>
								<rect x={X - 13} y={930} width={26} height={170} fill={INK} />
								<circle cx={X} cy={926} r={24} fill={INK} />
								<path d={`M${X} 944 Q${X + 530} 1050 ${X + 1060} 944`} stroke={INK} strokeWidth={14} fill="none" />
							</g>
						);
					})}
				</svg>
			)}
			<Rings t={t} at={LG + LGL - 0.1} colors={[ACCENTS[1], ACCENTS[0]]} />
			<Click at={LP + 0.42} />
			<Click at={LA} v={0.4} />
			{w1.length > 0 && <Click at={LB} v={0.4} />}
			<Click at={LW + LWL - 0.1} v={0.5} />
		</AbsoluteFill>
	);
};

export const bridgeSeconds = (s: Spec) => wallTimes(s).end;

export const Bridge: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return <Wall t={frame / fps} s={s} />;
};
