// Dev entry for the Camera move alone.
//   npx remotion render src/product/dev/camera.tsx Camera out.mp4 --props=spec.json --public-dir=<folder with the spec's files>

import React from 'react';
import {Composition, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import {FPS, H, Spec, W} from '../kit';
import {Camera, cameraSeconds} from '../moves/Camera';

const SAMPLE: Spec = {move: 'camera', video: 'video.mp4', still: 'still.jpg', ad: 'ad.mp4', adFirst: 'ad_first.jpg', freezeAt: 3, lines: ["Oh, he's so cute.", "Here's what you could give him."]};

const Comp: React.FC<Spec> = (s) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return <Camera t={frame / fps} s={s} />;
};

const Root: React.FC = () => (
	<Composition
		id="Camera"
		component={Comp as unknown as React.FC<Record<string, unknown>>}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={Math.ceil(cameraSeconds(SAMPLE) * FPS)}
		defaultProps={SAMPLE as unknown as Record<string, unknown>}
		calculateMetadata={({props}: {props: Record<string, unknown>}) => ({durationInFrames: Math.ceil(cameraSeconds(props as unknown as Spec) * FPS)})}
	/>
);

registerRoot(Root);
