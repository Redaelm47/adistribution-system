// Camera (level 1, any picture): the screen of a 2005 compact takes over the video, the focus hunts and locks on the face (or the subject, or the middle),
// the iris of the lens snaps, hearts pop, then we pull back and it's a camera. A mouse clicks its arrow, the roll spins and stops on the next photo: the ad.
// We go through the screen. Ported from the launch film's digicam bridge (film7/cat.tsx), the motion unchanged; the camera is drawn in CSS, as in the film.

import {loadFont as loadSans} from '@remotion/google-fonts/Geist';
import {loadFont as loadVT} from '@remotion/google-fonts/VT323';
import React from 'react';
import {AbsoluteFill, Freeze, Img, OffthreadVideo, random, staticFile} from 'remotion';
import {Click, Clip, FPS, H, INK, MoveProps, READ, SANS, SERIF, Spec, W, Words, clamp, fr, inOut, lerp, lineLen, lineWords, measure, out3, seg, sp, voiced} from '../kit';

const VT = loadVT('normal', {weights: ['400'], subsets: ['latin']}).fontFamily;
loadSans('normal', {weights: ['600'], subsets: ['latin']}); // the camera's buttons, as in the film

const PAL = {red: '#ff2a3c', yellow: '#ffd000', pink: '#ff3ea5', cyan: '#00c2e0'};
const AD_YELLOW = '#ffcc00';

// ---------------------------------------------------------------- timing (the film's, with the voice replaced by reading pace)

const PLAY = 2.2; // the video plays this long under the viewfinder before the shutter
const SAY = 0.2;
const EACH = 0.03; // the first line lands letter by letter
const TO_PRESS = 0.72;
const ROLL = 0.9;
const WORDS = 0.38;
const DIVE = 0.52;

/** The little pause after "Oh," in the film: after a first comma, if there is one. */
const pause = (text: string) => {
	const i = text.indexOf(',');
	return i > 0 && i < text.length - 2 ? {gapAt: i + 1, gap: 0.31} : {gapAt: 9999, gap: 0};
};
const count = (text: string) => text.split(' ').filter(Boolean).length;

export const cameraTimes = (s: Spec) => {
	const l0 = (s.lines[0] ?? '').trim();
	const l1 = (s.lines[1] ?? '').trim();
	const click = PLAY;
	// Nothing is written on the photo (Reda, Nov 5: text never on the subject): the shutter, the hearts, then we pull back
	// and the first line is the camera's caption, under it, like the second.
	const hearts = click + 0.55;
	const pull = hearts + 0.8;
	const cap = pull + 0.3;
	const press = Math.max(pull + TO_PRESS, cap + lineLen(l0) + 0.1);
	const land = press + ROLL;
	const n1 = count(l1);
	const say1 = Math.max((n1 - 1) * READ, voiced(l1) - 0.2); // a recorded second line sets its own length
	const bt = Math.max(pull + 0.3, land - say1 + 0.03); // the second line ends as the roll lands on the ad
	const dive = n1 ? Math.max(land + WORDS, bt + say1 + 0.5) : land + WORDS;
	const ad = dive + DIVE;
	return {l0, l1, click, hearts, pull, cap, press, land, bt, dive, ad, end: ad + (s.adSeconds ?? 4)};
};

export const cameraSeconds = (s: Spec) => cameraTimes(s).end;
/** When each line starts, for the voice. */
export const cameraLineAt = (s: Spec) => {
	const c = cameraTimes(s);
	return [c.cap, c.bt];
};

// ---------------------------------------------------------------- what the focus aims at: the face, else the subject, else the middle

const target = (s: Spec): [number, number] => {
	const p = s.face ?? s.center ?? [W / 2, H / 2];
	return [Math.max(200, Math.min(W - 200, p[0])), Math.max(180, Math.min(H - 180, p[1]))];
};

// ---------------------------------------------------------------- the camera: its screen in world coordinates, and how to frame the world so that the screen fills the picture

const SC = {x: 262, y: 186, w: 1100, h: 619};
const SCX = SC.x + SC.w / 2;
const SCY = SC.y + SC.h / 2;
const ZFULL = W / SC.w;
const PAD = {x: 1590, y: 470};

