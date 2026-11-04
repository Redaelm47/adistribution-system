// A template's voice lines (first-week draft voices, not in the repository): durations drive the timeline,
// word timings drive the captions.

import type {Word} from '../ui';

type Line = {key: string; text: string; file: string; duration: number; words: Word[]};

export const voiceSet = (json: {lines: Line[]}) => {
	const lines = Object.fromEntries(json.lines.map((l) => [l.key, l])) as Record<string, Line>;
	const words = (key: string, start: number): Word[] => {
		const line = lines[key];
		const shown = line.text.split(' ');
		return shown.map((w, i) => {
			const s = line.words.length === shown.length ? line.words[i] : null;
			return {w, start: start + (s ? s.start : (i / shown.length) * line.duration), end: start + (s ? s.end : ((i + 1) / shown.length) * line.duration)};
		});
	};
	return {
		line: (key: string) => lines[key],
		end: (key: string, start: number) => start + lines[key].duration,
		words,
		/** Cue list for <Audio>, and the words of each cue. */
		cues: (at: Record<string, number>) => Object.entries(at).map(([key, t]) => ({key, t, file: lines[key].file, words: words(key, t)})),
	};
};

const FPS = 50;
/** Cut points sit on whole output frames. */
export const snap = (x: number) => Math.round(x * FPS) / FPS;
