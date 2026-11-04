// Dev entry for the Iris move alone:
//   npx remotion render src/product/dev/iris.tsx Iris out.mp4 --props=spec.json --public-dir=<folder with the spec's files>

import React from 'react';
import {Composition, registerRoot, useCurrentFrame} from 'remotion';
import {FPS, H, Spec, W} from '../kit';
import {Iris, irisSeconds} from '../moves/Iris';

const SAMPLE: Spec = {move: 'iris', video: 'video.mp4', still: 'still.jpg', ad: 'ad.mp4', adFirst: 'ad_first.jpg', freezeAt: 3, lines: ['Sorry...', 'did someone say parkour?'], face: [960, 400]};

const IrisComp: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	return <Iris t={frame / FPS} s={s} />;
};

const Root: React.FC = () => (
	<Composition
		id="Iris"
		component={IrisComp as unknown as React.FC<Record<string, unknown>>}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={Math.ceil(irisSeconds(SAMPLE) * FPS)}
		defaultProps={SAMPLE as unknown as Record<string, unknown>}
		calculateMetadata={({props}: {props: Record<string, unknown>}) => ({durationInFrames: Math.ceil(irisSeconds(props as unknown as Spec) * FPS)})}
	/>
);

registerRoot(Root);
