// The bridge the product renders: one composition, driven by the run's spec (video, moment, ad, lines, cut-out subject).
// The motion is the library's; only the inputs change from one video to the next. Each move is a file in ./moves.

import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {MoveId, MoveProps, Spec, fr, lineLen} from './kit';
import {Behind, behindLineAt, behindSeconds} from './moves/Behind';
import {Camera, cameraLineAt, cameraSeconds} from './moves/Camera';
import {GEN} from './moves/gen';
import {Iris, irisLineAt, irisSeconds} from './moves/Iris';
import {Thought, thoughtLineAt, thoughtSeconds} from './moves/Thought';
import {Throw, throwLineAt, throwSeconds} from './moves/Throw';
import {Wall, wallLineAt, wallSeconds} from './moves/Wall';

export {FPS, H, W} from './kit';
export type {Spec} from './kit';

type Move = {Component: React.FC<MoveProps>; seconds: (s: Spec) => number; lineAt?: (s: Spec) => number[]};

export const MOVES: Partial<Record<MoveId, Move>> = {
	wall: {Component: Wall, seconds: wallSeconds, lineAt: wallLineAt},
	camera: {Component: Camera, seconds: cameraSeconds, lineAt: cameraLineAt},
	iris: {Component: Iris, seconds: irisSeconds, lineAt: irisLineAt},
	behind: {Component: Behind, seconds: behindSeconds, lineAt: behindLineAt},
	throw: {Component: Throw, seconds: throwSeconds, lineAt: throwLineAt},
	thought: {Component: Thought, seconds: thoughtSeconds, lineAt: thoughtLineAt},
	...GEN, // moves Muse Code wrote for earlier videos
};

const pick = (s: Spec): Move => MOVES[s.move] ?? (MOVES.wall as Move);

export const bridgeSeconds = (s: Spec) => pick(s).seconds(s);

/** Moves without their own timing (Muse Code's): line one shortly after the freeze, line two after it. */
const defaultLineAt = (s: Spec) => [1.3, 1.3 + lineLen(s.lines[0] ?? '') + 0.2];

export const Bridge: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const move = pick(s);
	const {Component} = move;
	const at = (move.lineAt ?? defaultLineAt)(s);
	return (
		<AbsoluteFill>
			<Component t={frame / fps} s={s} />
			{(s.voices ?? []).map((v, i) => (at[i] === undefined ? null : (
				<Sequence key={i} from={fr(at[i])} layout="none">
					<Audio src={staticFile(v.file)} volume={1} />
				</Sequence>
			)))}
		</AbsoluteFill>
	);
};
