// What every move shares: canvas size, fonts, palette, the spec a run hands over, and a small motion kit (pure functions of time).
// A move lives in ./moves/<Name>.tsx and exports a component ({t, s}) and a function giving its length in seconds.

import {loadFont as loadSans} from '@remotion/google-fonts/Geist';
import {loadFont as loadSerif} from '@remotion/google-fonts/InstrumentSerif';
import React from 'react';
import {Audio, Img, OffthreadVideo, Sequence, staticFile} from 'remotion';

export const SANS = loadSans('normal', {weights: ['500'], subsets: ['latin']}).fontFamily;
export const SERIF = loadSerif('italic', {weights: ['400'], subsets: ['latin']}).fontFamily;
export const W = 1920;
export const H = 1080;
export const FPS = 30;
export const INK = '#101114';
export const ACCENTS = ['#ff3ea5', '#7c3aed', '#0866ff', '#06b6d4'];

export type MoveId = 'wall' | 'camera' | 'throw' | 'iris' | 'behind' | 'thought';

export type Spec = {
	move: MoveId;
	video: string; // files in the render's public folder
	still: string; // the frozen frame, 1920x1080, cropped like the video on screen (object-fit: cover)
	ad: string;
	adFirst: string; // the ad's first frame, 1920x1080
	freezeAt: number; // seconds into the video
	adFrom?: number; // where the ad starts playing
	lines: string[];
	adSeconds?: number; // how much of the ad is shown after the bridge
	// Only when SAM 3.1 cut out a subject (moves of level 2), all in the 1920x1080 frame of `still`:
	cutout?: string; // the subject alone, PNG with alpha, 1920x1080, same place as in the still
	plate?: string; // the still with the subject filled in (optional; moves fall back to a blurred still)
	box?: [number, number, number, number]; // x0, y0, x1, y1 of the subject
	center?: [number, number]; // centre of mass of the mask
	face?: [number, number]; // a point near the top of the subject (head), for moves that aim at the face
};

export type MoveProps = {t: number; s: Spec};

// ---------------------------------------------------------------- small motion kit (pure functions of time)

export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const seg = (t: number, a: number, d: number) => clamp((t - a) / d);
export const out3 = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const inOut = (x: number) => {
	const k = clamp(x);
	return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
/** From 0 to 1 with an overshoot. */
export const sp = (u: number, w = 15, d = 6.5) => (u <= 0 ? 0 : 1 - Math.exp(-d * u) * Math.cos(w * u));
/** A pendulum that dies out. */
export const swing = (u: number, amp: number, w = 7, d = 1.7) => (u <= 0 ? 0 : amp * Math.exp(-d * u) * Math.sin(w * u));
export const fr = (s: number) => Math.round(s * FPS);
export const mix = (a: string, b: string, k: number) => {
	const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
	const [x, y] = [p(a), p(b)];
	return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(k)))).join(',')})`;
};
let canvas: CanvasRenderingContext2D | null = null;
export const measure = (text: string, font: string, spacing = 0) => {
	if (!canvas) canvas = document.createElement('canvas').getContext('2d');
	const c = canvas as CanvasRenderingContext2D & {letterSpacing: string};
	c.font = font;
	c.letterSpacing = `${spacing}px`;
	return c.measureText(text).width;
};

// ---------------------------------------------------------------- the line: words land one by one at reading pace, the last word in serif and colour

export type Wd = {w: string; at: number; serif: boolean; color?: string};
export const READ = 0.24; // seconds per word, a calm speaking pace
export const lineWords = (text: string, at: number, accent: string): Wd[] => {
	const parts = text.split(' ').filter(Boolean);
	return parts.map((w, i) => ({w, at: at + i * READ, serif: i === parts.length - 1, color: i === parts.length - 1 ? accent : undefined}));
};
export const lineLen = (text: string) => Math.max(1.1, text.split(' ').filter(Boolean).length * READ + 0.5);

export const Words: React.FC<{t: number; words: Wd[]; size: number; x: number; y: number}> = ({t, words, size, x, y}) => {
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

export const Rings: React.FC<{t: number; at: number; colors: string[]}> = ({t, at, colors}) => (
	<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
		{colors.map((c, i) => {
			const u = (t - at - i * 0.08) / 0.6;
			if (u <= 0 || u >= 1) return null;
			return <circle key={i} cx={W / 2} cy={H / 2} r={out3(u) * 1150} fill="none" stroke={c} strokeWidth={(1 - u) * 34} />;
		})}
	</svg>
);

export const Clip: React.FC<{src: string; at: number; len: number; from?: number; muted?: boolean; volume?: number | ((f: number) => number)}> = ({src, at, len, from = 0, muted, volume = 1}) => (
	<Sequence from={fr(at)} durationInFrames={Math.max(1, fr(at + len) - fr(at)) + 1} layout="none">
		<OffthreadVideo src={staticFile(src)} startFrom={fr(from)} muted={muted} volume={volume} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
	</Sequence>
);
export const Pic: React.FC<{src: string}> = ({src}) => <Img src={staticFile(src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />;
export const Click: React.FC<{at: number; v?: number}> = ({at, v = 0.6}) => (
	<Sequence from={fr(at)} durationInFrames={fr(0.5)} layout="none">
		<Audio src={staticFile('click.ogg')} volume={v} />
	</Sequence>
);

