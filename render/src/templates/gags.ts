// Gag scripts for the Gag template, from docs/references-humour.md. Each line is a voice chunk
// (a draft voice clip, not in the repository) with the silence after it; a pill holds one or two lines.
// `you`: the sentence is left hanging and the ad's own first word ("You") finishes it.

import buffering from '../../public/voice/buffering/lines.json';
import cartoon from '../../public/voice/cartoon/lines.json';
import nature from '../../public/voice/nature/lines.json';
import scratch from '../../public/voice/scratch/lines.json';
import superman from '../../public/voice/superman/lines.json';
import {SPOT} from '../ad';

type Chunk = [key: string, gapAfter: number];
export type GagScript = {voice: {lines: {key: string; text: string; file: string; duration: number; words: {w: string; start: number; end: number}[]}[]}; pills: Chunk[][]; you: boolean; out: Chunk[]; source: string};

export const GAGS: Record<string, GagScript> = {
	// Rule of three on the Superman radio opening; the ad's "You" replaces the expected "Superman".
	superman: {voice: superman, pills: [[['bird', 0.25]], [['plane', 0.45]], [['noits', 0.3]]], you: true, out: [['okay', 0.25], ['backbird', 0.35]], source: 'Superman radio serial opening (1940s)'},
	// Cartoon physics: you only fall when you notice. Callback on the way out.
	cartoon: {voice: cartoon, pills: [[['fact', 0.15]], [['cartoons', 0.05], ['notice', 0.6]], [['tell', 0.6]]], you: false, out: [['okay', 0.3], ['noticed', 0.35]], source: "O'Donnell's laws of cartoon motion (Esquire, 1980)"},
	// Record scratch freeze frame meme; "Better question:" is answered by the ad's "You".
	scratch: {voice: scratch, pills: [[['yep', 0.35]], [['wondering', 0.05], ['howgot', 0.6]], [['better', 0.3]]], you: true, out: [['anyway', 0.3], ['thats', 0.35]], source: '"Yep, that\'s me. You\'re probably wondering how I got here" meme'},
	// Fourth wall: the video player's own vocabulary. Works with any ad.
	buffering: {voice: buffering, pills: [[['quick', 0.3]], [['fine', 0.35]], [['just', 0.15], ['buffer', 0.6]]], you: false, out: [['done', 0.35]], source: 'Fourth-wall joke on video players (docs/references-humour.md, G8)'},
	// Nature documentary narrator, calm voice; specific, then deflated. Works with any ad.
	nature: {voice: nature, pills: [[['leaps', 0.05], ['boss', 0.7]], [['wall', 0.6]]], you: false, out: [['resumes', 0.35]], source: 'Nature documentary narration parodies (docs/references-humour.md, #7 and G11)'},
};

// A spot (another video and ad, pipeline/tools/make_spot.py) can bring its own gag: Gag-spot.
type SpotScripts = {gag?: Omit<GagScript, 'voice'> & {voice: string}; thought?: {voice: string; bubbles: Chunk[][]; out: Chunk[]}};
const own = SPOT.scripts as SpotScripts;
const voices = SPOT.voices as Record<string, GagScript['voice']>;
if (own.gag) GAGS.spot = {...own.gag, voice: voices[own.gag.voice]};
export const SPOT_THOUGHT = own.thought ? {...own.thought, voice: voices[own.thought.voice]} : null;
