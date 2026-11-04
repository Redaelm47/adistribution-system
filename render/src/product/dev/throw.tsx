// Dev entry for the Throw move alone.
//   npx remotion render src/product/dev/throw.tsx Throw out.mp4 --props=spec.json --public-dir=<folder with the spec's files>

import React from 'react';
import {Composition, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import {FPS, H, Spec, W} from '../kit';
import {Throw, throwSeconds} from '../moves/Throw';

const SAMPLE: Spec = {move: 'throw', video: 'video.mp4', still: 'still.jpg', ad: 'ad.mp4', adFirst: 'ad_first.jpg', freezeAt: 3, lines: ["He's looking for..."]};

const Comp: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return <Throw t={frame / fps} s={s} />;
};

const Root: React.FC = () => (
	<Composition
		id="Throw"
		component={Comp as unknown as React.FC<Record<string, unknown>>}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={Math.ceil(throwSeconds(SAMPLE) * FPS)}
		defaultProps={SAMPLE as unknown as Record<string, unknown>}
		calculateMetadata={({props}: {props: Record<string, unknown>}) => ({durationInFrames: Math.ceil(throwSeconds(props as unknown as Spec) * FPS)})}
	/>
);

registerRoot(Root);
