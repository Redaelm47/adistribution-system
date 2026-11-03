// Dive: someone yells at the video to stop. The image freezes as it is, no cinema treatment (Reda:
// "quand on fige de manière cinématique, c'est pas bien"). "Wait, wait, wait..." hits one word at a
// time, each in another face, each a small jump of the camera. "Look!" swings the camera to a surface
// of the scene and a viewfinder snaps onto it (the frame is the point), "right there!" lights it up with
// the ad's first frame, the camera dives in and he passes it. Back: "Okay, okay, okay!" while the camera
// pulls out, and "Go, go, go!" lets the jump go. Rules from docs/reports/Hooks et rétention publicitaire.md.

import {loadFont as loadBebas} from '@remotion/google-fonts/BebasNeue';
import {loadFont as loadMono} from '@remotion/google-fonts/FragmentMono';
import {loadFont as loadSerif} from '@remotion/google-fonts/InstrumentSerif';
import {loadFont as loadSyne} from '@remotion/google-fonts/Syne';
import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {AD, T as GAG, VIDEO} from '../ad';
import {H, Player, SHOWN, W, SourceFrame} from '../kit';
import {clamp01, glide, lerp, step} from '../motion';
import {INK, WHITE, fontFamily} from '../ui';
import lines from '../../public/voice/dive/lines.json';
import {snap, voiceSet} from './voice';

const {fontFamily: SERIF} = loadSerif('italic', {weights: ['400'], subsets: ['latin']});
const {fontFamily: MONO} = loadMono('normal', {weights: ['400'], subsets: ['latin']});
const {fontFamily: BEBAS} = loadBebas('normal', {weights: ['400'], subsets: ['latin']});
const {fontFamily: SYNE} = loadSyne('normal', {weights: ['700'], subsets: ['latin']});

const V = voiceSet(lines);

// The board: on the left tarp panel, on his line of sight. The lamp post stands in front of it, just
// left of the ad's "You": it must never cover the word.
const BOARD = {x: 660, y: 458, w: 245, h: (245 * 9) / 16};
const C0 = {x: BOARD.x + BOARD.w / 2, y: BOARD.y + BOARD.h / 2};
const DIVE = W / BOARD.w;
const POLE = {x: 736, w: 18, y: 446, h: 165};
const FRAME = {x0: BOARD.x - 14, y0: BOARD.y - 14, x1: BOARD.x + BOARD.w + 14, y1: BOARD.y + BOARD.h + 14};

const freeze = GAG.freeze;
const DIVE_D = 0.8;
const PULL_D = 0.62;
const U_HOLD = 0.2; // how close the camera stays once it has swung to the board

const timeline = () => {
	const inAt = freeze + 0.06;
	const w = V.words('in', inAt); // Wait (a few), Look!, Look, right, there!
	const k = w.findIndex((x) => x.w.startsWith('Look'));
	const waits = w.slice(0, k).map((x) => x.start);
	const look = w[k].start;
	const lookEnd = w[k + 1].start;
	const there = w[k + 2].start;
	const land = w[k + 3].start;
	const dive = V.end('in', inAt) + 0.02;
	const adStart = snap(dive + DIVE_D);
	const adEnd = adStart + AD.duration;
	const pull = adEnd + 0.04;
	const outAt = pull + 0.24;
	const o = V.words('out', outAt); // Okay x3, Go x3
	const resume = snap(o[3].start);
	return {inAt, waits, look, lookEnd, there, land, dive, adStart, adEnd, pull, outAt, okays: o.slice(0, 3).map((x) => x.start), gos: o.slice(3).map((x) => x.start), resume, textOut: V.end('out', outAt) + 0.3, total: resume + (VIDEO.end - VIDEO.freezeAt) + 0.4};
};
export const TL = timeline();

const sourceSeconds = (t: number) => (t < freeze ? VIDEO.leadIn + t * VIDEO.leadInRate : t < TL.resume ? VIDEO.freezeAt : VIDEO.freezeAt + (t - TL.resume));

