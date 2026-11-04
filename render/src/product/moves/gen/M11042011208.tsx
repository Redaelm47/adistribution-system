// Scent (level 2, needs a subject): a dotted scent trail curls in from off-screen,
// the kitten leans after it with its nose, then the trail pulls the frozen frame into the ad.

import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {ACCENTS, Click, Clip, H, INK, MoveProps, Pic, Spec, W, Words, inOut, lerp, lineLen, lineWords, out3, seg, sp} from '../../kit';

const LP = 1.0; // the video plays this long before it freezes
const LA = LP + 0.34; // the first line starts
const LGL = 0.7; // the pull into the ad
const PINK = ACCENTS[0];
const CYAN = ACCENTS[3];
const ND = 44; // dots on the trail

export const scentTimes = (s: Spec) => {
	const l0 = s.lines[0] ?? '';
	const l1 = s.lines[1];
	const LB = LA + lineLen(l0) + 0.16;
	const raw = LB + (l1 ? lineLen(l1) : 0.8) + 0.7;
	const LG = Math.min(Math.max(raw, LP + 4.2), LP + 7.2); // the bridge itself lasts 4 to 8 s
	return {l0, l1, LB, LG, end: LG + LGL + (s.adSeconds ?? 4)};
};

type Pt = [number, number];

const nose = (s: Spec): Pt => {
	const p = s.face ?? s.center ?? [W / 2, H * 0.42];
	return [Math.min(Math.max(p[0], 120), W - 120), Math.min(Math.max(p[1], 120), H - 120)];
};

const cr = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt => {
	const u2 = u * u;
	const u3 = u2 * u;
	const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
	return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
};

const track = (pts: Pt[], u: number): Pt => {
	const n = pts.length - 1;
	const x = Math.min(n - 1e-6, Math.max(0, u * n));
	const i = Math.floor(x);
	const k = x - i;
	return cr(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(n, i + 2)], k);
};

/** The trail's curl, from off-screen left to the nose. */
const trailPts = (N: Pt): Pt[] => {
	const cx = Math.min(Math.max(N[0], 620), W - 120);
	const cy = N[1];
	return [
		[-140, 930],
		[420, 905],
		[690, 625],
		[cx - 400, Math.min(H - 90, cy + 200)],
		[cx - 155, cy + 95],
		N,
	];
};

