// Entry point for the bridges the product renders (separate from the launch film and the early drafts).
//   npx remotion render src/product/index.ts Bridge out.mp4 --props=spec.json --public-dir=<folder with the spec's files>

import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Bridge, FPS, H, W, bridgeSeconds} from './Bridge';
import type {Spec} from './Bridge';

const SAMPLE: Spec = {move: 'wall', video: 'video.mp4', still: 'still.jpg', ad: 'ad.mp4', adFirst: 'ad_first.jpg', freezeAt: 3, lines: ['This might not be an ad.', 'Oh wait. Actually, it is.']};

const Root: React.FC = () =>
	React.createElement(Composition, {
		id: 'Bridge',
		component: Bridge as unknown as React.FC<Record<string, unknown>>,
		width: W,
		height: H,
		fps: FPS,
		durationInFrames: Math.ceil(bridgeSeconds(SAMPLE) * FPS),
		defaultProps: SAMPLE as unknown as Record<string, unknown>,
		calculateMetadata: ({props}: {props: Record<string, unknown>}) => ({durationInFrames: Math.ceil(bridgeSeconds(props as unknown as Spec) * FPS)}),
	});

registerRoot(Root);