/** The roll: the photo just taken, eight older frames of the same video, then the ad. */
type Shot = {src: string; at?: number};
const ORDER = [6, 2, 8, 4, 1, 7, 3, 5];
const rollOf = (s: Spec): Shot[] => [{src: s.still}, ...ORDER.map((k) => ({src: s.video, at: (s.freezeAt * k) / 9})), {src: s.adFirst}];
const LAST = ORDER.length + 1;

const rollPos = (u: number) => {
	if (u <= 0) return 0;
	const k = clamp(u / ROLL);
	const settle = u > ROLL * 0.72 ? Math.exp(-(u - ROLL * 0.72) * 6) * Math.sin((u - ROLL * 0.72) * 15) * 0.05 : 0;
	return LAST * (1 - Math.pow(1 - k, 3.4)) + settle;
};

const Photo: React.FC<{shot: Shot; style?: React.CSSProperties}> = ({shot, style}) => {
	const css: React.CSSProperties = {position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style};
	if (shot.at === undefined) return <Img src={staticFile(shot.src)} style={css} />;
	return (
		<Freeze frame={fr(shot.at)}>
			<OffthreadVideo src={staticFile(shot.src)} muted style={css} />
		</Freeze>
	);
};

// ---------------------------------------------------------------- primitives copied from the film (film7/fx, film7/moves, film2/kit)

const BlurX: React.FC = () => (
	<svg width={0} height={0} style={{position: 'absolute'}}>
		<defs>
			{Array.from({length: 40}, (_, i) => (i + 1) * 2).map((n) => (
				<filter key={n} id={`cam-bx${n}`} x="-60%" width="220%" y="-20%" height="140%">
					<feGaussianBlur stdDeviation={`${n} 0`} />
				</filter>
			))}
		</defs>
	</svg>
);
const bx = (v: number) => (v < 1 ? 'none' : `url(#cam-bx${Math.min(80, Math.max(2, Math.round(v / 2) * 2))})`);

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
const Pointer: React.FC<{x: number; y: number; press?: number; scale?: number}> = ({x, y, press = 0, scale = 1.7}) => (
	<svg width={44} height={52} viewBox="0 0 22 26" style={{position: 'absolute', left: x - 3, top: y - 3, transformOrigin: '4px 4px', transform: `scale(${scale * (1 - press * 0.14)})`, overflow: 'visible', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.32))', zIndex: 50}}>
		<path d="M2 1.5 L2 20 L7 15.8 L10.2 23.4 L13.6 22 L10.4 14.6 L17 14.4 Z" fill={INK} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
	</svg>
);

/** A line whose letters land one by one, each with its own little overshoot. */
const Letters: React.FC<{t: number; text: string; at: number; x: number; y: number; size: number; colorAt: (i: number) => string; each: number; gapAt: number; gap: number}> = ({t, text, at, x, y, size, colorAt, each, gapAt, gap}) => {
	const font = `italic 400 ${size}px ${SERIF}`;
	const whole = measure(text, font);
	return (
		<>
			{text.split('').map((ch, i) => {
				const u = t - at - i * each - (i >= gapAt ? gap : 0);
				if (u <= 0 || ch === ' ') return null;
				const k = sp(u, 17, 7);
				const left = x - whole / 2 + measure(text.slice(0, i), font);
				return (
					<div key={i} style={{position: 'absolute', left, top: y, lineHeight: 1, whiteSpace: 'pre', transformOrigin: '50% 70%', transform: `translateY(calc(-50% + ${(1 - k) * size * 0.62}px)) scale(${lerp(0.35, 1, k)}) rotate(${(1 - k) * (i % 2 ? 16 : -16)}deg)`, opacity: Math.min(1, u * 16), fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: size, color: colorAt(i), textShadow: '0 4px 34px rgba(0,0,0,0.55)'}}>
						{ch}
					</div>
				);
			})}
		</>
	);
};

