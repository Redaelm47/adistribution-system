// Wall (level 1, any picture): the frame falls back onto a white gallery wall and swings on its nail; the ad is the next picture along the wall.

import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {ACCENTS, Click, Clip, H, INK, MoveProps, Pic, Rings, Spec, W, Words, clamp, inOut, lerp, lineLen, lineWords, seg, sp, swing} from '../kit';

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

export const Wall: React.FC<MoveProps> = ({t, s}) => {
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

export const wallSeconds = (s: Spec) => wallTimes(s).end;
/** When each line starts, for the voice. */
export const wallLineAt = (s: Spec) => [LA, wallTimes(s).LB];

