// Behind (level 2, needs a cut-out subject): "Psst." The subject steps out of its own picture, the picture goes dark behind it, a panel of tiles flips into the ad,
// "Behind you.", and the camera goes past the subject into the ad. Ported from the launch film (film7/transitions.tsx, TBehindV), motion untouched:
// only the inputs change (video, still, cut-out, ad, lines), the subject's place decides which side the panel and the lines go.

import {loadFont as loadSans} from '@remotion/google-fonts/Geist';
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile} from 'remotion';
import {Click, Clip, H, MoveProps, Pic, READ, Rings, SANS, SERIF, Spec, W, clamp, fr, inOut, lerp, measure, out3, seg, sp} from '../kit';

loadSans('normal', {weights: ['600'], subsets: ['latin']}); // the film's second line is Geist 600
const PAL = {blue: '#0866ff', yellow: '#ffd000', violet: '#7c3aed', cyan: '#00c2e0'}; // the film's colours
const in2 = (x: number) => Math.pow(clamp(x), 2);

const BP = 1.2; // the video plays this long before it freezes
const BA = BP + 0.1;
const BGL = 0.72;
const PW = W * 0.6;
const PH = H * 0.6;
const M = 80; // side margin for the lines

/** How long a line takes to say (the film's voice: "Psst." 0.34 s, "Behind you." 0.59 s). */
const say = (text: string) => 0.1 + text.split(' ').filter(Boolean).length * READ;

export const behindTimes = (s: Spec) => {
	const [l0, l1] = s.lines;
	const BB = BA + say(l0 ?? '') + 0.12;
	const BG = BB + Math.max(l1 ? say(l1) + 0.1 : 0, 0.72);
	return {BB, BG, end: BG + BGL + (s.adSeconds ?? 4)};
};
export const behindSeconds = (s: Spec) => behindTimes(s).end;
/** When each line starts, for the voice. */
export const behindLineAt = (s: Spec) => [BA, behindTimes(s).BB];

// ---------------------------------------------------------------- primitives copied from the film (film7/moves.tsx)

/** A line whose letters land one by one, each with its own little overshoot. */
const Letters: React.FC<{t: number; text: string; at: number; x: number; y: number; size: number; color?: string; colorAt?: (i: number) => string; serif?: boolean; weight?: number; each?: number; out?: number; shadow?: string}> = ({t, text, at, x, y, size, color = '#ffffff', colorAt, serif, weight = 600, each = 0.034, out, shadow = '0 4px 34px rgba(0,0,0,0.55)'}) => {
	const font = serif ? `italic 400 ${size}px ${SERIF}` : `${weight} ${size}px ${SANS}`;
	const spacing = serif ? 0 : -size * 0.025;
	const whole = measure(text, font, spacing);
	return (
		<>
			{text.split('').map((ch, i) => {
				const u = t - at - i * each;
				if (u <= 0 || ch === ' ') return null;
				const k = sp(u, 17, 7);
				const left = x - whole / 2 + measure(text.slice(0, i), font, spacing);
				const ex = out !== undefined ? in2((t - out - i * each * 0.4) / 0.18) * (t > out + i * each * 0.4 ? 1 : 0) : 0;
				if (ex >= 1) return null;
				return (
					<div key={i} style={{position: 'absolute', left, top: y, lineHeight: 1, whiteSpace: 'pre', transformOrigin: '50% 70%', transform: `translateY(calc(-50% + ${(1 - k) * size * 0.62 - clamp(ex) * size * 0.7}px)) scale(${lerp(0.35, 1, k)}) rotate(${(1 - k) * (i % 2 ? 16 : -16)}deg)`, opacity: Math.min(1, u * 16) * (1 - clamp(ex)), fontFamily: serif ? SERIF : SANS, fontStyle: serif ? 'italic' : 'normal', fontWeight: serif ? 400 : weight, fontSize: size, color: colorAt ? colorAt(i) : color, textShadow: shadow}}>
						{ch}
					</div>
				);
			})}
		</>
	);
};