const Ripple: React.FC<{t: number; at: number; x: number; y: number; r: number; dur: number; gap: number; colors: string[]}> = ({t, at, x, y, r, dur, gap, colors}) => (
	<svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
		{colors.map((c, i) => {
			const u = (t - at - i * gap) / dur;
			if (u <= 0 || u >= 1) return null;
			return <circle key={i} cx={x} cy={y} r={out3(u) * r} fill="none" stroke={c} strokeWidth={(1 - u) * 34} />;
		})}
	</svg>
);

/** Little hearts that pop up and float away. */
const Hearts: React.FC<{t: number; at: number; x: number; y: number; n?: number}> = ({t, at, x, y, n = 9}) => (
	<>
		{Array.from({length: n}, (_, i) => {
			const u = t - at - i * 0.075;
			if (u <= 0 || u > 1.5) return null;
			const k = sp(u, 13, 5);
			const px = x + (random(`hx${i}`) - 0.5) * 760;
			const py = y - 40 - random(`hy${i}`) * 340 - u * 150;
			const sc = k * (0.7 + random(`hs${i}`) * 1.1);
			return (
				<svg key={i} width={70} height={64} viewBox="0 0 24 22" style={{position: 'absolute', left: px, top: py, overflow: 'visible', opacity: 1 - clamp((u - 1) / 0.5), transform: `scale(${sc}) rotate(${Math.sin(u * 5 + i) * 12}deg)`, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))'}}>
					<path d="M12 21 C5 15 1 11 1 6.500 C1 3 3.700 1 6.500 1 C8.600 1 10.800 2.200 12 4.500 C13.200 2.200 15.400 1 17.500 1 C20.300 1 23 3 23 6.500 C23 11 19 15 12 21 Z" fill={[PAL.pink, PAL.red, '#ffffff'][i % 3]} />
				</svg>
			);
		})}
	</>
);

/** The iris of a lens: seven blades, 0 is wide open, 1 is shut. */
const Aperture: React.FC<{k: number}> = ({k}) => {
	if (k <= 0) return null;
	const r = lerp(1300, 0, k);
	return (
		<svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
			<g transform={`translate(${W / 2} ${H / 2})`}>
				{Array.from({length: 7}, (_, i) => (
					<g key={i} transform={`rotate(${(i * 360) / 7 + k * 70})`}>
						<rect x={-3000} y={r} width={6000} height={3000} fill={i % 2 ? '#0b0b0e' : '#17171b'} stroke="#34343c" strokeWidth={3} />
					</g>
				))}
			</g>
		</svg>
	);
};

// ---------------------------------------------------------------- what a 2005 compact shows you