const SFX = [
	{t: freeze, src: 'fs338220.mp3', volume: 0.42},
	...TL.waits.map((t, i) => ({t, src: `tap${i}.wav`, volume: 0.26})),
	{t: TL.look, src: 'fs338219.mp3', volume: 0.36},
	{t: TL.land, src: 'fs830459.mp3', volume: 0.34},
	{t: TL.dive - 0.02, src: 'fs648729.mp3', volume: 0.36},
	{t: TL.pull, src: 'fs648729.mp3', volume: 0.3},
	...TL.okays.map((t, i) => ({t, src: `tap${i}.wav`, volume: 0.24})),
	...TL.gos.map((t, i) => ({t, src: `tap${i + 2}.wav`, volume: 0.28})),
];

// One face per "wait" (the font-shuffle move from snapcn, here on the beat of the voice).
const WAITS = [
	{text: 'Wait', font: fontFamily, weight: 800, size: 190, color: WHITE, spacing: '-0.04em'},
	{text: 'WAIT', font: BEBAS, weight: 400, size: 236, color: WHITE, spacing: '0'},
	{text: 'Wait', font: SERIF, weight: 400, size: 240, color: WHITE, spacing: '-0.01em'},
	{text: 'wait', font: MONO, weight: 400, size: 176, color: WHITE, spacing: '-0.03em'},
	{text: 'WAIT', font: SYNE, weight: 700, size: 176, color: WHITE, spacing: '-0.02em'},
];
const SHADOW = '0 2px 34px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)';

/** A word set on the spot, centred on (x, y), with a small hit of scale as it lands. */
const Hit: React.FC<{t: number; at: number; x: number; y: number; font?: string; weight?: number; size: number; color?: string; spacing?: string; children: React.ReactNode}> = ({t, at, x, y, font = fontFamily, weight = 800, size, color = WHITE, spacing = '-0.04em', children}) => (
	<div
		style={{
			position: 'absolute',
			left: x,
			top: y,
			transform: `translate(-50%, -50%) scale(${1.09 - 0.09 * step(t - at, {response: 0.16, damping: 0.8})})`,
			whiteSpace: 'pre',
			fontFamily: font,
			fontWeight: weight,
			fontSize: size,
			lineHeight: 1,
			letterSpacing: spacing,
			color,
			textShadow: SHADOW,
		}}
	>
		{children}
	</div>
);

/** The frame: a viewfinder that snaps onto the surface, in screen space so its stroke stays bold. */
const Viewfinder: React.FC<{t: number; at: number; out: number; a: {x: number; y: number}; b: {x: number; y: number}}> = ({t, at, out, a, b}) => {
	if (t < at || t >= out + 0.14) return null;
	const g = 1.28 - 0.28 * step(t - at, {response: 0.2, damping: 0.72});
	const cx = (a.x + b.x) / 2;
	const cy = (a.y + b.y) / 2;
	const L = 62;
	const corners = [
		[a.x, a.y, 1, 1],
		[b.x, a.y, -1, 1],
		[b.x, b.y, -1, -1],
		[a.x, b.y, 1, -1],
	];
	return (
		<svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: 1 - glide(t, out, 0.14), filter: 'drop-shadow(0 1px 8px rgba(0,0,0,0.45))'}}>
			<g transform={`translate(${cx} ${cy}) scale(${g}) translate(${-cx} ${-cy})`}>
				{corners.map(([x, y, dx, dy], i) => (
					<path key={i} d={`M${x} ${y + dy * L} V${y} H${x + dx * L}`} fill="none" stroke={WHITE} strokeWidth={7} strokeLinecap="square" strokeLinejoin="miter" />
				))}
			</g>
		</svg>
	);
};

const WORD_Y = 205;
const WORD_X = 1150;

