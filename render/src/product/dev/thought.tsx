// Dev entry for the Thought move alone:
//   npx remotion render src/product/dev/thought.tsx Thought out.mp4 --props=spec.json --public-dir=<folder with the spec's files>

import React from 'react';
import {Composition, registerRoot, useCurrentFrame} from 'remotion';
import {FPS, H, Spec, W} from '../kit';
import {Thought, thoughtSeconds} from '../moves/Thought';

const SAMPLE: Spec = {move: 'thought', video: 'video.mp4', still: 'still.jpg', ad: 'ad.mp4', adFirst: 'ad_first.jpg', freezeAt: 3, lines: ['What if I got a treat instead?']};

const View: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	return <Thought t={frame / FPS} s={s} />;
};

const Root: React.FC = () => (
	<Composition
		id="Thought"
		component={View as unknown as React.FC<Record<string, unknown>>}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={Math.ceil(thoughtSeconds(SAMPLE) * FPS)}
		defaultProps={SAMPLE as unknown as Record<string, unknown>}
		calculateMetadata={({props}: {props: Record<string, unknown>}) => ({durationInFrames: Math.ceil(thoughtSeconds(props as unknown as Spec) * FPS)})}
	/>
);

registerRoot(Root);