const Viewfinder: React.FC<{u: number; tx: number; ty: number}> = ({u, tx, ty}) => {
	const ui = (at: number) => out3(seg(u, at, 0.22));
	const k = sp(u - 0.32, 11, 6);
	const m = lerp(-150, 44, k);
	const L = 120;
	const corner = (x: number, y: number, r: number) => <path key={r} d={`M0 ${L} L0 0 L${L} 0`} transform={`translate(${x} ${y}) rotate(${r})`} stroke="#fff" strokeWidth={6} fill="none" />;
	const grid = out3(seg(u, 0.5, 0.4));
	const lockAt = PLAY - 0.42;
	// the box hunts its way onto the target (in the film it tracked the kitten's face)
	const off = 1 - inOut(seg(u, 0.55, lockAt - 0.6));
	const f = {x: tx + (tx >= W / 2 ? -1 : 1) * 210 * off + Math.sin(u * 5.3) * 36 * off, y: ty + (ty < H / 2 ? 1 : -1) * 110 * off + Math.cos(u * 4.1) * 28 * off};
	const lock = sp(u - lockAt, 18, 8);
	const hunt = u < lockAt ? Math.sin(u * 9) * 26 : 0;
	const size = lerp(lerp(620, 430, out3(seg(u, 0.6, 1.6))), 330, seg(u, lockAt, 0.1)) * (u >= lockAt ? lerp(1.35, 1, lock) : 1) + hunt;
	const afOn = u > 0.55;
	const col = u >= lockAt ? PAL.yellow : '#ffffff';
	const c = size * 0.2;
	return (
		<>
			<svg width={W} height={H} style={{position: 'absolute', inset: 0, filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.4))'}}>
				{corner(m, m, 0)}
				{corner(W - m, m, 90)}
				{corner(W - m, H - m, 180)}
				{corner(m, H - m, 270)}
				<g stroke="rgba(255,255,255,0.45)" strokeWidth={2}>
					<line x1={W / 3} y1={0} x2={W / 3} y2={H * grid} />
					<line x1={(W * 2) / 3} y1={H} x2={(W * 2) / 3} y2={H * (1 - grid)} />
					<line x1={0} y1={H / 3} x2={W * grid} y2={H / 3} />
					<line x1={W} y1={(H * 2) / 3} x2={W * (1 - grid)} y2={(H * 2) / 3} />
				</g>
				{afOn && (
					<g transform={`translate(${f.x} ${f.y})`} stroke={col} strokeWidth={7} fill="none">
						<path d={`M${-size / 2} ${-size / 2 + c} V${-size / 2} H${-size / 2 + c}`} />
						<path d={`M${size / 2 - c} ${-size / 2} H${size / 2} V${-size / 2 + c}`} />
						<path d={`M${size / 2} ${size / 2 - c} V${size / 2} H${size / 2 - c}`} />
						<path d={`M${-size / 2 + c} ${size / 2} H${-size / 2} V${size / 2 - c}`} />
					</g>
				)}
			</svg>
			<div style={{position: 'absolute', left: 92, top: 84, display: 'flex', alignItems: 'center', gap: 14, fontFamily: VT, fontSize: 56, color: '#fff', opacity: ui(0.42), textShadow: '0 2px 6px rgba(0,0,0,0.6)'}}>
				<div style={{width: 26, height: 26, borderRadius: 13, background: PAL.red, opacity: Math.floor(u * 3) % 2 ? 1 : 0.25}} />
				AUTO
			</div>
			<div style={{position: 'absolute', right: 92, top: 84, display: 'flex', alignItems: 'center', gap: 16, fontFamily: VT, fontSize: 56, color: '#fff', opacity: ui(0.5), textShadow: '0 2px 6px rgba(0,0,0,0.6)'}}>
				52
				<div style={{width: 92, height: 42, borderRadius: 6, boxShadow: 'inset 0 0 0 4px #fff', padding: 7, display: 'flex', gap: 5}}>
					{[0, 1, 2].map((i) => <div key={i} style={{flex: 1, background: i < 2 ? PAL.cyan : 'rgba(255,255,255,0.2)', transform: `scaleY(${out3(seg(u, 0.6 + i * 0.08, 0.2))})`}} />)}
				</div>
			</div>
			<div style={{position: 'absolute', left: 92, bottom: 76, fontFamily: VT, fontSize: 52, letterSpacing: 2, color: u >= lockAt ? PAL.yellow : '#fff', opacity: ui(0.58), textShadow: '0 2px 6px rgba(0,0,0,0.6)'}}>F2.8 1/250 {u >= lockAt ? 'AF LOCK' : 'AF ...'}</div>
		</>
	);
};

// ---------------------------------------------------------------- the camera's body (CSS, as in the film)

