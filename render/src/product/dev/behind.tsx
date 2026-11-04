// Dev entry for the Behind move alone:
//   npx remotion render src/product/dev/behind.tsx Behind out.mp4 --props=spec.json --public-dir=<folder with the spec's files>

import React from 'react';
import {Composition, registerRoot, useCurrentFrame} from 'remotion';
import {FPS, H, Spec, W} from '../kit';
import {Behind, behindSeconds} from '../moves/Behind';

const SAMPLE: Spec = {move: 'behind', video: 'video.mp4', still: 'still.jpg', ad: 'ad.mp4', adFirst: 'ad_first.jpg', freezeAt: 3, lines: ['Psst.', 'Behind you.'], cutout: 'cutout.png', box: [776, 293, 1221, 807], center: [996, 509], face: [1023, 345]};

const Dev: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	return <Behind t={frame / FPS} s={s} />;
};

const Root: React.FC = () => (
	<Composition
		id="Behind"
		component={Dev as unknown as React.FC<Record<string, unknown>>}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={Math.ceil(behindSeconds(SAMPLE) * FPS)}
		defaultProps={SAMPLE as unknown as Record<string, unknown>}
		calculateMetadata={({props}: {props: Record<string, unknown>}) => ({durationInFrames: Math.ceil(behindSeconds(props as unknown as Spec) * FPS)})}
	/>
);

registerRoot(Root);
