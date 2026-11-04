// Crunch (level 2, needs a subject): the frozen frame crunches like a dry treat,
// cracks spreading out from the staring kitten, then crumbs fall away to reveal the ad.

import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {ACCENTS, Click, Clip, H, MoveProps, Pic, Spec, W, Words, inOut, lineLen, lineWords, out3, seg, sp} from '../../kit';

const LP = 1.0; // the video plays this long before it freezes
const LA = LP + 0.34; // the first line starts
const PINK = ACCENTS[0];
const VIOLET = ACCENTS[1];
const NS = 12; // shards the frozen frame breaks into
const R = 1750; // far enough to cover every corner from anywhere on screen

export const crunchTimes = (s: Spec) => {
	const l0 = s.lines[0] ?? '';
	const l1 = s.lines[1];
	const LB = LA + lineLen(l0) + 0.16;
	const raw = LB + (l1 ? lineLen(l1) : 0.8) + 1.3;
	const LG = Math.min(Math.max(raw, LP + 4), LP + 8); // the bridge itself lasts 4 to 8 s
	const LC = LA + 0.3; // the crunch lands
	const LF = LG - 1.9; // the crumbs start falling
	return {l0, l1, LB, LC, LF, LG, end: LG + 0.4 + (s.adSeconds ?? 4)};
};

/** Deterministic pseudo-random in [-0.5, 0.5). */
const h = (i: number, k: number) => {
	const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5;
	return x - Math.floor(x) - 0.5;
};