const CameraBody: React.FC<{press: number; u: number}> = ({press, u}) => (
	<>
		<div style={{position: 'absolute', left: 92, top: 72, width: 1736, height: 820, borderRadius: 78, background: 'linear-gradient(162deg, #f6f6f8 0%, #dcdde2 48%, #b9bac2 100%)', boxShadow: '0 50px 110px rgba(0,0,0,0.28), inset 0 3px 3px rgba(255,255,255,0.9), inset 0 -8px 16px rgba(0,0,0,0.2)'}} />
		<div style={{position: 'absolute', left: SC.x - 26, top: SC.y - 26, width: SC.w + 52, height: SC.h + 52, borderRadius: 30, background: '#0c0c0f', boxShadow: 'inset 0 0 0 3px #2a2a30, 0 3px 2px rgba(255,255,255,0.6)'}} />
		<div style={{position: 'absolute', left: SC.x - 10, top: 104, fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: 7, color: '#6d6e76'}}>COMPACT 5.0 MP</div>
		<div style={{position: 'absolute', left: PAD.x - 96, top: 196, display: 'flex', gap: 14}}>
			{['MENU', 'DISP'].map((x) => <div key={x} style={{width: 90, height: 50, borderRadius: 25, background: '#3a3b42', color: '#fff', fontFamily: SANS, fontWeight: 600, fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 0 #1f2024'}}>{x}</div>)}
		</div>
		<div style={{position: 'absolute', left: PAD.x + 78, top: 110, width: 26, height: 26, borderRadius: 13, background: Math.floor(u * 3) % 2 ? PAL.red : '#6e1520', boxShadow: '0 0 0 3px rgba(0,0,0,0.2)'}} />
		{/* the arrows */}
		<div style={{position: 'absolute', left: PAD.x - 150, top: PAD.y - 150, width: 300, height: 300, borderRadius: 150, background: 'radial-gradient(circle at 40% 30%, #55565f, #26272c)', boxShadow: '0 8px 16px rgba(0,0,0,0.35), inset 0 2px 2px rgba(255,255,255,0.3)', transform: `rotate3d(0, 1, 0, ${press * 7}deg)`}}>
			<div style={{position: 'absolute', left: 92, top: 92, width: 116, height: 116, borderRadius: 58, background: 'radial-gradient(circle at 40% 30%, #dfe0e5, #a5a6ae)', color: '#2b2c31', fontFamily: SANS, fontWeight: 700, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>OK</div>
			{[0, 90, 180, 270].map((r) => (
				<div key={r} style={{position: 'absolute', left: 150, top: 150, width: 0, height: 0, transform: `rotate(${r}deg) translateY(-122px)`}}>
					<svg width={36} height={28} viewBox="0 0 36 28" style={{position: 'absolute', left: -18, top: -14}}>
						<path d="M18 4 L32 24 L4 24 Z" fill={r === 90 ? PAL.yellow : '#fff'} />
					</svg>
				</div>
			))}
		</div>
		<div style={{position: 'absolute', left: PAD.x - 96, top: 672, display: 'flex', gap: 14}}>
			{['▶', '⌫'].map((x) => <div key={x} style={{width: 90, height: 50, borderRadius: 25, background: '#3a3b42', color: '#fff', fontFamily: SANS, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 0 #1f2024'}}>{x}</div>)}
		</div>
	</>
);

// ---------------------------------------------------------------- the move

export const Camera: React.FC<MoveProps> = ({t, s}) => {
	const u = t;
	const {l0, l1, click, hearts, pull, cap, press, land, bt, dive, ad, end} = cameraTimes(s);
	const [tx, ty] = target(s);
	const roll = rollOf(s);
	const adFrom = s.adFrom ?? 0;
	const lead = Math.min(PLAY, s.freezeAt); // the video plays up to the moment (less if the moment is in its first seconds)
	const frozen = u >= click;
	const iris = u >= click - 0.07 && u < click + 0.19 ? 1 - Math.abs((u - click - 0.03) / 0.13) : 0;
	const flash = u >= click + 0.03 ? Math.exp(-(u - click - 0.03) * 12) * 0.9 : 0;
	const kick = frozen ? 1 + Math.exp(-(u - click) * 7) * Math.cos((u - click) * 26) * 0.035 : 1;
	const creep = 1 + Math.max(0, u - click) * 0.018;
	const bk = sp(u - pull, 9, 5.2);
	const go = inOut(seg(u, dive, DIVE));
	const z = lerp(lerp(ZFULL, 1, bk), ZFULL, go);
	const cx = lerp(lerp(SCX, 960, bk), SCX, go);
	const cy = lerp(lerp(SCY, 482, bk), SCY, go);
	const tilt = (1 - go) * clamp(bk) * Math.sin(u * 1.6) * 0.6;
	const pos = rollPos(u - press);
	const vel = Math.abs(pos - rollPos(u - press - 1 / FPS)) * FPS;
	const number = 52 + Math.min(LAST, Math.max(0, Math.round(pos)));
	const moving = u >= press && u < land - 0.1;
	const toPress = press - pull; // the mouse reaches the arrow as the first caption has been said
	const hand = pointer(u - pull, [{t: 0, x: 1250, y: 1230}, {t: toPress - 0.06, x: PAD.x + 118, y: PAD.y + 6, d: TO_PRESS - 0.16, arc: -0.12}, {t: toPress + 1.5, x: PAD.x + 240, y: PAD.y + 480, d: 0.6}]);
	const pr = pressAt(u, press);
	const stamp = '02 11 2026';
	const stampN = Math.ceil(seg(u, click + 0.1, 0.4) * stamp.length);
	// the first line, on the side away from the face, the last word in pink
	const {gapAt, gap} = pause(l0);
	const hot = l0.lastIndexOf(' ') + 1;
	const whole = measure(l0, `italic 400 132px ${SERIF}`);
	const size0 = whole > 1740 ? (132 * 1740) / whole : 132;
	const half = Math.min(whole, 1740) / 2;
	const right = tx < W / 2;
	const edge = right ? (s.box?.[2] ?? tx + 220) + 50 : (s.box?.[0] ?? tx - 220) - 50; // where the subject begins, seen from the line's side
	const x0 = whole > 1740 ? 960 : right ? Math.min(W - 90 - half, Math.max(1360, edge + half)) : Math.max(90 + half, Math.min(560, edge - half));
	const words = l1 ? lineWords(l1, bt, PAL.pink) : [];
	const words0 = l0 ? lineWords(l0, cap, PAL.pink) : [];
	const adSkip = (fr(adFrom) + fr(ad) - fr(dive)) / FPS; // the ad goes on where the screen left it
	const ticks: number[] = [];
	for (let f = 0, last = 0; f < ROLL * FPS; f++) {
		const p = Math.floor(rollPos(f / FPS));
		if (p > last) {
			ticks.push(press + f / FPS);
			last = p;
		}
	}
	return (
		<AbsoluteFill style={{background: '#ffffff', overflow: 'hidden'}}>
			<BlurX />
			{u < ad + 0.02 && (
				<AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${960 - cx * z}px, ${540 - cy * z}px) scale(${z}) rotate(${tilt}deg)`}}>
					<CameraBody press={pr} u={u} />
					{/* the screen */}
					<div style={{position: 'absolute', left: SC.x, top: SC.y, width: SC.w, height: SC.h, overflow: 'hidden', background: '#000', borderRadius: lerp(0, 8, clamp(bk) * (1 - go))}}>
						{!frozen && lead < PLAY && u < PLAY - lead && (
							<Freeze frame={0}>
								<OffthreadVideo src={staticFile(s.video)} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
							</Freeze>
						)}
						{!frozen && <Clip src={s.video} at={PLAY - lead} len={lead} from={s.freezeAt - lead} muted />}
						{frozen && u < dive && (
							<div style={{position: 'absolute', inset: 0, filter: vel > 1 && moving ? bx(Math.min(80, vel * 3)) : 'none'}}>
								{roll.map((shot, i) => {
									if (Math.abs(i - pos) > 1.2) return null;
									return <Photo key={i} shot={shot} style={{transform: `translateX(${(i - pos) * 100}%) ${i === 0 ? `scale(${kick * creep})` : ''}`, transformOrigin: `${(tx / W) * 100}% ${(ty / H) * 100}%`}} />;
								})}
							</div>
						)}
						{u >= dive && <Clip src={s.ad} from={adFrom} at={dive} len={ad - dive + 0.02} volume={(f: number) => clamp(f / 12)} />}
						{/* the stamp, and what the camera's own screen says once we see it's a camera */}
						{frozen && u < press && <div style={{position: 'absolute', right: 30, bottom: 22, fontFamily: VT, fontSize: 30, letterSpacing: 1.6, color: PAL.yellow, textShadow: '0 0 4px rgba(255,208,0,0.7)'}}>{stamp.slice(0, stampN)}</div>}
						{u >= pull && u < dive + 0.1 && (
							<div style={{position: 'absolute', inset: 0, opacity: out3(seg(u, pull + 0.2, 0.2)) * (1 - seg(u, dive, 0.12)), fontFamily: VT, fontSize: 38, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.7)'}}>
								<div style={{position: 'absolute', left: 22, top: 12}}>▶ PICT00{number}.JPG</div>
								<div style={{position: 'absolute', right: 22, top: 12, color: PAL.cyan}}>{number}/61</div>
								{/* the roll */}
								<div style={{position: 'absolute', left: 0, right: 0, bottom: 14, height: 84}}>
									{roll.map((shot, i) => {
										const x = SC.w / 2 + (i - pos) * 146 - 66;
										if (x < -150 || x > SC.w + 20) return null;
										const on = Math.abs(i - pos) < 0.5;
										return (
											<div key={i} style={{position: 'absolute', left: x, top: on ? 0 : 8, width: 132, height: on ? 84 : 68, borderRadius: 8, overflow: 'hidden', boxShadow: on ? `0 0 0 4px ${PAL.yellow}` : '0 0 0 2px rgba(255,255,255,0.6)', opacity: seg(u, press - 0.3, 0.3)}}>
												<Photo shot={shot} />
											</div>
										);
									})}
								</div>
							</div>
						)}
						{/* a sweep of light on the glass as it lands */}
						{u >= land - 0.04 && u < land + 0.6 && <div style={{position: 'absolute', top: -100, bottom: -100, width: 180, left: lerp(-300, SC.w + 200, out3(seg(u, land - 0.04, 0.6))), transform: 'skewX(-18deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)'}} />}
					</div>
					{u >= press - 0.01 && <Ripple t={u} at={press} x={PAD.x + 122} y={PAD.y} r={190} dur={0.42} gap={0.05} colors={[PAL.yellow, '#ffffff']} />}
					{u >= pull && u < dive + 0.1 && <Pointer x={hand.x} y={hand.y} press={pr} scale={2.3} />}
				</AbsoluteFill>
			)}
			{/* the viewfinder, on the whole picture until the shutter goes */}
			{!frozen && <Viewfinder u={u} tx={tx} ty={ty} />}
			{frozen && u < pull + 0.24 && (
				<AbsoluteFill style={{opacity: 1 - seg(u, pull - 0.02, 0.2)}}>
					<Hearts t={u} at={hearts} x={tx} y={Math.max(400, ty - 100)} />
				</AbsoluteFill>
			)}
			<Aperture k={iris} />
			{flash > 0.02 && <AbsoluteFill style={{background: '#fff', opacity: flash}} />}
			{words0.length > 0 && u >= cap - 0.06 && u < (words.length ? bt - 0.02 : dive + 0.08) && (
				<AbsoluteFill style={{opacity: words.length ? 1 - seg(u, bt - 0.14, 0.12) : 1 - seg(u, dive, 0.08)}}>
					<Words t={t} x={960} y={990} size={72} words={words0} />
				</AbsoluteFill>
			)}
			{words.length > 0 && u >= bt - 0.06 && u < dive + 0.08 && (
				<AbsoluteFill style={{opacity: 1 - seg(u, dive, 0.08)}}>
					<Words t={t} x={960} y={990} size={72} words={words} />
				</AbsoluteFill>
			)}
			{u >= ad && <Clip src={s.ad} at={ad} len={end - ad + 0.1} from={adSkip} />}
			{u >= dive && <div style={{position: 'absolute', left: 36, top: 30, padding: '5px 12px', borderRadius: 8, background: AD_YELLOW, fontFamily: SANS, fontWeight: 600, fontSize: 25, color: INK, opacity: seg(u, ad - 0.1, 0.2)}}>Ad</div>}
			{/* the film's ticks and shutters, all on the one cleared click */}
			<Click at={0.32} v={0.25} />
			<Click at={0.58} v={0.2} />
			<Click at={PLAY - 0.42} v={0.4} />
			<Click at={PLAY - 0.3} v={0.4} />
			<Click at={click} v={0.9} />
			<Click at={click + 0.07} v={0.5} />
			{l0 && <Click at={cap} v={0.25} />}
			<Click at={hearts} v={0.3} />
			<Click at={pull} v={0.35} />
			<Click at={press} v={0.7} />
			{ticks.map((at) => <Click key={at} at={at} v={0.22} />)}
			<Click at={land + 0.01} v={0.5} />
			{words.length > 0 && Math.abs(bt - press) > 0.15 && <Click at={bt} v={0.3} />}
			<Click at={dive + DIVE - 0.08} v={0.4} />
		</AbsoluteFill>
	);
};