/** A picture made of tiles: each one pops up in colour from the middle out, then flips over to show its piece. */
const Tiles: React.FC<{t: number; at: number; src: string; w: number; h: number; cols?: number; rows?: number; spread?: number; colors?: string[]}> = ({t, at, src, w, h, cols = 12, rows = 7, spread = 0.36, colors = [PAL.cyan, PAL.blue, PAL.violet]}) => {
	const tw = w / cols;
	const th = h / rows;
	const url = staticFile(src);
	const far = Math.hypot(w / 2, h / 2);
	return (
		<>
			<Img src={url} style={{position: 'absolute', width: 1, height: 1, opacity: 0}} />
			{Array.from({length: cols * rows}, (_, i) => {
				const cx = i % cols;
				const cy = Math.floor(i / cols);
				const left = cx * tw;
				const top = cy * th;
				const delay = (Math.hypot(left + tw / 2 - w / 2, top + th / 2 - h / 2) / far) * spread;
				const u = t - at - delay;
				if (u <= 0) return null;
				const pop = sp(u, 20, 9);
				const flip = sp(u - 0.12, 12, 7);
				const a = lerp(180, 0, flip);
				return (
					<div key={i} style={{position: 'absolute', left, top, width: tw + 0.6, height: th + 0.6, perspective: 700, transform: `scale(${pop})`}}>
						<div style={{position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: `rotateY(${a}deg)`, backgroundImage: `url(${url})`, backgroundSize: `${w}px ${h}px`, backgroundPosition: `${-left}px ${-top}px`}} />
						<div style={{position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: `rotateY(${a + 180}deg)`, background: colors[(cx + cy) % colors.length]}} />
					</div>
				);
			})}
		</>
	);
};

// ---------------------------------------------------------------- where things go, from the subject's place (the film: cat on the right, panel and lines on the left)

const layout = (s: Spec) => {
	const box = s.box ?? (s.center ? [s.center[0] - 1, s.center[1] - 1, s.center[0] + 1, s.center[1] + 1] : [0, 0, W, H]);
	const c = s.center ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
	const f = s.face ?? c;
	const left = box[0] >= W - box[2]; // the panel goes where there is more room
	const dir = left ? 1 : -1; // the subject leaves the other way
	// The film throws the cat 1350 px aside while it grows 2.6 times around its face (cat from x 917, face at 1340): a subject that sits further in
	// gets a longer throw, so that it clears the frame as the cat did.
	const clear = (fx: number, near: number) => W + 40 - fx + (fx - near) * 2.45;
	const need = left ? clear(f[0], box[0]) : clear(W - f[0], W - box[2]);
	return {f: {x: f[0], y: f[1]}, left, dir, throwX: Math.max(1350, (1350 * need) / clear(1340, 917)), mx: (x: number) => (left ? x : W - x)};
};