export const Move: React.FC<MoveProps> = ({t, s}) => {
	const {l0, l1, LB, LG, end} = scentTimes(s);
	const N = nose(s);
	const P = trailPts(N);
	const DRAW = Math.min(2.6, Math.max(1.2, LB - LP - 0.3)); // the trail finishes curling as the second line lands
	const go = inOut(seg(t, LG, LGL));
	const tipU = seg(t, LP + 0.15, DRAW);
	const tip = track(P, tipU);
	const follow = inOut(seg(t, LP + 0.5, 1.8)) * (1 - go); // the kitten leans after the scent
	const tail = track(P, 0.9);
	const dl = Math.max(1, Math.hypot(N[0] - tail[0], N[1] - tail[1]));
	const dx = ((N[0] - tail[0]) / dl) * 30 * follow;
	const dy = ((N[1] - tail[1]) / dl) * 30 * follow;
	const zoom = Math.min(1.06, 1 + Math.max(0, t - LP) * 0.008);

	const nWords = (l: string) => l.split(' ').filter(Boolean).length;
	const maxW = Math.max(nWords(l0), l1 ? nWords(l1) : 0, 1);
	const size = maxW <= 4 ? 92 : maxW <= 6 ? 82 : 68;
	const w0 = lineWords(l0, LA, PINK);
	const w1 = l1 ? lineWords(l1, LB, CYAN) : [];
	const pillW = (l: string) => Math.min(1640, l.length * size * 0.48 + 170);
	const y0 = l1 ? H - 262 : H - 200;
	const y1 = H - 128;
	const pill = (at: number, w: number, y: number) => {
		const k = sp(t - at - 0.05, 12, 5.4);
		if (k <= 0) return null;
		return <div style={{position: 'absolute', left: W / 2 - w / 2, top: y - size * 0.95, width: w, height: size * 1.9, borderRadius: size, background: '#fff', boxShadow: '0 18px 60px rgba(0,0,0,0.35)', transform: `scale(${k})`, opacity: (1 - go) * Math.min(1, k * 1.4)}} />;
	};

	const dots = [];
	for (let i = 0; i < ND; i++) {
		const u = i / (ND - 1);
		const at = LP + 0.15 + u * DRAW;
		const k = sp(t - at, 14, 6);
		if (k <= 0) continue;
		const [x, y] = track(P, u);
		const r = lerp(8.5, 4.5, u);
		const last = i === ND - 1;
		dots.push(
			<div
				key={i}
				style={{
					position: 'absolute',
					left: x - r + Math.sin(t * 2 + i) * 3,
					top: y - r + Math.cos(t * 2.4 + i * 1.7) * 3,
					width: r * 2,
					height: r * 2,
					borderRadius: r,
					background: last ? CYAN : PINK,
					boxShadow: `0 0 0 3px rgba(255,255,255,0.9), 0 4px 14px rgba(0,0,0,0.3)`,
					transform: `scale(${last ? k * (1 + Math.sin(t * 5) * 0.12) : k})`,
					opacity: 1 - go,
				}}
			/>,
		);
	}

	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			<div style={{position: 'absolute', inset: 0, transformOrigin: `${N[0]}px ${N[1]}px`, transform: `scale(${zoom})`}}>
				{t < LP ? <Clip src={s.video} at={0} len={LP} from={Math.max(0, s.freezeAt - LP)} muted /> : <Pic src={s.still} />}
			</div>
			{s.cutout && t >= LP + 0.2 && go < 1 && (
				<div style={{position: 'absolute', inset: 0, transform: `translate(${dx}px, ${dy}px) rotate(${1.6 * follow}deg)`, opacity: 1 - seg(t, LG + LGL * 0.4, LGL * 0.6)}}>
					<Pic src={s.cutout} />
				</div>
			)}
			{t >= LP && tipU < 1 && (
				<div style={{position: 'absolute', left: tip[0] - 26, top: tip[1] - 26, width: 52, height: 52, borderRadius: 26, background: 'rgba(6,182,212,0.35)', filter: 'blur(6px)', opacity: (1 - go) * (0.6 + Math.sin(t * 5) * 0.2)}} />
			)}
			{dots}
			{t >= LA && go < 1 && (
				<>
					{pill(LA, pillW(l0), y0)}
					<Words t={t} x={W / 2} y={y0} size={size} words={w0} />
				</>
			)}
			{w1.length > 0 && t >= LB && go < 1 && (
				<>
					{pill(LB, pillW(l1 ?? ''), y1)}
					<Words t={t} x={W / 2} y={y1} size={size} words={w1} />
				</>
			)}
			{t >= LG && go < 1 && (
				<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
					{[0, 1].map((i) => {
						const u = (t - LG - i * 0.09) / 0.6;
						if (u <= 0 || u >= 1) return null;
						return <circle key={i} cx={N[0]} cy={N[1]} r={out3(u) * 700 + 40} fill="none" stroke={i ? CYAN : PINK} strokeWidth={(1 - u) * 22 + 2} opacity={(1 - u) * 0.9} />;
					})}
				</svg>
			)}
			{t >= LG &&
				(go >= 1 ? (
					<Clip src={s.ad} from={s.adFrom ?? 0} at={LG} len={end - LG + 0.1} volume={(f: number) => interpolate(f, [0, 14], [0.3, 1], {extrapolateRight: 'clamp'})} />
				) : (
					<div style={{position: 'absolute', inset: 0, clipPath: `circle(${Math.max(0.1, lerp(0, 2600, go))}px at ${N[0]}px ${N[1]}px)`}}>
						<Clip src={s.ad} from={s.adFrom ?? 0} at={LG} len={end - LG + 0.1} volume={(f: number) => interpolate(f, [0, 14], [0.3, 1], {extrapolateRight: 'clamp'})} />
					</div>
				))}
			<Click at={LP} v={0.45} />
			<Click at={LA} v={0.4} />
			{w1.length > 0 && <Click at={LB} v={0.4} />}
			<Click at={LG} v={0.55} />
			<Click at={LG + LGL - 0.1} v={0.5} />
		</AbsoluteFill>
	);
};

export const seconds = (s: Spec) => scentTimes(s).end;