export const Dive: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const tf = Math.floor(t * 50) / 50;
	const {waits, look, lookEnd, land, dive, adEnd, pull, resume, okays, gos, textOut} = TL;
	const paused = t >= freeze && t < resume;

	// Camera: a small jump on every "wait", a swing to the board on "Look!", then the dive.
	const jumps = waits.reduce((a, at) => a + glide(t, at, 0.13), 0) / waits.length;
	const u = 0.07 * jumps + (U_HOLD - 0.07) * glide(t, look - 0.03, 0.3) + (1 - U_HOLD) * glide(t, dive, DIVE_D) - (1 - U_HOLD) * glide(t, pull, PULL_D) - U_HOLD * glide(t, resume - 0.4, 0.4);
	const s = Math.exp(u * Math.log(DIVE));
	const bx = lerp(C0.x, W / 2, u);
	const by = lerp(C0.y, H / 2, u);
	const toScreen = (x: number, y: number) => ({x: bx + (x - C0.x) * s, y: by + (y - C0.y) * s});

	// He is nearer than the fence: in the dive he grows faster and passes the camera.
	const away = glide(t, dive, DIVE_D) - glide(t, pull, PULL_D);
	const sp = Math.exp(u * Math.log(DIVE) * (1 + 0.35 * away));
	const personIn = 1 - glide(t, dive + DIVE_D * 0.28, DIVE_D * 0.3) + glide(t, pull + PULL_D * 0.3, PULL_D * 0.34);

	const flash = t >= freeze && t < freeze + 0.1 ? 0.34 * (1 - (t - freeze) / 0.1) : 0;
	const controls = 1 - glide(t, dive, 0.25) + glide(t, resume - 0.4, 0.3) - glide(t, resume + 1.2, 0.4);

	// The board opens out of a point at the middle of the viewfinder, one shape, corners tightening.
	const bloom = glide(t, land, 0.3) - glide(t, resume - 0.32, 0.2);
	const lit = bloom > 0.001;
	const bw = lerp(20 / s, BOARD.w, bloom);
	const bh = lerp(20 / s, BOARD.h, glide(t, land, 0.22) - glide(t, resume - 0.32, 0.2));
	const br = lerp(10 / s, 1.5, bloom);
	const led = 1 - glide(t, dive + DIVE_D * 0.5, DIVE_D * 0.45) + glide(t, pull, PULL_D * 0.5);
	const poleAway = glide(t, dive, DIVE_D * 0.7) - glide(t, pull + PULL_D * 0.25, PULL_D * 0.7);

	// Words: over him in the sky for "wait", over the viewfinder for "look".
	const wait = waits.reduce((n, at) => (t >= at ? n + 1 : n), 0) - 1;
	const above = toScreen(C0.x, FRAME.y0 - 92 / s);
	const wordsOut = glide(t, dive - 0.04, 0.22);
	const okay = okays.reduce((n, at) => (t >= at ? n + 1 : n), 0);
	const go = gos.reduce((n, at) => (t >= at ? n + 1 : n), 0);

	return (
		<AbsoluteFill style={{background: INK, overflow: 'hidden'}}>
			<AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${bx - C0.x * s}px, ${by - C0.y * s}px) scale(${s})`}}>
				<Sequence durationInFrames={Math.round((freeze - 0.06) * fps)}>
					<OffthreadVideo src={staticFile(VIDEO.leadInClip)} muted />
				</Sequence>
				{t >= freeze - 0.06 && t < freeze && <SourceFrame s={VIDEO.leadIn + t * VIDEO.leadInRate} />}
				{/* The patched plate only while he moves against the background: at rest the frame stays untouched. */}
				{paused && <Img src={staticFile(away > 0.001 ? 'demo/plate.jpg' : VIDEO.freeze)} style={{position: 'absolute', width: W, height: H}} />}
				<Sequence from={Math.round(resume * fps)}>
					<OffthreadVideo src={staticFile(VIDEO.clip)} trimBefore={Math.round(VIDEO.freezeAt * fps)} muted />
				</Sequence>
				{lit && paused && (
					<>
						<div style={{position: 'absolute', left: BOARD.x - 190, top: BOARD.y - 140, width: BOARD.w + 380, height: BOARD.h + 320, background: 'radial-gradient(ellipse at 50% 42%, rgba(255,236,214,0.42), transparent 66%)', mixBlendMode: 'screen', opacity: bloom * led}} />
						<div style={{position: 'absolute', left: BOARD.x, top: BOARD.y, width: BOARD.w, height: BOARD.h, overflow: 'hidden', clipPath: `inset(${(BOARD.h - bh) / 2}px ${(BOARD.w - bw) / 2}px round ${br}px)`}}>
							<Img src={staticFile(t < adEnd ? AD.first : AD.last)} style={{width: '100%', height: '100%'}} />
							<div style={{position: 'absolute', inset: 0, boxShadow: 'inset 0 0 8px rgba(0,0,0,0.35)', opacity: led}} />
						</div>
						<Img src={staticFile(VIDEO.freeze)} style={{position: 'absolute', width: W, height: H, clipPath: `inset(${POLE.y}px ${W - POLE.x - POLE.w}px ${H - POLE.y - POLE.h}px ${POLE.x}px)`, transform: `translateX(${-poleAway * 260}px)`, opacity: 1 - poleAway}} />
					</>
				)}
			</AbsoluteFill>

			{paused && personIn > 0.001 && (
				<AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${bx - C0.x * sp}px, ${by - C0.y * sp}px) scale(${sp})`, opacity: clamp01(personIn)}}>
					<Img src={staticFile('demo/person_clean.png')} style={{position: 'absolute', width: W, height: H}} />
				</AbsoluteFill>
			)}

			<Viewfinder t={t} at={look} out={dive - 0.06} a={toScreen(FRAME.x0, FRAME.y0)} b={toScreen(FRAME.x1, FRAME.y1)} />

			{t < dive + 0.2 && (
				<AbsoluteFill style={{opacity: 1 - wordsOut}}>
					{wait >= 0 && t < look && <Hit t={t} at={waits[wait]} x={WORD_X} y={WORD_Y} {...WAITS[wait]}>{WAITS[wait].text}</Hit>}
					{t >= look && t < lookEnd && <Hit t={t} at={look} x={above.x} y={above.y} size={132}>Look!</Hit>}
					{t >= lookEnd && <Hit t={t} at={lookEnd} x={above.x} y={above.y} font={SERIF} weight={400} size={172} spacing="-0.01em">right there</Hit>}
				</AbsoluteFill>
			)}
			{t >= okays[0] && t < gos[0] && okay > 0 && <Hit t={t} at={okays[okay - 1]} x={WORD_X} y={WORD_Y} size={okay === 3 ? 190 : 150}>{okay === 3 ? 'Okay!' : 'Okay'}</Hit>}
			{t >= gos[0] && t < textOut && <Hit t={t} at={gos[go - 1]} x={WORD_X} y={WORD_Y} font={go === 2 ? BEBAS : fontFamily} size={go === 2 ? 250 : 200} spacing={go === 2 ? '0' : '-0.04em'} color={WHITE}>{go === 2 ? 'GO' : 'Go!'}</Hit>}

			{flash > 0 && <AbsoluteFill style={{background: WHITE, opacity: flash}} />}
			<Player controls={clamp01(controls)} progress={clamp01((SHOWN.at + sourceSeconds(tf)) / SHOWN.length)} paused={paused} press={0} time={SHOWN.at + sourceSeconds(tf)} length={SHOWN.length} />

			<Sequence from={Math.round(TL.inAt * fps)}>
				<Audio src={staticFile(V.line('in').file)} />
			</Sequence>
			<Sequence from={Math.round(TL.outAt * fps)}>
				<Audio src={staticFile(V.line('out').file)} />
			</Sequence>
			{SFX.map((e, i) => (
				<Sequence key={i} from={Math.round(e.t * fps)}>
					<Audio src={staticFile(`sfx/${e.src}`)} volume={e.volume} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};