export const Behind: React.FC<MoveProps> = ({t, s}) => {
	const {BB, BG, end} = behindTimes(s);
	const {f, left, dir, throwX, mx} = layout(s);
	const [l0 = '', l1] = s.lines;
	const dim = out3(seg(t, BA - 0.05, 0.5));
	const go = inOut(seg(t, BG, BGL));
	const sc = lerp(0.6, 1, go);
	const cx = lerp(mx(650), 960, go);
	const cy = lerp(460, 540, go);
	const pop = sp(t - BA, 11, 5);
	const video = t >= BB + 0.56;
	const cutS = (1 + (t - BP) * 0.012 + pop * 0.05) * lerp(1, 2.6, go * go);
	// first line: the film's "Psst." (serif, cyan, 240 px, sound waves towards the subject); a long line shrinks to fit
	const WAVES = 230;
	const f0 = (z: number) => `italic 400 ${z}px ${SERIF}`;
	const w0 = measure(l0, f0(240));
	const size0 = Math.min(240, (240 * (W - 2 * M - WAVES)) / Math.max(1, w0));
	const k0 = size0 / 240;
	const half0 = (w0 * k0) / 2;
	const x0 = left ? Math.max(M + half0, Math.min(560, W - M - WAVES - half0)) : Math.min(W - M - half0, Math.max(W - 560, M + WAVES + half0));
	const wx = x0 + dir * (half0 + 70 * k0);
	// second line: "Behind you." (Geist 600, white, the last word yellow), under the panel
	const f1 = (z: number) => `600 ${z}px ${SANS}`;
	const w1 = l1 ? measure(l1, f1(116), -116 * 0.025) : 0;
	const size1 = Math.min(116, (116 * (W - 2 * M)) / Math.max(1, w1));
	const half1 = (w1 * size1) / 116 / 2;
	const x1 = Math.max(M + half1, Math.min(W - M - half1, mx(650)));
	const last1 = l1 ? l1.trimEnd().lastIndexOf(' ') : -1;
	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			{t < BP && <Clip src={s.video} at={0} len={BP} from={Math.max(0, s.freezeAt - BP)} muted />}
			{t >= BP && (
				<>
					<AbsoluteFill style={{transformOrigin: `${f.x}px ${f.y}px`, transform: `scale(${1 + (t - BP) * 0.012})`}}>
						<AbsoluteFill style={{filter: `blur(${dim * 16}px) saturate(${lerp(1, 0.6, dim)}) brightness(${lerp(1, 0.26, dim)})`}}>
							<Pic src={s.plate ?? s.still} />
						</AbsoluteFill>
					</AbsoluteFill>
					{t >= BB && (
						<div style={{position: 'absolute', left: cx - (W * sc) / 2, top: cy - (H * sc) / 2, width: W * sc, height: H * sc, borderRadius: lerp(16, 0, go), overflow: 'hidden', boxShadow: video ? `0 0 ${lerp(150, 0, go)}px ${lerp(26, 0, go)}px rgba(255,255,255,0.28), 0 0 0 ${lerp(5, 0, go)}px #ffffff` : 'none'}}>
							{!video && <Tiles t={t} at={BB} src={s.adFirst} w={PW} h={PH} />}
							{video && <Clip src={s.ad} from={s.adFrom ?? 0} at={BB + 0.56} len={end - BB - 0.56 + 0.1} volume={(fv: number) => interpolate(fv, [0, fr(Math.max(0.05, BG - BB - 0.54)), fr(BG - BB - 0.2)], [0.16, 0.16, 1], {extrapolateRight: 'clamp'})} />}
						</div>
					)}
					{s.cutout && go < 0.95 && <Img src={staticFile(s.cutout)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transformOrigin: `${f.x}px ${f.y}px`, transform: `translate(${dir * go * go * throwX}px, ${go * go * 340}px) scale(${cutS})`, filter: go > 0.05 ? `blur(${go * 12}px)` : 'none', opacity: 1 - seg(go, 0.9, 0.05)}} />}
					<Rings t={t} at={BG + BGL - 0.12} colors={[PAL.cyan, '#ffffff']} />
				</>
			)}
			{t >= BA && t < BB && (
				<>
					<Letters t={t} text={l0} at={BA} x={x0} y={480} size={size0} serif color={PAL.cyan} each={Math.min(0.034, 0.7 / Math.max(1, l0.length))} out={BB - 0.12} />
					<svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
						{[0, 1, 2].map((i) => {
							const u = (t - BA - 0.16 - i * 0.09) / 0.42;
							if (u <= 0 || u >= 1) return null;
							const R = (80 + i * 56) * k0;
							return <path key={i} d={`M${wx + dir * R * 0.5} ${480 - R * 0.86} A${R} ${R} 0 0 ${left ? 1 : 0} ${wx + dir * R * 0.5} ${480 + R * 0.86}`} stroke={PAL.cyan} strokeWidth={Math.max(4, 9 * k0)} fill="none" strokeLinecap="round" opacity={1 - u} />;
						})}
					</svg>
				</>
			)}
			{l1 && t >= BB && t < BG + 0.3 && <Letters t={t} text={l1} at={BB} x={x1} y={900} size={size1} color="#ffffff" each={Math.min(0.028, 0.7 / l1.length)} out={BG} colorAt={(i) => (i > last1 ? PAL.yellow : '#ffffff')} />}
			<Click at={BP} v={0.6} />
			<Click at={BA} v={0.4} />
			{Array.from({length: 8}, (_, i) => <Click key={i} at={BB + i * 0.055} v={0.22} />)}
			<Click at={BB + 0.56} v={0.5} />
			<Click at={BG + BGL - 0.1} v={0.6} />
		</AbsoluteFill>
	);
};
