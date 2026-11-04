// The bridge the product renders: one composition, driven by the run's spec (video, moment, ad, lines, cut-out subject).
// The motion is the library's; only the inputs change from one video to the next. Each move is a file in ./moves.

import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {MoveId, MoveProps, Spec} from './kit';
import {Wall, wallSeconds} from './moves/Wall';

export {FPS, H, W} from './kit';
export type {Spec} from './kit';

type Move = {Component: React.FC<MoveProps>; seconds: (s: Spec) => number};

export const MOVES: Partial<Record<MoveId, Move>> = {
	wall: {Component: Wall, seconds: wallSeconds},
};

const pick = (s: Spec): Move => MOVES[s.move] ?? (MOVES.wall as Move);

export const bridgeSeconds = (s: Spec) => pick(s).seconds(s);

export const Bridge: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const {Component} = pick(s);
	return <Component t={frame / fps} s={s} />;
};