export const Move: React.FC<MoveProps> = ({t, s}) => {
	const {l0, l1, LB, LC, LF, LG, end} = crunchTimes(s);
	const cx = Math.min(Math.max((s.center ?? s.face ?? [W / 2, H * 0.42])[0], 200), W - 200);
	const cy = Math.min(Math.max((s.center ?? s.face ?? [W / 2, H * 0.42])[1], 200), H - 200);
	const pt = (a: number, r: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
	const pct = (p: [number, number]) => `${((p[0] / W) * 100).toFixed(2)}% ${((p[1] / H) * 100).toFixed(2)}%`;

	const crunch = sp(t - LC, 10, 5); // the frame winces, then holds
	const squash = 1 - 0.016 * crunch;

	// One wedge per shard: exact shared edges tile the frame with no gaps.
	const shards = [];
	for (let i = 0; i < NS; i++) {
		const a0 = (i / NS) * Math.PI * 2;
		const a1 = ((i + 1) / NS) * Math.PI * 2;
		const am = (a0 + a1) / 2;
		const d = ((i * 0.37) % 1) * 0.7;
		const p = out3(seg(t, LF + d, 1.0));
		if (seg(t, LF + d, 0.01) <= 0) {
			shards.push({i, clip: `polygon(${pct([cx, cy])}, ${pct(pt(a0, R))}, ${pct(pt(am, R))}, ${pct(pt(a1, R))})`, dx: 0, dy: 0, rot: 0, op: 1});
			continue;
		}
		shards.push({
			i,
			clip: `polygon(${pct([cx, cy])}, ${pct(pt(a0, R))}, ${pct(pt(am, R))}, ${pct(pt(a1, R))})`,
			dx: Math.cos(am) * p * 180,
			dy: p * p * 560 + p * 40,
			rot: (i % 2 ? 1 : -1) * p * 16,
			op: 1 - seg(t, LF + d + 0.6, 0.4),
		});
	}

	// Small crumbs near the middle pop off first.
	const crumbs = [];
	for (let j = 0; j < 6; j++) {
		const a = (j / 6) * Math.PI * 2 + 0.4;
		const r0 = 60 + (j % 3) * 70;
		const c = pt(a, r0);
		const d = 0.1 + j * 0.07;
		const p = out3(seg(t, LF + d, 0.9));
		if (p <= 0) continue;
		const q = (k: number) => pct(pt(a + (k - 1) * 0.09, r0 + (k === 1 ? 46 : 0)));
		crumbs.push(
			<div key={j} style={{position: 'absolute', inset: 0, clipPath: `polygon(${q(0)}, ${q(1)}, ${q(2)})`, transform: `translate(${c[0] * 0 + Math.cos(a) * p * 120}px, ${p * p * 480}px) rotate(${(j % 2 ? 1 : -1) * p * 30}deg)`, opacity: 1 - seg(t, LF + d + 0.5, 0.35)}}>
				<Pic src={s.still} />
			</div>,
		);
	}

	// Jagged crack rays along the wedge boundaries, drawn outward from the crunch.
	const rays = [];
	for (let j = 0; j < NS; j++) {
		const b = (j / NS) * Math.PI * 2;
		const u = out3(seg(t, LC + 0.1 + j * 0.045, 1.25));
		if (u <= 0) continue;
		let dAttr = '';
		for (let r = 40; r <= R; r += 130) {
			const off = h(j, r) * (14 + r * 0.035);
			const px = cx + Math.cos(b) * r - Math.sin(b) * off;
			const py = cy + Math.sin(b) * r + Math.cos(b) * off;
			dAttr += `${r === 40 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)} `;
		}
		const accent = j === 2 || j === 8;
		rays.push(
			<g key={j}>
				<path d={dAttr} fill="none" stroke="rgba(16,17,20,0.55)" strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - u} />
				<path d={dAttr} fill="none" stroke={accent ? (j === 2 ? PINK : VIOLET) : 'rgba(255,255,255,0.9)'} strokeWidth={accent ? 3 : 2} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - u} opacity={0.85} />
			</g>,
		);
	}
	const impact = seg(t, LC, 0.55);

	// The kitten holds its stare: crisp above the cracks, leaning in, then gives way with the last crumbs.
	const stare = 1 + 0.045 * inOut(seg(t, LC, 1.8));
	const give = seg(t, LF + 0.9, 0.8);

	const nWords = (l: string) => l.split(' ').filter(Boolean).length;
	const maxW = Math.max(nWords(l0), l1 ? nWords(l1) : 0, 1);
	const size = maxW <= 4 ? 92 : maxW <= 6 ? 82 : 68;
	const w0 = lineWords(l0, LA, PINK);
	const w1 = l1 ? lineWords(l1, LB, VIOLET) : [];
	const pillW = (l: string) => Math.min(1640, l.length * size * 0.48 + 170);
	const y0 = l1 ? H - 262 : H - 200;
	const y1 = H - 128;
	const textOp = 1 - seg(t, LG - 0.5, 0.5);
	const pill = (at: number, w: number, y: number) => {
		const k = sp(t - at - 0.05, 12, 5.4);
		if (k <= 0) return null;
		return <div style={{position: 'absolute', left: W / 2 - w / 2, top: y - size * 0.95, width: w, height: size * 1.9, borderRadius: size, background: '#fff', boxShadow: '0 18px 60px rgba(0,0,0,0.35)', transform: `scale(${k})`, opacity: textOp * Math.min(1, k * 1.4)}} />;
	};

	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			{t < LG ? <Pic src={s.adFirst} /> : <Clip src={s.ad} from={s.adFrom ?? 0} at={LG} len={end - LG + 0.1} volume={(f: number) => interpolate(f, [0, 14], [0.3, 1], {extrapolateRight: 'clamp'})} />}
			{t < LG && (
				<div style={{position: 'absolute', inset: 0, transformOrigin: `${cx}px ${cy}px`, transform: `scale(${squash})`}}>
					{t < LP ? <Clip src={s.video} at={0} len={LP} from={Math.max(0, s.freezeAt - LP)} muted /> : shards.map((sh) => (
						<div key={sh.i} style={{position: 'absolute', inset: 0, clipPath: sh.clip, transform: `translate(${sh.dx}px, ${sh.dy}px) rotate(${sh.rot}deg)`, opacity: sh.op}}>
							<Pic src={s.still} />
						</div>
					))}
				</div>
			)}
			{t >= LP && t < LG && (
				<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
					{rays}
					{impact > 0 && impact < 1 && <circle cx={cx} cy={cy} r={out3(impact) * 110 + 12} fill="none" stroke="#fff" strokeWidth={(1 - impact) * 10 + 1} opacity={(1 - impact) * 0.8} />}
				</svg>
			)}
			{crumbs}
			{s.cutout && t >= LP + 0.2 && give < 1 && (
				<div style={{position: 'absolute', inset: 0, transformOrigin: `${cx}px ${cy}px`, transform: `scale(${stare}) translateY(${give * 120}px)`, opacity: 1 - give}}>
					<Pic src={s.cutout} />
				</div>
			)}
			{t >= LA && textOp > 0 && (
				<>
					{pill(LA, pillW(l0), y0)}
					<div style={{opacity: textOp}}>
						<Words t={t} x={W / 2} y={y0} size={size} words={w0} />
					</div>
				</>
			)}
			{w1.length > 0 && t >= LB && textOp > 0 && (
				<>
					{pill(LB, pillW(l1 ?? ''), y1)}
					<div style={{opacity: textOp}}>
						<Words t={t} x={W / 2} y={y1} size={size} words={w1} />
					</div>
				</>
			)}
			<Click at={LP} v={0.45} />
			<Click at={LA} v={0.4} />
			{w1.length > 0 && <Click at={LB} v={0.4} />}
			<Click at={LC + 0.15} v={0.55} />
			<Click at={LF + 0.2} v={0.5} />
			<Click at={LG} v={0.5} />
		</AbsoluteFill>
	);
};

export const seconds = (s: Spec) => crunchTimes(s).end;
