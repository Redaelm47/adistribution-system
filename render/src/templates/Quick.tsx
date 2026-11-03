// Quick: a panel of short bridges, in and out, all from one engine (QUICKS: the list; verdicts in
// docs/verdicts.md). A bridge is three pieces the system can mix on any video: a line, a move, a way back.
// What makes Reda laugh is a voice talking about the ad itself, or plotting behind the person's back.
// `soft` bridges never snap: the video slows to a stop by itself, no shutter.

import {loadFont as loadBebas} from '@remotion/google-fonts/BebasNeue';
import {loadFont as loadMono} from '@remotion/google-fonts/FragmentMono';
import {loadFont as loadSerif} from '@remotion/google-fonts/InstrumentSerif';
import {loadFont as loadSyne} from '@remotion/google-fonts/Syne';
import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {AD, T as GAG, VIDEO} from '../ad';
import {PALETTE} from '../details';
import {H, PLAY_BTN, Player, SHOWN, SourceFrame, W, far} from '../kit';
import {clamp01, glide, lerp, step} from '../motion';
import {textWidth} from '../textWidth';
import {INK, WHITE, fontFamily, glass} from '../ui';
import lines from '../../public/voice/quick/lines.json';
import {snap, voiceSet} from './voice';

const {fontFamily: SERIF} = loadSerif('italic', {weights: ['400'], subsets: ['latin']});
const {fontFamily: MONO} = loadMono('normal', {weights: ['400'], subsets: ['latin']});
const {fontFamily: BEBAS} = loadBebas('normal', {weights: ['400'], subsets: ['latin']});
const {fontFamily: SYNE} = loadSyne('normal', {weights: ['700'], subsets: ['latin']});

const V = voiceSet(lines);
// What a spot brings beyond the parkour clip (in the product: Muse Spark and SAM 3.1).
const SPOTV = VIDEO as typeof VIDEO & {board?: {x: number; y: number; w: number}; textAt?: {x: number; y: number}; plate?: string; personClean?: string; talk?: boolean; target?: {x: number; y: number}};
const TALK = Boolean(SPOTV.talk); // someone is talking: keep the sound, and never talk over them
const VOICE_UP = 1.78; // +5 dB: the bridge's voice arrives at the level of the voice in the video, neither above it nor under it
const freeze = GAG.freeze;
const PAPER = AD.paper;

type Kind = 'board' | 'flood' | 'whip' | 'zoomout' | 'photo' | 'replay' | 'thought' | 'melt' | 'cut' | 'museum' | 'door' | 'swipe' | 'tilt' | 'flip' | 'fold' | 'split' | 'blink' | 'fall' | 'peel' | 'closer';
// A card is a few words on screen: from word `w` of the voice, or `s` seconds in when there is no voice.
// `reveal`: the words come one by one on the voice, in place.
type Card = {w?: number; s?: number; text: string; face?: number; typed?: boolean; frame?: boolean; ink?: boolean; reveal?: boolean; caption?: boolean; size?: number; nearFrame?: boolean};
export type Quick = {
	idea: string;
	kind: Kind;
	in?: string;
	out?: string;
	hold?: number;
	holdOut?: number;
	cards: Card[];
	back: Card[];
	soft?: boolean;
	from?: 'head' | 'button' | 'center' | 'prick'; // where a flood starts
	frameW?: number; // board: the word that swings the camera to the surface
	landW?: number; // board: the word that lights it
	snapW?: number; // photo: the word of the shutter
	museumW?: number; // museum: the word that turns the picture into a painting
	resumeW?: number; // the word of the way back on which the video plays again
	outDelay?: number;
	beat?: number; // silence between the last word and the move
	still?: boolean; // no jump of the camera on each card
	riser?: boolean; // a rising sound under the wait
	gentle?: boolean; // board: nothing snaps, the viewfinder lands, a real beat before it lights and before the dive
	landAfter?: number; // board: seconds between the end of the voice and the surface lighting up
	holdLit?: number; // board: seconds the lit surface stays before the dive
	diveD?: number;
	gallery?: boolean; // museum: the ad is the next picture on the wall, the camera walks to it and goes in
	knock?: boolean; // two knocks on the picture before the voice
	delay?: number; // seconds between the freeze and the voice
	steps?: {w: number; x: number}[]; // split: from word `w`, the divider goes to `x` (1: all him, 0: all the ad)
	pill?: boolean; // split: the handle of a split screen in the gap
};

const PRICK = {x: 1190, y: 568}; // his forearm

export const QUICKS: Record<string, Quick> = {
	// Third panel, on talking videos. Often the person says the move himself and the picture just obeys: no surprise, and no voice needed.
	flip: {
		idea: 'He says "But if you flip the phone around, you\'ll see" and the picture flips around: the ad is on its back. Back: "Okay, flip it back." and he goes on: "they\'ve also added...".',
		kind: 'flip',
		gentle: true,
		still: true,
		hold: 0.1,
		out: 'flip_out',
		outDelay: 0.2,
		cards: [],
		back: [{w: 0, text: 'Okay, flip it back.', face: 2, reveal: true, caption: true}],
	},
	open: {
		idea: 'He says "And then when you open up the phone," and the picture opens at its crease: the ad is inside. It closes, he goes on: "they\'re mostly still just small, unoptimized iPhone apps".',
		kind: 'fold',
		gentle: true,
		still: true,
		hold: 0.34,
		outDelay: 0.14,
		holdOut: 0.1,
		cards: [],
		back: [],
	},
	side: {
		idea: 'He says "The obvious one is two apps side by side." "Like this?" The ad comes in beside him, a real split screen. "Scoot over." It takes the screen. When it gives it back, his next words are "Why would you do that?"',
		kind: 'split',
		pill: true,
		gentle: true,
		still: true,
		in: 'likescoot_in',
		steps: [{w: 0, x: 0.5}],
		beat: 0.06,
		outDelay: 0.14,
		holdOut: 0.1,
		cards: [{w: 0, text: 'Like this?', face: 2, reveal: true, caption: true}, {w: 2, text: 'Scoot over.', face: 2, reveal: true, caption: true}],
		back: [],
	},
	up: {
		idea: 'He says "So with this button up here," "Up here?" The camera looks up, the ad is above him. It comes back down: "you can fire up the preview".',
		kind: 'tilt',
		gentle: true,
		still: true,
		in: 'up_in',
		beat: 0.1,
		outDelay: 0.14,
		holdOut: 0.1,
		cards: [{w: 0, text: 'Up here?', face: 2, reveal: true, caption: true}],
		back: [],
	},
	lookup: {
		idea: 'Reda\'s look up, on any video. "Psst. Look up." The camera tilts up to the ad. Back: "Okay, back down."',
		kind: 'tilt',
		gentle: true,
		still: true,
		in: 'lookup_in',
		out: 'lookup_out',
		beat: 0.1,
		outDelay: 0.2,
		cards: [{w: 0, text: 'Psst.', face: 2, reveal: true, caption: true}, {w: 1, text: 'Look up.', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Okay, back down.', face: 2, reveal: true, caption: true}],
	},
	blink: {
		idea: '"It\'s really fast." "Don\'t blink." The eye closes, it opens on the ad. "You blinked." It opens on him: "I just wish I didn\'t have to do all of that every single time."',
		kind: 'blink',
		gentle: true,
		still: true,
		in: 'blink_in',
		out: 'blink_out',
		beat: 0.16,
		outDelay: 0.2,
		cards: [{w: 0, text: "Don't blink.", face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'You blinked.', face: 2, reveal: true, caption: true}],
	},
	drop: {
		idea: '"...because you drop it all the time," and the picture slips off its nail. "Oops." It falls, the ad was behind it. "Sorry. Got it." It goes back up a little crooked, gets straightened, he goes on: "yep, probably no."',
		kind: 'fall',
		gentle: true,
		still: true,
		delay: 0.52,
		in: 'drop_in',
		out: 'drop_out',
		beat: 0.1,
		outDelay: 0.2,
		cards: [{w: 0, text: 'Oops.', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Sorry.', face: 2, reveal: true, caption: true}, {w: 1, text: 'Got it.', face: 2, reveal: true, caption: true}],
	},
	peel: {
		idea: '"...it also just feels nice to slide your finger across it." "You know what else feels nice?" A corner of the picture lifts like the film on a new phone, and it peels off onto the ad. Back: it goes back on, "Good as new."',
		kind: 'peel',
		gentle: true,
		still: true,
		in: 'nice_in',
		out: 'new_out',
		beat: 0.12,
		outDelay: 0.2,
		cards: [{w: 0, text: 'You know what', face: 2, reveal: true, caption: true}, {w: 3, text: 'else feels nice?', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Good as new.', face: 2, reveal: true, caption: true}],
	},
	'peel-want': {
		idea: 'The same on any video: only the corner of the picture lifting, and "You know you want to."',
		kind: 'peel',
		gentle: true,
		still: true,
		in: 'want_in',
		out: 'new_out',
		beat: 0.12,
		outDelay: 0.2,
		cards: [{w: 0, text: 'You know you want to.', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Good as new.', face: 2, reveal: true, caption: true}],
	},
	closer: {
		idea: '"...still very small." "Closer. Closer. Closer." A step of the camera on each word, then right into the screen, where the ad is. Back: "Okay. Too close."',
		kind: 'closer',
		gentle: true,
		still: true,
		in: 'closer_in',
		out: 'closer_out',
		beat: 0.04,
		outDelay: 0.2,
		cards: [{w: 0, text: 'Closer.', face: 2, reveal: true, caption: true}, {w: 1, text: 'Closer.', face: 2, reveal: true, caption: true, size: 150}, {w: 2, text: 'Closer.', face: 2, reveal: true, caption: true, size: 190}],
		back: [{w: 0, text: 'Okay.', face: 2, reveal: true, caption: true}, {w: 1, text: 'Too close.', face: 2, reveal: true, caption: true}],
	},
	help: {
		idea: 'In place of "He\'s about to tell you": after "Just someone please tell us if we should buy this thing or not.", a voice that heard it: "Did I just hear someone ask for help?" The ad leans in from the side. Back: his "Okay, first of all,".',
		kind: 'split',
		gentle: true,
		still: true,
		in: 'help_in',
		steps: [{w: 4, x: 0.87}],
		beat: 0.14,
		outDelay: 0.14,
		holdOut: 0.1,
		cards: [{w: 0, text: 'Did I just hear', face: 2, reveal: true, caption: true}, {w: 4, text: 'someone ask for help?', face: 2, reveal: true, caption: true}],
		back: [],
	},
	wish: {
		idea: '"I just wish I didn\'t have to do all of that every single time." "Funny you should say that." The ad leans in from the side.',
		kind: 'split',
		gentle: true,
		still: true,
		in: 'funny_in',
		steps: [{w: 2, x: 0.87}],
		beat: 0.14,
		outDelay: 0.14,
		holdOut: 0.1,
		cards: [{w: 0, text: 'Funny you should say that.', face: 2, reveal: true, caption: true, size: 104}],
		back: [],
	},
	'hi-push': {
		idea: 'He waves. "Hi. You can\'t skip this one." The ad comes in and pushes him out, one nudge at a time. His next words: "Shame on you for skipping."',
		kind: 'split',
		gentle: true,
		still: true,
		in: 'hi_in',
		steps: [{w: 1, x: 0.88}, {w: 3, x: 0.7}],
		beat: 0.1,
		outDelay: 0.14,
		holdOut: 0.1,
		cards: [{w: 0, text: 'Hi.', face: 2, reveal: true, caption: true}, {w: 1, text: "You can't skip this one.", face: 2, reveal: true, caption: true}],
		back: [],
	},
	'explain-up': {
		idea: '"Let me explain." "He will. Right after this." The camera looks up to the ad, and comes back down on his own chapter card.',
		kind: 'tilt',
		gentle: true,
		still: true,
		in: 'will_in',
		beat: 0.1,
		outDelay: 0.14,
		holdOut: 0.1,
		cards: [{w: 0, text: 'He will.', face: 2, reveal: true, caption: true}, {w: 2, text: 'Right after this.', face: 2, reveal: true, caption: true}],
		back: [],
	},
	asked: {
		idea: 'Reda\'s favourite move with a line that leads to an assistant: "...is the apps." "And what if... he just asked?" The walk along the wall, the ad is the next picture. Back: "Anyway. Apps."',
		kind: 'museum',
		gallery: true,
		gentle: true,
		still: true,
		in: 'asked_in',
		out: 'whatif_out',
		beat: 0.3,
		diveD: 1.3,
		outDelay: 0.95,
		cards: [{w: 0, text: 'And what if...', face: 2, reveal: true, caption: true}, {w: 3, text: 'he just asked?', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Anyway. Apps.', face: 2, reveal: true, caption: true}],
	},
	'behind-gentle': {
		idea: 'He says "...like eight generations behind" and the wall behind him lights up: "Psst. Behind you." The camera goes past him into it. Back: "Eyes front!" and he goes on: "the first folding phones we saw".',
		kind: 'board',
		gentle: true,
		still: true,
		in: 'behind_in',
		out: 'behind_out',
		landAfter: 0.12,
		holdLit: 0.55,
		diveD: 1.05,
		cards: [{w: 0, text: 'Psst.', face: 2, size: 92}, {w: 1, text: 'Behind you.', face: 2, size: 92}],
		back: [{w: 0, text: 'Eyes front!', face: 2, size: 92}],
		frameW: 1,
	},
	// On talking videos: the sentence ends by itself, the picture steps back, and his next words, untouched, are often the way back.
	whatif: {
		idea: 'Reda\'s line, right after "What\'s not fun, though, right now, is the apps." The picture steps back onto a wall, the ad is the next picture: the camera walks to it and goes in. The ad opens on "Whoa, what\'s that? I just built...". Back the same way.',
		kind: 'museum',
		gallery: true,
		gentle: true,
		still: true,
		in: 'whatif_in',
		out: 'whatif_out',
		beat: 0.3,
		diveD: 1.3,
		outDelay: 0.95,
		cards: [{w: 0, text: 'And what if...', face: 2, reveal: true, caption: true}, {w: 3, text: 'he just built his own?', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Anyway. Apps.', face: 2, reveal: true, caption: true}],
	},
	'whatif-self': {
		idea: 'The same move with Reda\'s exact words.',
		kind: 'museum',
		gallery: true,
		gentle: true,
		still: true,
		in: 'whatif2_in',
		out: 'whatif_out',
		beat: 0.3,
		diveD: 1.3,
		outDelay: 0.95,
		cards: [{w: 0, text: 'And what if he could', face: 2, reveal: true, caption: true}, {w: 5, text: 'make the app himself?', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Anyway. Apps.', face: 2, reveal: true, caption: true}],
	},
	'whatif-bam': {
		idea: 'The same line with a hard cut in place of the walk, to compare.',
		kind: 'museum',
		gentle: true,
		still: true,
		in: 'whatif_in',
		out: 'whatif_out',
		beat: 0.22,
		outDelay: 0.3,
		cards: [{w: 0, text: 'And what if...', face: 2, reveal: true, caption: true}, {w: 3, text: 'he just built his own?', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Anyway. Apps.', face: 2, reveal: true, caption: true}],
	},
	someone: {
		idea: 'The ad overheard the word. It apologises for being there: "Sorry... did someone say apps?" Back: "My bad. Carry on."',
		kind: 'museum',
		gallery: true,
		gentle: true,
		still: true,
		in: 'someone_in',
		out: 'someone_out',
		beat: 0.3,
		diveD: 1.3,
		outDelay: 0.95,
		cards: [{w: 0, text: 'Sorry...', face: 2, reveal: true, caption: true}, {w: 1, text: 'did someone say apps?', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'My bad.', face: 2, reveal: true, caption: true}, {w: 2, text: 'Carry on.', face: 2, reveal: true, caption: true}],
	},
	foryou: {
		idea: 'After "This is the first generation. It\'s made for you.": "Or... you could just make your own." Back: "Okay. Back to his." and he goes on: "But, also, yeah, it is polished but rough."',
		kind: 'museum',
		gallery: true,
		gentle: true,
		still: true,
		in: 'own_in',
		out: 'own_out',
		beat: 0.3,
		diveD: 1.3,
		outDelay: 0.95,
		cards: [{w: 0, text: 'Or...', face: 2, reveal: true, caption: true}, {w: 1, text: 'you could just make your own.', face: 2, reveal: true, caption: true, size: 104}],
		back: [{w: 0, text: 'Okay.', face: 2, reveal: true, caption: true}, {w: 1, text: 'Back to his.', face: 2, reveal: true, caption: true}],
	},
	hi: {
		idea: 'He says "In which case, hi." and waves at the people who skip to the end. "Hi. You can\'t skip this one." The ad. No voice on the way back: his next words do it: "Shame on you for skipping."',
		kind: 'museum',
		gentle: true,
		still: true,
		in: 'hi_in',
		beat: 0.2,
		holdOut: 0.28,
		outDelay: 0.3,
		cards: [{w: 0, text: 'Hi.', face: 2, reveal: true, caption: true}, {w: 1, text: "You can't skip this one.", face: 2, reveal: true, caption: true}],
		back: [],
	},
	buy: {
		idea: 'The one moment everybody is waiting for: "Just someone please tell us if we should buy this thing or not." "He\'s about to tell you. Right after this." Back: his "Okay, first of all,".',
		kind: 'museum',
		gallery: true,
		gentle: true,
		still: true,
		in: 'tell_in',
		beat: 0.3,
		diveD: 1.3,
		outDelay: 1.05,
		holdOut: 0.1,
		cards: [{w: 0, text: "He's about to tell you.", face: 2, reveal: true, caption: true}, {w: 5, text: 'Right after this.', face: 2, reveal: true, caption: true}],
		back: [],
	},
	explain: {
		idea: 'He says "Let me explain." and his own video cuts to a chapter card. "He will. Right after this." The ad. Back on his chapter card.',
		kind: 'museum',
		gentle: true,
		still: true,
		in: 'will_in',
		beat: 0.2,
		holdOut: 0.28,
		outDelay: 0.3,
		cards: [{w: 0, text: 'He will.', face: 2, reveal: true, caption: true}, {w: 2, text: 'Right after this.', face: 2, reveal: true, caption: true}],
		back: [],
	},
	everytime: {
		idea: 'Reda\'s not-an-ad gag, with a way back the video writes alone: his next words are "I just wish I didn\'t have to do all of that every single time."',
		kind: 'museum',
		gentle: true,
		still: true,
		in: 'notad2_in',
		beat: 0.14,
		holdOut: 0.28,
		outDelay: 0.3,
		cards: [{w: 0, text: 'This might not be an ad.', face: 2, reveal: true, caption: true}, {w: 6, text: 'Oh wait. Actually, it is.', face: 2, reveal: true, caption: true}],
		back: [],
	},
	knock: {
		idea: 'The ad knocks and asks if it is a bad time. The picture is a door, it opens away from us onto the ad. Back: "Thanks. I\'ll see myself out." and it closes behind itself.',
		kind: 'door',
		knock: true,
		gentle: true,
		still: true,
		in: 'knock_in',
		out: 'knock_out',
		beat: 0.2,
		outDelay: 0.25,
		cards: [{w: 0, text: 'Sorry...', face: 2, reveal: true, caption: true}, {w: 1, text: 'is this a bad time?', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Thanks.', face: 2, reveal: true, caption: true}, {w: 1, text: "I'll see myself out.", face: 2, reveal: true, caption: true}],
	},
	oops: {
		idea: 'The gesture everybody knows from Reels: "Oops. Wrong video." The video scrolls up, the ad is the next one in the feed. Back: "Found it." and it scrolls down.',
		kind: 'swipe',
		gentle: true,
		still: true,
		in: 'oops_in',
		out: 'oops_out',
		beat: 0.12,
		outDelay: 0.3,
		cards: [{w: 0, text: 'Oops.', face: 2, reveal: true, caption: true}, {w: 1, text: 'Wrong video.', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Found it.', face: 2, reveal: true, caption: true}],
	},
	could: {
		idea: 'He smiles at the camera, the phone in his hand: "this could be you," "It could." The ad, which ends on "It\'s app to you." He goes on: "but don\'t do that."',
		kind: 'museum',
		gentle: true,
		still: true,
		in: 'could_in',
		beat: 0.25,
		holdOut: 0.28,
		outDelay: 0.3,
		cards: [{w: 0, text: 'It could.', face: 2, reveal: true, caption: true}],
		back: [],
	},
	waitfor: {
		idea: 'Reda\'s favourite. The camera creeps in, the tension rises, the ad is the punchline: a hard cut. Back: the jump goes on "There it is!"',
		kind: 'cut',
		in: 'waitfor_in',
		out: 'waitfor_out',
		beat: 0.24,
		riser: true,
		cards: [{w: 0, text: 'Wait for it...', face: 2, reveal: true, size: 150}, {w: 3, text: 'wait for it...', face: 2, reveal: true, size: 196}],
		back: [{w: 0, text: 'There it is!'}],
		resumeW: 0,
		outDelay: 0.12,
	},
	notad: {
		idea: 'Reda\'s idea. The picture hangs like a painting: "This might not be an ad." A beat. "Oh wait. Actually, it is." Bam, the ad. Back: "Sorry about that."',
		kind: 'museum',
		in: 'notad2_in',
		out: 'notad2_out',
		beat: 0.14,
		still: true,
		cards: [{w: 0, text: 'This might not be an ad.', face: 2, reveal: true, caption: true}, {w: 6, text: 'Oh wait. Actually, it is.', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Sorry about that.', face: 2, caption: true}],
		outDelay: 0.3,
	},
	waitnotad: {
		idea: '"Wait for it..." in front of the other gag: it goes almost anywhere.',
		kind: 'museum',
		in: 'waitnotad_in',
		out: 'notad2_out',
		museumW: 3,
		beat: 0.14,
		still: true,
		cards: [{w: 0, text: 'Wait for it...', face: 2, reveal: true}, {w: 3, text: 'This might not be an ad.', face: 2, reveal: true, caption: true}, {w: 9, text: 'Oh wait. Actually, it is.', face: 2, reveal: true, caption: true}],
		back: [{w: 0, text: 'Sorry about that.', face: 2, caption: true}],
		outDelay: 0.3,
	},
	hold: {
		idea: 'Ads hurt because they are sudden, so: the injection. A dot lands on his arm, the ad spreads from there. Back: "See? All done."',
		kind: 'flood',
		from: 'prick',
		in: 'hold_in',
		out: 'hold_out',
		still: true,
		beat: 0.1,
		cards: [{w: 0, text: 'Hold still.'}, {w: 2, text: "This won't hurt.", face: 2}],
		back: [{w: 0, text: 'See?'}, {w: 1, text: 'All done.', face: 2}],
		outDelay: 0.3,
	},
	psst2: {
		idea: 'The Psst family: the camera sneaks away from him to the surface, out of earshot.',
		kind: 'board',
		in: 'psst2_in',
		out: 'psst2_out',
		cards: [{w: 0, text: 'Psst.', face: 2}, {w: 1, text: "He can't hear us.", frame: true}],
		back: [{w: 0, text: 'Act natural.'}],
		frameW: 1,
		landW: 4,
	},
	dontlook: {
		idea: 'Someone who can barely get the words out: "Please... do not... look there." The viewfinder comes to rest on the spot from the first word, the words sit right on top of it so the eyes never travel. Back: "You looked."',
		kind: 'board',
		in: 'please1_in',
		out: 'dontlook_out',
		gentle: true,
		still: true,
		landAfter: 0.7,
		holdLit: 0.6,
		diveD: 1.0,
		cards: [{w: 0, text: 'Please...', face: 2, frame: true, size: 104}, {w: 1, text: 'do not...', face: 2, frame: true, size: 104}, {w: 3, text: 'look there.', face: 2, frame: true, size: 104}],
		back: [{w: 0, text: 'You looked.'}],
		frameW: 0,
	},
	'dontlook-long': {
		idea: 'The same, he loses it: "Please... oh no... I can\'t even talk... Please... do not look there." Back: "I said please."',
		kind: 'board',
		in: 'please2_in',
		out: 'please_out',
		gentle: true,
		still: true,
		landAfter: 0.7,
		holdLit: 0.6,
		diveD: 1.0,
		cards: [{w: 0, text: 'Please...', face: 2, frame: true, size: 104}, {w: 1, text: 'oh no...', face: 2, frame: true, size: 104}, {w: 3, text: "I can't even talk...", face: 2, frame: true, size: 84}, {w: 7, text: 'Please...', face: 2, frame: true, size: 104}, {w: 8, text: 'do not look there.', face: 2, frame: true, size: 84}],
		back: [{w: 0, text: 'I said please.', face: 2}],
		frameW: 0,
	},
	waitbehind: {
		idea: '"Wait for it..." in front of "Psst. Behind you."',
		kind: 'board',
		in: 'waitbehind_in',
		out: 'behind_out',
		cards: [{w: 0, text: 'Wait for it...', face: 2}, {w: 3, text: 'wait for it...', face: 2}, {w: 6, text: 'Psst.', face: 2}, {w: 7, text: 'Behind you.', frame: true}],
		back: [{w: 0, text: 'Eyes front!'}],
		frameW: 7,
		landW: 8,
	},
	notagain: {
		idea: 'His inner voice: he knows what is coming. Works on any person frozen by any ad.',
		kind: 'thought',
		in: 'notagain_in',
		out: 'notagain_out',
		cards: [{w: 0, text: 'Oh no.', reveal: true}, {w: 2, text: 'Not again.', reveal: true}],
		back: [{w: 0, text: 'Finally.'}],
	},
	thought: {
		idea: 'The thought is the ad. Glass bubble, the camera comes close to his face, the bubble opens into the ad. Back: "Later. Jump first!"',
		kind: 'thought',
		in: 'thought2_in',
		out: 'thought2_out',
		cards: [{w: 0, text: 'What if I just', reveal: true}, {w: 4, text: 'built an app instead?', reveal: true}],
		back: [{w: 0, text: 'Later.'}, {w: 1, text: 'Jump first!'}],
	},
	replay: {
		idea: 'A real broadcast replay: rewind, slow motion on him with the move drawn, a sponsor band that opens into the ad.',
		kind: 'replay',
		in: 'replay_in',
		out: 'replay_out',
		cards: [{w: 0, text: 'Wait!'}, {w: 1, text: 'Run that back!', face: 1}, {w: 4, text: 'This jump is brought to you by...', reveal: true}],
		back: [{w: 0, text: 'His way now!'}],
		outDelay: 0.3,
	},
	photo: {
		idea: 'A viewfinder hunts on him, the shutter, he is a print on the ad\'s paper, the print is swiped away: "Your turn." Back: "One more!"',
		kind: 'photo',
		in: 'photo2_in',
		out: 'photo_out',
		snapW: 2,
		beat: 0.06,
		cards: [{w: 0, text: "Don't move..."}, {w: 2, text: 'Smile!', ink: true}, {w: 3, text: 'Your turn.', face: 2, ink: true}],
		back: [{w: 0, text: 'One more!'}],
	},
	// Written for one moment: MKBHD, "the gym app I use every day... probably not gonna get updated", then Base44.
	'mk-build': {
		idea: 'Deadpan, a hard cut, and the ad opens on people building apps. His next line, "So, stuff like that", answers the ad.',
		kind: 'cut',
		in: 'mk_build_in',
		out: 'mk_anyway',
		beat: 0.2,
		cards: [{w: 0, text: 'Somebody should build him one.', face: 2, reveal: true, size: 92}],
		back: [{w: 0, text: 'Anyway.'}],
	},
	'mk-thought': {
		idea: 'His inner voice, one beat after the complaint. No line on the way back: he says "So, stuff like that" himself.',
		kind: 'thought',
		in: 'mk_thought_in',
		cards: [{w: 0, text: 'What if I just', reveal: true}, {w: 4, text: 'built it myself?', reveal: true}],
		back: [],
		holdOut: 0.1,
	},
	// Kept as they are. Good: wait, behind, behind-soft, forget. Not good, see docs/verdicts.md: the others.
	wait: {
		idea: 'Wait x4, Look! Right there! The camera swings to a surface, a viewfinder snaps on it, it lights up, the camera dives in.',
		kind: 'board',
		in: 'wait_in',
		out: 'wait_out',
		cards: [{w: 0, text: 'Wait'}, {w: 1, text: 'WAIT', face: 1}, {w: 2, text: 'Wait', face: 2}, {w: 3, text: 'wait', face: 3}, {w: 4, text: 'Look!', frame: true}, {w: 5, text: 'right there', face: 2, frame: true}],
		back: [{w: 0, text: 'Okay'}, {w: 1, text: 'Okay!'}, {w: 2, text: 'Go!'}, {w: 3, text: 'GO', face: 1}, {w: 4, text: 'Go!'}],
		frameW: 4,
		landW: 6,
		resumeW: 2,
	},
	behind: {
		idea: 'Psst. Behind you. Same surface, fewer words.',
		kind: 'board',
		in: 'behind_in',
		out: 'behind_out',
		cards: [{w: 0, text: 'Psst.', face: 2}, {w: 1, text: 'Behind you.', frame: true}],
		back: [{w: 0, text: 'Eyes front!'}],
		frameW: 1,
		landW: 2,
	},
	'behind-soft': {
		idea: 'The same whispered: the video slows to a stop by itself, nothing snaps.',
		kind: 'board',
		soft: true,
		in: 'soft_behind_in',
		out: 'soft_behind_out',
		cards: [{w: 0, text: 'Psst.', face: 2}, {w: 1, text: 'Behind you.', face: 2, frame: true}],
		back: [{w: 0, text: 'Eyes front.', face: 2}],
		frameW: 1,
		landW: 2,
	},
	forget: {
		idea: 'Zoom out: the video shrinks away and leaves the ad\'s "You". Back: it comes forward again.',
		kind: 'zoomout',
		in: 'forget_in',
		out: 'forget_out',
		cards: [{w: 0, text: 'Forget him.'}, {w: 2, text: 'What about...', face: 2}],
		back: [{w: 0, text: 'Back to him!'}],
		outDelay: 0.25,
	},
	nothim: {
		idea: 'Two words, a whip pan, and the ad says "You". The shortest one.',
		kind: 'whip',
		in: 'nothim_in',
		out: 'nothim_out',
		cards: [{w: 0, text: 'Not him.'}],
		back: [{w: 0, text: 'Okay.'}, {w: 1, text: 'Him.', face: 2}],
	},
	'nothim-soft': {
		idea: 'The same whispered, the video slows down, the ad opens softly out of the centre.',
		kind: 'flood',
		soft: true,
		from: 'center',
		in: 'soft_nothim_in',
		out: 'soft_nothim_out',
		cards: [{w: 0, text: 'Not him.', face: 2}],
		back: [{w: 0, text: 'Okay.', face: 2}, {w: 1, text: 'Him.', face: 2}],
		outDelay: 0.4,
	},
	bird: {
		idea: 'A line everyone knows, the ad gives the last word.',
		kind: 'flood',
		from: 'head',
		in: 'bird_in',
		out: 'bird_out',
		cards: [{w: 0, text: 'A bird?'}, {w: 2, text: 'A plane?', face: 1}, {w: 4, text: 'No...', face: 2}],
		back: [{w: 0, text: 'Okay.'}, {w: 1, text: 'Back to the bird.', face: 2}],
		outDelay: 0.3,
	},
	scratch: {
		idea: 'The freeze-frame meme, and the question the ad answers.',
		kind: 'flood',
		from: 'button',
		in: 'scratch_in',
		out: 'scratch_out',
		cards: [{w: 0, text: 'Yep.'}, {w: 1, text: "That's him."}, {w: 3, text: 'Better question:', face: 2}],
		back: [{w: 0, text: 'Anyway.'}, {w: 1, text: 'Go!'}],
		resumeW: 1,
	},
	typed: {
		idea: 'No voice at all: the words are typed with the key taps, the video slows down by itself.',
		kind: 'flood',
		soft: true,
		from: 'head',
		hold: 1.15,
		holdOut: 0.8,
		cards: [{s: 0, text: 'What about...', typed: true}],
		back: [{s: 0, text: 'Back to him.', typed: true}],
		outDelay: 0.3,
	},
	'typed-samsung': {
		idea: 'Muted, on another video and ad. Spot cascadia-samsung.',
		kind: 'melt',
		soft: true,
		hold: 1.3,
		holdOut: 0.9,
		cards: [{s: 0, text: 'Surprisingly...', typed: true}],
		back: [{s: 0, text: 'Down, probably.', typed: true}],
		outDelay: 0.3,
	},
	'typed-mercedes': {
		idea: 'Muted, on another video and ad. Spot dp-mercedes.',
		kind: 'melt',
		soft: true,
		hold: 1.2,
		holdOut: 0.8,
		cards: [{s: 0, text: 'Count him in?', typed: true}],
		back: [{s: 0, text: 'Now swing.', typed: true}],
		outDelay: 0.3,
	},
	melt: {
		idea: 'No voice, no word: the video slows to a stop and melts into the ad.',
		kind: 'melt',
		soft: true,
		hold: 0.35,
		holdOut: 0.2,
		cards: [],
		back: [],
	},
};

const DUR: Record<Kind, number> = {board: 0.8, flood: 0.55, whip: 0.42, zoomout: 0.8, photo: 0.42, replay: 0.5, thought: 0.6, melt: 0.9, cut: 0, museum: 0, door: 0.95, swipe: 0.5, tilt: 0.95, flip: 0.95, fold: 1.3, split: 0.72, blink: 1.05, fall: 0.8, peel: 1.08, closer: 0.85};
const BACK: Record<Kind, number> = {board: 0.62, flood: 0.5, whip: 0.42, zoomout: 0.75, photo: 0.6, replay: 0.5, thought: 0.55, melt: 0.7, cut: 0, museum: 0.42, door: 0.62, swipe: 0.5, tilt: 0.85, flip: 0.85, fold: 1.05, split: 0.62, blink: 0.95, fall: 1.0, peel: 0.8, closer: 0.72};
const LEAVES: Kind[] = ['door', 'swipe', 'tilt', 'flip', 'fold', 'split', 'blink', 'fall', 'peel', 'closer']; // they move only once the line of the way back is over
const SOFT_D = 0.8; // how long the video takes to slow down, and to get going again
const WALK_D = 0.72; // gallery: the walk from one picture to the next
const HUNG = 0.42; // museum: how long the picture takes to step back onto the wall
const GAP = 240; // gallery: the wall between two pictures, in pixels of a picture at full size
const TILT_GAP = 90; // tilt: the dark between the picture and the ad, above it

// A move with weight: a small step back before it leaves, a small overshoot when it lands, exactly 0 and 1 at both ends.
const weighty = (t: number, at: number, d: number) => {
	const x = clamp01((t - at) / d);
	return glide(x, 0.08, 0.66) - 0.018 * Math.sin(Math.PI * clamp01(x / 0.2)) + 0.03 * Math.sin(Math.PI * clamp01((x - 0.66) / 0.34));
};
// Peel: what is left of the sheet on one side of the fold.
type Pt = {x: number; y: number};
const SHEET: Pt[] = [{x: 0, y: 0}, {x: W, y: 0}, {x: W, y: H}, {x: 0, y: H}];
const halfPlane = (pts: Pt[], at: Pt, n: Pt, side: 1 | -1) => {
	const f = (p: Pt) => side * ((p.x - at.x) * n.x + (p.y - at.y) * n.y);
	const out: Pt[] = [];
	pts.forEach((a, i) => {
		const b = pts[(i + 1) % pts.length];
		const fa = f(a);
		const fb = f(b);
		if (fa >= 0) out.push(a);
		if (fa >= 0 !== fb >= 0) out.push({x: a.x + ((b.x - a.x) * fa) / (fa - fb), y: a.y + ((b.y - a.y) * fa) / (fa - fb)});
	});
	return out;
};
const polygon = (pts: Pt[]) => `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`;

const startsOf = (c: Card, words: {start: number}[]) => (c.reveal ? words.slice(c.w ?? 0, (c.w ?? 0) + c.text.split(' ').length).map((x) => x.start) : []);

export const plan = (q: Quick) => {
	const inAt = freeze + (q.delay ?? (q.soft ? 0.25 : q.knock ? 0.8 : 0.06));
	const wi = q.in ? V.words(q.in, inAt) : [];
	const cardT = q.cards.map((c) => (q.in ? wi[c.w ?? 0].start : inAt + (c.s ?? 0)));
	const cardW = q.cards.map((c) => startsOf(c, wi));
	const inEnd = q.in ? V.end(q.in, inAt) : inAt + (q.hold ?? 1);
	const landAfter = q.landAfter != null ? inEnd + q.landAfter : null;
	const go = landAfter != null ? landAfter + (q.holdLit ?? 0.5) : inEnd + (q.beat ?? 0.02);
	const adStart = snap(go + (q.diveD ?? DUR[q.kind]));
	const adEnd = adStart + AD.duration;
	const pull = adEnd + 0.04;
	const outAt = pull + (q.outDelay ?? 0.12);
	const wo = q.out ? V.words(q.out, outAt) : [];
	// Words wait until the way back shows the video again, except where they live on the surface, the bubble or the paper.
	const leaves = LEAVES.includes(q.kind);
	const clear = q.gallery ? pull + WALK_D + 0.3 : q.kind === 'board' || q.kind === 'thought' || q.kind === 'museum' || leaves ? pull : pull + BACK[q.kind] * 0.6;
	const backT = q.back.map((c) => Math.max(clear, q.out ? wo[c.w ?? 0].start : outAt + (c.s ?? 0)));
	const backW = q.back.map((c) => startsOf(c, wo));
	const outEnd = q.out ? V.end(q.out, outAt) : outAt + (q.holdOut ?? 0.5);
	const resumeW = TALK ? null : q.resumeW;
	const resume = snap(leaves ? outEnd + 0.05 + BACK[q.kind] : q.gallery ? Math.max(outEnd + 0.42, pull + 0.4 + WALK_D + 0.5) : q.kind === 'museum' ? outEnd + 0.42 : Math.max(pull + BACK[q.kind], resumeW != null ? wo[resumeW].start : TALK ? outEnd + 0.08 : outEnd - 0.1));
	const frameAt = q.frameW != null ? wi[q.frameW].start : go;
	const landAt = landAfter ?? (q.landW != null ? wi[q.landW].start : go);
	const snapAt = q.snapW != null ? wi[q.snapW].start : go;
	const museumAt = q.museumW != null ? wi[q.museumW].start : inAt;
	const textOut = leaves ? outEnd + 0.05 : q.kind === 'museum' ? resume - 0.36 : Math.max(outEnd + 0.22, resume + 0.3);
	const stepT = (q.steps ?? []).map((x) => wi[x.w].start);
	return {stepT, inAt, cardT, cardW, inEnd, go, adStart, adEnd, pull, outAt, backT, backW, outEnd, resume, frameAt, landAt, snapAt, museumAt, textOut, total: resume + (q.soft ? SOFT_D / 2 : 0) + (VIDEO.end - VIDEO.freezeAt) + 0.4};
};
export const TLS = Object.fromEntries(Object.entries(QUICKS).map(([k, q]) => [k, plan(q)]));

// The faces of the font-shuffle move (snapcn), one per card when a line hits several times.
const FACES = [
	{font: fontFamily, weight: 800, k: 1, spacing: '-0.04em', upper: false},
	{font: BEBAS, weight: 400, k: 1.24, spacing: '0', upper: true},
	{font: SERIF, weight: 400, k: 1.24, spacing: '-0.01em', upper: false},
	{font: MONO, weight: 400, k: 0.92, spacing: '-0.03em', upper: false},
	{font: SYNE, weight: 700, k: 0.92, spacing: '-0.02em', upper: false},
];
const sizeFor = (text: string) => (text.length <= 5 ? 190 : text.length <= 8 ? 168 : text.length <= 12 ? 140 : text.length <= 16 ? 118 : 100);
const SKY = SPOTV.textAt ?? {x: 1150, y: 205};
const CAPTION_Y = 868;

const Revealed: React.FC<{t: number; text: string; starts: number[]}> = ({t, text, starts}) => (
	<>
		{text.split(' ').map((word, i, all) => (
			<span key={i} style={{display: 'inline-block', whiteSpace: 'pre', opacity: glide(t, starts[i] - 0.02, 0.07), transform: `translateY(${(1 - glide(t, starts[i] - 0.04, 0.22)) * 0.2}em)`}}>
				{word}
				{i < all.length - 1 ? ' ' : ''}
			</span>
		))}
	</>
);

const Words: React.FC<{t: number; card: Card; at: number; until: number; x: number; y: number; starts?: number[]; soft?: boolean; size?: number; color?: string}> = ({t, card, at, until, x, y, starts, soft, size, color}) => {
	const f = FACES[card.face ?? 0];
	const px = (size ?? sizeFor(card.text)) * (size ? 1 : f.k);
	const n = card.typed ? Math.min(card.text.length, Math.floor((t - at) / 0.075) + 1) : card.text.length;
	const hit = soft || card.typed || card.reveal ? 1 : 1.09 - 0.09 * step(t - at, {response: 0.16, damping: 0.8});
	const ink = color ?? (card.ink || card.caption ? INK : WHITE);
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				transform: `translate(-50%, -50%) scale(${hit})`,
				opacity: soft && !card.typed ? glide(t, at - 0.04, 0.24) * (1 - glide(t, until - 0.08, 0.12)) : 1,
				whiteSpace: 'pre',
				fontFamily: f.font,
				fontWeight: f.weight,
				fontSize: px,
				lineHeight: 1,
				letterSpacing: f.spacing,
				textTransform: f.upper ? 'uppercase' : 'none',
				color: ink,
				textShadow: ink === INK ? 'none' : '0 2px 34px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
			}}
		>
			{card.reveal && starts?.length ? <Revealed t={t} text={card.text} starts={starts} /> : card.text.slice(0, n)}
			{card.typed && t < at + 0.075 * card.text.length + 0.14 && <span style={{display: 'inline-block', width: px * 0.055, height: px * 0.82, marginLeft: px * 0.05, verticalAlign: '-0.08em', background: PALETTE.orange, borderRadius: 2}} />}
		</div>
	);
};

// Board: on the left tarp panel, the lamp post just left of the ad's "You".
const BOARD_W = SPOTV.board?.w ?? 245;
const BOARD = {x: SPOTV.board?.x ?? 660, y: SPOTV.board?.y ?? 458, w: BOARD_W, h: (BOARD_W * 9) / 16};
const C0 = {x: BOARD.x + BOARD.w / 2, y: BOARD.y + BOARD.h / 2};
const DIVE = W / BOARD.w;
const POLE = SPOTV.board ? null : {x: 736, w: 18, y: 446, h: 165};
const PLATE = SPOTV.plate ?? 'demo/plate.jpg';
const PERSON = SPOTV.personClean ?? 'demo/person_clean.png';
const FRAME = {x0: BOARD.x - 14, y0: BOARD.y - 14, x1: BOARD.x + BOARD.w + 14, y1: BOARD.y + BOARD.h + 14};
const U_HOLD = 0.2;

const LAND_D = 0.62; // how long the viewfinder takes to come down onto the spot
const Viewfinder: React.FC<{t: number; at: number; out: number; a: {x: number; y: number}; b: {x: number; y: number}; soft?: boolean; lands?: boolean}> = ({t, at, out, a: a0, b: b0, soft, lands}) => {
	if (t < at || t >= out + 0.14) return null;
	// `lands`: it starts as the whole frame, like a camera looking for its subject, and comes to rest.
	const k = lands ? glide(t, at, LAND_D) : 1;
	const a = {x: lerp(70, a0.x, k), y: lerp(70, a0.y, k)};
	const b = {x: lerp(W - 70, b0.x, k), y: lerp(H - 70, b0.y, k)};
	const g = lands ? 1 : soft ? 1.1 - 0.1 * glide(t, at, 0.4) : 1.28 - 0.28 * step(t - at, {response: 0.2, damping: 0.72});
	const cx = (a.x + b.x) / 2;
	const cy = (a.y + b.y) / 2;
	const L = 62;
	return (
		<svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: (soft || lands ? glide(t, at, 0.2) : 1) * (1 - glide(t, out, 0.14)), filter: 'drop-shadow(0 1px 8px rgba(0,0,0,0.45))'}}>
			<g transform={`translate(${cx} ${cy}) scale(${g}) translate(${-cx} ${-cy})`}>
				{[[a.x, a.y, 1, 1], [b.x, a.y, -1, 1], [b.x, b.y, -1, -1], [a.x, b.y, 1, -1]].map(([x, y, dx, dy], i) => (
					<path key={i} d={`M${x} ${y + dy * L} V${y} H${x + dx * L}`} fill="none" stroke={WHITE} strokeWidth={7} strokeLinecap="square" />
				))}
			</g>
		</svg>
	);
};

// Replay: his head through the slow motion, read by hand off the source frames (index, x, y). Stand-in for a
// tracker: SAM 3.1 gives this in the product.
const HEAD_KEYS: [number, number, number][] = [[104, 1152, 660], [110, 1128, 660], [116, 1076, 620], [122, 1044, 560], [128, 1032, 508], [134, 1020, 476], [140, 1036, 472], [146, 1014, 450]];
const REPLAY_BACK = 0.7; // source seconds rewound: 42 frames at 60 fps, back to when he plants his hands
const headAt = (s: number) => {
	const i = VIDEO.frames.freezeIndex + (s - VIDEO.freezeAt) * 60;
	const k = HEAD_KEYS.findIndex(([n]) => n >= i);
	if (k <= 0) return {x: HEAD_KEYS[0][1], y: HEAD_KEYS[0][2]};
	const [a, ax, ay] = HEAD_KEYS[k - 1];
	const [b, bx, by] = HEAD_KEYS[k];
	const f = (i - a) / (b - a);
	return {x: lerp(ax, bx, f), y: lerp(ay, by, f)};
};

const softSource = (t: number) => {
	const r = VIDEO.leadInRate;
	const d = freeze - t;
	return d <= SOFT_D ? VIDEO.freezeAt - (r * d * d) / (2 * SOFT_D) : VIDEO.freezeAt - (r * SOFT_D) / 2 - r * (d - SOFT_D);
};

const sfxFor = (q: Quick, L: ReturnType<typeof plan>) => {
	const out: {t: number; src: string; volume: number}[] = [];
	const add = (t: number, src: string, volume: number) => out.push({t, src, volume});
	if (!q.soft && q.kind !== 'photo') add(freeze, 'fs338220.mp3', q.gentle ? 0.2 : 0.42);
	const tap = q.soft ? 0.14 : 0.26;
	const cardsOf = (cards: Card[], ts: number[]) =>
		cards.forEach((c, i) => {
			if (!c.typed) return add(ts[i], `tap${i % 5}.wav`, tap);
			[...c.text].forEach((ch, j) => {
				if (ch !== ' ' && j % 2 === 0) add(ts[i] + j * 0.075, `tap${(j / 2) % 5}.wav`, 0.2);
			});
		});
	cardsOf(q.cards, L.cardT);
	cardsOf(q.back, L.backT);
	const woosh = q.soft ? 0.14 : 0.34;
	if (q.riser) add(Math.max(0.02, L.go - 1.9), 'fs172148.mp3', 0.26);
	if (q.kind === 'board') {
		add(q.gentle ? L.frameAt + LAND_D - 0.06 : L.frameAt, q.soft ? 'fs683048.mp3' : 'fs338219.mp3', q.soft ? 0.14 : q.gentle ? 0.3 : 0.36);
		add(L.landAt, 'fs830459.mp3', q.soft ? 0.18 : 0.34);
	}
	if (q.from === 'prick') add(L.cardT[0] + 0.3, 'fs683048.mp3', 0.3);
	if (q.kind === 'cut') {
		add(L.pull, 'kenney-impactSoft_heavy_000.ogg', 0.26);
	} else if (q.kind === 'door') {
		add(freeze + 0.14, 'kenney-impactWood_light_000.ogg', 0.6);
		add(freeze + 0.38, 'kenney-impactWood_light_000.ogg', 0.6);
		add(L.go, 'fs648729.mp3', 0.26);
		add(L.resume - 0.62, 'fs648729.mp3', 0.22);
		add(L.resume - 0.05, 'kenney-impactSoft_heavy_000.ogg', 0.4);
		add(L.resume - 0.05, 'kenney-impactWood_light_000.ogg', 0.4);
	} else if (q.kind === 'swipe') {
		add(L.go, 'fs648729.mp3', 0.32);
		add(L.go + 0.42, 'kenney-impactWood_light_000.ogg', 0.16);
		add(L.resume - 0.5, 'fs648729.mp3', 0.3);
		add(L.resume - 0.08, 'kenney-impactWood_light_000.ogg', 0.16);
	} else if (q.kind === 'tilt') {
		add(L.go, 'fs648729.mp3', 0.3);
		add(L.go + DUR.tilt * 0.7, 'kenney-impactSoft_heavy_000.ogg', 0.22);
		add(L.resume - BACK.tilt, 'fs648729.mp3', 0.28);
		add(L.resume - BACK.tilt * 0.3, 'kenney-impactSoft_heavy_000.ogg', 0.2);
	} else if (q.kind === 'flip') {
		add(L.go, 'fs828802.mp3', 0.6);
		add(L.go + 0.06, 'fs648729.mp3', 0.18);
		add(L.go + DUR.flip * 0.68, 'fs638697.mp3', 0.42);
		add(L.resume - BACK.flip, 'fs828802.mp3', 0.6);
		add(L.resume - BACK.flip + 0.06, 'fs648729.mp3', 0.18);
		add(L.resume - BACK.flip * 0.3, 'fs638697.mp3', 0.42);
	} else if (q.kind === 'fold') {
		add(L.go - 0.3, 'fs682136.mp3', 0.46);
		add(L.go, 'fs827498.mp3', 0.5);
		add(L.go + 0.04, 'fs648729.mp3', 0.22);
		add(L.resume - BACK.fold, 'fs827498.mp3', 0.46);
		add(L.resume - BACK.fold + 0.04, 'fs648729.mp3', 0.2);
		add(L.resume - 0.12, 'fs682136.mp3', 0.5);
	} else if (q.kind === 'split') {
		L.stepT.forEach((at) => {
			add(at, 'mixkit-3115.mp3', 0.2);
			add(at + 0.3, 'kenney-impactWood_light_000.ogg', 0.24);
		});
		add(L.go, 'fs648729.mp3', 0.3);
		add(L.go + DUR.split * 0.72, 'kenney-impactWood_light_000.ogg', 0.2);
		add(L.resume - BACK.split, 'fs648729.mp3', 0.28);
		add(L.resume - BACK.split * 0.26, 'kenney-impactWood_light_000.ogg', 0.2);
	} else if (q.kind === 'blink') {
		add(L.go, 'fs648729.mp3', 0.12);
		add(L.go + 0.2, 'kenney-impactSoft_heavy_000.ogg', 0.2);
		add(L.go + 0.36, 'fs648729.mp3', 0.16);
		add(L.resume - BACK.blink, 'fs648729.mp3', 0.12);
		add(L.resume - BACK.blink + 0.2, 'kenney-impactSoft_heavy_000.ogg', 0.2);
		add(L.resume - BACK.blink + 0.36, 'fs648729.mp3', 0.16);
	} else if (q.kind === 'fall') {
		add(freeze + 0.04, 'fs702171.mp3', 0.8);
		add(freeze + 0.36, 'kenney-impactWood_light_000.ogg', 0.22);
		add(L.go, 'fs648729.mp3', 0.24);
		add(L.go + DUR.fall * 0.8, 'kenney-impactSoft_heavy_000.ogg', 0.8);
		add(L.go + DUR.fall * 0.8, 'kenney-impactWood_light_000.ogg', 0.36);
		add(L.resume - BACK.fall, 'fs648729.mp3', 0.26);
		add(L.resume - BACK.fall + 0.6, 'kenney-impactWood_light_000.ogg', 0.34);
		add(L.resume - 0.14, 'kenney-click_002.ogg', 0.4);
	} else if (q.kind === 'peel') {
		add(L.cardT[0] + 0.1, 'fs555695b.mp3', 0.3);
		add(L.go, 'fs555695a.mp3', 0.7);
		add(L.go + 0.12, 'fs648729.mp3', 0.12);
		add(L.resume - BACK.peel, 'fs555695b.mp3', 0.5);
		add(L.resume - 0.1, 'kenney-impactWood_light_000.ogg', 0.2);
	} else if (q.kind === 'closer') {
		L.cardT.forEach((at) => add(at, 'fs648729.mp3', 0.12));
		add(L.go, 'fs648729.mp3', 0.34);
		add(L.go + DUR.closer * 0.8, 'kenney-impactSoft_heavy_000.ogg', 0.2);
		add(L.resume - BACK.closer, 'fs648729.mp3', 0.3);
		add(L.resume - 0.1, 'kenney-impactWood_light_000.ogg', 0.24);
	} else if (q.gallery) {
		add(L.museumAt, 'fs648729.mp3', 0.28);
		add(L.museumAt + HUNG, 'kenney-impactWood_light_000.ogg', 0.34); // it touches the wall
		add(L.go, 'fs648729.mp3', 0.3);
		add(L.go + 0.5, 'fs338219.mp3', 0.2);
		add(L.adStart - 0.42, 'fs648729.mp3', 0.34);
		add(L.pull, 'fs648729.mp3', 0.3);
		add(L.pull + 0.4, 'fs648729.mp3', 0.24);
		add(L.pull + 0.4 + WALK_D - 0.06, 'kenney-impactWood_light_000.ogg', 0.26);
		add(L.resume - 0.42, 'fs648729.mp3', 0.28);
	} else if (q.kind === 'museum' && q.gentle) {
		add(L.museumAt, 'fs648729.mp3', 0.28);
		add(L.museumAt + HUNG, 'kenney-impactWood_light_000.ogg', 0.34);
		add(L.adStart, 'kenney-impactSoft_heavy_000.ogg', 0.34); // bam
		add(L.pull, 'tap1.wav', 0.3);
		add(L.resume - 0.42, 'fs648729.mp3', 0.28);
	} else if (q.kind === 'museum') {
		add(L.museumAt, 'fs648729.mp3', 0.16);
		add(L.backT[1] ?? L.pull, 'tap1.wav', 0.3);
		add(L.resume - 0.4, 'fs648729.mp3', 0.22);
	} else if (q.kind === 'photo') {
		add(L.snapAt, 'fs338220.mp3', 0.5);
		add(L.pull, 'fs338219.mp3', 0.42);
		add(L.go - 0.02, 'fs648729.mp3', 0.3);
	} else if (q.kind === 'replay') {
		add(L.cardT[1], 'fs648729-rev.mp3', 0.4);
		add(L.go - 0.02, 'fs648729.mp3', 0.3);
		add(L.pull, 'fs648729.mp3', 0.26);
	} else if (q.kind === 'melt') {
		add(L.go, 'fs648729.mp3', 0.1); // barely there, and every bridge needs a sound track
		add(L.pull, 'fs648729.mp3', 0.1);
	} else {
		add(L.go - 0.02, 'fs648729.mp3', q.kind === 'whip' ? 0.42 : woosh);
		add(L.pull, 'fs648729.mp3', q.kind === 'whip' ? 0.38 : woosh * 0.85);
	}
	return out;
};

export const QuickBridge: React.FC<{id: string}> = ({id}) => {
	const q = QUICKS[id];
	const L = TLS[id];
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const tf = Math.floor(t * 50) / 50;
	const {inAt, cardT, cardW, inEnd, go, adStart, adEnd, pull, outAt, backT, backW, resume, frameAt, landAt, snapAt, museumAt, textOut} = L;
	const D = q.diveD ?? DUR[q.kind];
	const B = BACK[q.kind];
	const paused = t >= freeze && t < resume;
	const adSrc = staticFile(t < adEnd ? AD.first : AD.last);
	const fullAd: React.CSSProperties = {position: 'absolute', left: 0, top: 0, width: W, height: H};

	// Replay: what the source shows, and where the camera looks.
	const w1 = q.kind === 'replay' ? cardT[1] : 0;
	const thisAt = q.kind === 'replay' ? cardT[2] : 0;
	const replaying = q.kind === 'replay' && t >= w1 && t < inEnd;
	const replayS = t < thisAt ? lerp(VIDEO.freezeAt, VIDEO.freezeAt - REPLAY_BACK, glide(t, w1, thisAt - w1 - 0.04)) : lerp(VIDEO.freezeAt - REPLAY_BACK, VIDEO.freezeAt, clamp01((t - thisAt) / (inEnd - thisAt)));
	const head = q.kind === 'replay' ? headAt(replaying ? replayS : VIDEO.freezeAt) : VIDEO.head;
	const body = {x: head.x + 70, y: head.y + 85};

	// Camera. Board: a jump per card, a swing to the surface, the dive. Others around him, each its own way.
	const jumps = q.soft || q.still || !cardT.length ? 0 : cardT.reduce((a, at) => a + glide(t, at, 0.13), 0) / cardT.length;
	const isBoard = q.kind === 'board';
	const u0 = q.soft ? 0.05 : q.still ? 0 : 0.07; // what the camera has already moved by the time it swings: the swing makes up the rest, so it ends back at exactly 0
	const u = isBoard ? (q.soft ? 0.05 * glide(t, freeze - 0.3, 1.2) : u0 * jumps) + (U_HOLD - u0) * glide(t, frameAt - 0.03, q.soft ? 0.6 : q.gentle ? 0.8 : 0.3) + (1 - U_HOLD) * glide(t, go, D) - (1 - U_HOLD) * glide(t, pull, B) - U_HOLD * glide(t, resume - 0.4, 0.4) : 0;
	const s = Math.exp(u * Math.log(DIVE));
	const bx = lerp(C0.x, W / 2, u);
	const by = lerp(C0.y, H / 2, u);
	const toScreen = (x: number, y: number) => ({x: bx + (x - C0.x) * s, y: by + (y - C0.y) * s});
	const settle = 1 - glide(t, resume - 0.38, 0.38);
	let camera: React.CSSProperties = {};
	if (isBoard) {
		camera = {transformOrigin: '0 0', transform: `translate(${bx - C0.x * s}px, ${by - C0.y * s}px) scale(${s})`};
	} else if (q.kind === 'cut') {
		// The wait: it creeps in, faster and faster, and stays close when it comes back, until the video has gone on.
		const k = clamp01((t - freeze) / (go - freeze));
		camera = {transformOrigin: `${VIDEO.subject.x}px ${VIDEO.subject.y}px`, transform: `scale(${1 + (TALK ? 0.1 : 0.24) * k * k * (1 - glide(t, resume + 0.05, 0.7))})`};
	} else if (q.kind === 'thought') {
		camera = {transformOrigin: `${VIDEO.head.x}px ${VIDEO.head.y}px`, transform: `scale(${1 + (TALK ? 0.1 : 0.34) * glide(t, freeze + 0.02, 0.85) * settle})`};
	} else if (q.kind === 'replay') {
		camera = {transformOrigin: `${head.x}px ${head.y}px`, transform: `scale(${1 + 0.26 * glide(t, thisAt, 0.7) * settle})`};
	} else if (q.from === 'prick') {
		camera = {transformOrigin: `${PRICK.x}px ${PRICK.y}px`, transform: `scale(${1 + 0.24 * glide(t, freeze, 1.3) * settle})`};
	} else if (q.kind !== 'museum' && !LEAVES.includes(q.kind)) {
		const push = (1 + (q.soft ? 0.05 * glide(t, freeze - 0.4, 2.8) : 0.06 * jumps + 0.02 * glide(t, freeze, 1.5))) - (q.soft ? 0.05 : 0.08) * glide(t, resume - 0.35, 0.35);
		camera = {transformOrigin: `${VIDEO.subject.x}px ${VIDEO.subject.y}px`, transform: `scale(${push})`};
	}

	const away = isBoard ? glide(t, go, D) - glide(t, pull, B) : 0;
	const sp = Math.exp(u * Math.log(DIVE) * (1 + 0.35 * away));
	const personIn = 1 - glide(t, go + D * 0.28, D * 0.3) + glide(t, pull + B * 0.3, B * 0.34);
	const softPlay = q.soft && t >= resume && t < resume + SOFT_D;

	const scene = (
		<AbsoluteFill style={camera}>
			{q.soft ? (
				t < freeze && <SourceFrame s={softSource(t)} />
			) : (
				<>
					<Sequence durationInFrames={Math.round((freeze - 0.06) * fps)}>
						<OffthreadVideo src={staticFile(VIDEO.leadInClip)} muted={!TALK} />
					</Sequence>
					{t >= freeze - 0.06 && t < freeze && <SourceFrame s={VIDEO.leadIn + t * VIDEO.leadInRate} />}
				</>
			)}
			{paused && (replaying ? <SourceFrame s={replayS} /> : <Img src={staticFile(away > 0.001 ? PLATE : VIDEO.freeze)} style={fullAd} />)}
			{softPlay && <SourceFrame s={VIDEO.freezeAt + ((t - resume) * (t - resume)) / (2 * SOFT_D)} />}
			<Sequence from={Math.round((resume + (q.soft ? SOFT_D : 0)) * fps)}>
				<OffthreadVideo src={staticFile(VIDEO.clip)} trimBefore={Math.round((VIDEO.freezeAt + (q.soft ? SOFT_D / 2 : 0)) * fps)} muted={!TALK} />
			</Sequence>
		</AbsoluteFill>
	);

	// Board.
	const bloomK = isBoard ? glide(t, landAt, q.soft || q.gentle ? 0.5 : 0.3) - glide(t, resume - 0.32, 0.2) : 0;
	const bw = lerp(20 / s, BOARD.w, bloomK);
	const bh = lerp(20 / s, BOARD.h, isBoard ? glide(t, landAt, q.soft || q.gentle ? 0.4 : 0.22) - glide(t, resume - 0.32, 0.2) : 0);
	const led = 1 - glide(t, go + D * 0.5, D * 0.45) + glide(t, pull, B * 0.5);
	const poleAway = glide(t, go, D * 0.7) - glide(t, pull + B * 0.25, B * 0.7);

	// The moves that carry the whole picture away.
	const whip = q.kind === 'whip' ? glide(t, go, D) - glide(t, pull, B) : 0;
	const whipBlur = 70 * Math.sin(Math.PI * clamp01(whip));
	const zoomC = q.kind === 'zoomout' ? glide(t, go, D * 0.6) - glide(t, pull + B * 0.3, B * 0.7) : 0;
	const zoomE = q.kind === 'zoomout' ? glide(t, go + D * 0.55, D * 0.45) - glide(t, pull, B * 0.45) : 0;

	// Photo: it lands on the paper with a little weight, and is swiped away. "One more!" brings it back.
	const isPhoto = q.kind === 'photo';
	const printIn = isPhoto ? (t < adEnd ? Math.min(1.04, step(t - snapAt - 0.03, {response: 0.46, damping: 0.68})) : 1 - glide(t, pull + 0.24, 0.34)) : 0;
	const printOut = isPhoto ? glide(t, go - 0.02, D) - glide(t, pull, 0.3) : 0;
	const m = 26 * clamp01(printIn);

	// Museum: the picture hangs on the ad's paper, with a caption. Bam, the ad. Back on "It was."
	const isMuseum = q.kind === 'museum';
	const isGallery = Boolean(q.gallery);
	const hungAt = museumAt - 0.04 + HUNG;
	// Gallery: `hangK` is how far the camera has stepped back from the wall, `walk` where it stands along it.
	const hangK = isGallery
		? t < adStart
			? glide(t, museumAt - 0.04, 0.46) - glide(t, go + 0.5, D - 0.5)
			: t >= adEnd
				? glide(t, pull, 0.55) - glide(t, resume - 0.42, 0.42)
				: 0
		: isMuseum
			? t < adEnd
				? glide(t, museumAt - 0.04, 0.46)
				: t >= (backT[1] ?? pull)
					? 1 - glide(t, resume - 0.42, 0.42)
					: 0
			: 0;
	const walk = isGallery ? (t < adEnd ? glide(t, go, WALK_D) : 1 - glide(t, pull + 0.4, WALK_D)) : 0;
	const hangOn = isMuseum && (t < adStart || t >= (isGallery ? adEnd : backT[1] ?? pull));
	const hangPop = isMuseum && !isGallery && t >= adEnd ? step(t - (backT[1] ?? pull), {response: 0.24, damping: 0.72}) : 1;
	// It touches the wall and swings a little on its nail. It is never quite still until it moves on.
	const swing = q.gentle && isMuseum && t >= hungAt && t < adStart ? 0.5 * Math.exp(-3 * (t - hungAt)) * Math.sin((t - hungAt) * 2 * Math.PI * 1.5) : 0;
	const drift = q.gentle && isMuseum && t < adStart ? 0.016 * clamp01((t - hungAt) / Math.max(0.5, go - hungAt)) * (1 - glide(t, go, 0.4)) : 0;

	let picture: React.CSSProperties = {};
	if (q.kind === 'whip') picture = {transform: `translateX(${-whip * W}px)`, filter: whipBlur > 0.5 ? 'url(#whip)' : undefined};
	if (q.kind === 'zoomout') {
		const k = 1 - 0.74 * zoomC;
		picture = {transformOrigin: '0 0', transform: `translate(${64 * zoomC - W * 0.34 * zoomE}px, ${64 * zoomC}px) scale(${k})`, borderRadius: 34 * zoomC / Math.max(k, 0.2), overflow: 'hidden', boxShadow: zoomC > 0.01 ? '0 40px 120px rgba(0,0,0,0.3)' : undefined};
	}
	if (isPhoto) {
		const k = 1 - 0.42 * printIn;
		picture = {transformOrigin: '50% 50%', transform: `translate(${printOut * printOut * W * 1.25}px, ${-20 * printIn}px) rotate(${-5 * printIn + 22 * printOut}deg) scale(${k})`};
	}
	if (isMuseum) {
		const k = (1 - 0.42 * hangK) * (1 + drift);
		// The same place on the wall as the plain museum: the only difference is that the wall goes on to the right.
		picture = isGallery
			? {transformOrigin: '0 0', transform: `translate(${W / 2 - k * (walk * (W + GAP) + W / 2)}px, ${H / 2 - 118 * hangK - (k * H) / 2}px) scale(${k})`, opacity: hangOn ? 1 : 0}
			: {transformOrigin: '50% 50%', transform: `translateY(${-118 * hangK}px) scale(${k * lerp(0.92, 1, hangPop)})`, opacity: hangOn ? 1 : 0};
	}
	// Door: it opens away from us onto the ad, on its hinge at the left. Two knocks shake it a little first.
	const isDoor = q.kind === 'door';
	const doorK = isDoor ? (t < adEnd ? glide(t, go, D) : 1 - glide(t, resume - B, B)) : 0;
	if (isDoor) {
		const knocks = [0.14, 0.38].reduce((a, at) => a + (t >= freeze + at ? 0.007 * Math.exp(-14 * (t - freeze - at)) : 0), 0);
		const near = t < adStart ? 0.016 * clamp01((t - freeze) / Math.max(0.5, go - freeze)) : 0;
		picture = {transformOrigin: '0 50%', transform: `perspective(2600px) rotateY(${92 * doorK}deg) scale(${1 + knocks + near})`, backfaceVisibility: 'hidden'};
	}
	// Swipe: the next video in the feed comes up from below.
	const isSwipe = q.kind === 'swipe';
	const swipeK = isSwipe ? (t < adEnd ? glide(t, go, D) : 1 - glide(t, resume - B, B)) : 0;
	if (isSwipe) picture = {transform: `translateY(${-swipeK * (H + 16)}px) scale(${1 + (t < adStart ? 0.016 * clamp01((t - freeze) / Math.max(0.5, go - freeze)) : 0)})`};
	// Tilt: the camera looks up. Whatever is above the picture comes down into the frame, with a little keystone on the way.
	const isTilt = q.kind === 'tilt';
	const tiltK = isTilt ? (t < adEnd ? weighty(t, go, D) : 1 - weighty(t, resume - B, B)) : 0;
	const tiltArc = Math.sin(Math.PI * clamp01(tiltK));
	const tiltBlur = 42 * tiltArc * tiltArc;
	const tiltAt = (y: number) => `perspective(2600px) rotateX(${-5 * tiltArc}deg) translateY(${y}px)`;
	if (isTilt) picture = {transform: tiltAt(tiltK * (H + TILT_GAP)), filter: tiltBlur > 0.5 ? 'url(#tilt)' : undefined};
	// Flip: the ad is on the back of the picture. The way back goes on in the same direction, a full turn.
	const isFlip = q.kind === 'flip';
	const flipK = isFlip ? (t < adEnd ? weighty(t, go, D) : 1 + weighty(t, resume - B, B)) : 0;
	const flipDeg = 180 * flipK;
	const flipLift = 1 - 0.2 * Math.abs(Math.sin(Math.PI * flipK));
	const flipFront = Math.cos((flipDeg * Math.PI) / 180) > 0;
	const flipShade = 0.5 * Math.abs(Math.sin((flipDeg * Math.PI) / 180));
	if (isFlip) picture = {transform: `perspective(2400px) rotateY(${flipDeg}deg) scale(${flipLift})`, opacity: flipFront ? 1 : 0};
	// Fold: the picture opens at its crease. A slit of the ad first.
	const isFold = q.kind === 'fold';
	const foldK = isFold ? (t < adEnd ? 0.018 * glide(t, go - 0.3, 0.2) + 0.982 * glide(t, go, D * 0.94) : 1 - 0.982 * glide(t, resume - B, B * 0.92) - 0.018 * glide(t, resume - 0.16, 0.14)) : 0;
	const foldOn = isFold && foldK > 0.0005;
	if (isFold && foldOn) picture = {opacity: 0};
	// Split: a divider between him and the ad, `splitV` of the screen is his.
	const isSplit = q.kind === 'split';
	const splitV = isSplit
		? t < adEnd
			? L.stepT.reduce((v, at, i) => lerp(v, q.steps![i].x, Math.min(1, step(t - at, {response: 0.34, damping: 0.72}))), 1) * (1 - weighty(t, go, D))
			: weighty(t, resume - B, B)
		: 1;
	const splitOn = isSplit && t >= freeze && splitV < 0.9995;
	const splitEdge = clamp01(Math.min(splitV, 1 - splitV) / 0.05);
	if (splitOn) picture = {opacity: 0};
	// Blink: the eyelids. `eye` is how open it is. It closes on one picture and opens on the other, out of focus.
	const isBlink = q.kind === 'blink';
	const lidCycle = (t0: number) => 1 - glide(t, t0, 0.2) + 0.55 * glide(t, t0 + 0.34, 0.2) - 0.14 * glide(t, t0 + 0.54, 0.09) + 0.59 * glide(t, t0 + 0.63, 0.32);
	const flutter = isBlink && q.in ? 0.3 * Math.sin(Math.PI * clamp01((t - (inEnd - 0.26)) / 0.22)) : 0;
	const eye = isBlink ? (t < adEnd ? (t < go ? 1 - (t > inEnd - 0.26 ? flutter : 0) : lidCycle(go)) : t < resume - B ? 1 : lidCycle(resume - B)) : 1;
	const eyeOnAd = isBlink && t >= go + 0.27 && t < resume - B + 0.27;
	const eyeBlur = isBlink ? 16 * (1 - clamp01(eye)) * (t < adEnd ? glide(t, go + 0.27, 0.01) : 1) : 0;
	if (isBlink) picture = {opacity: eyeOnAd ? 0 : 1, filter: !eyeOnAd && t >= adEnd && eyeBlur > 0.3 ? `blur(${eyeBlur}px)` : undefined};
	// Fall: it slips off one nail, swings, falls. It comes back up crooked and gets straightened.
	const isFall = q.kind === 'fall';
	const slipAt = freeze + 0.06;
	const slip = isFall && t >= slipAt ? 4.4 * (1 - Math.exp(-7 * (t - slipAt)) * Math.cos((t - slipAt) * 2 * Math.PI * 2.2)) : 0;
	const fallTau = isFall ? clamp01((t - go) / D) : 0;
	const riseAt = resume - B;
	const riseK = isFall && t >= adEnd ? glide(t, riseAt, 0.6) : 0;
	const straighten = isFall && t >= adEnd ? step(t - riseAt - 0.74, {response: 0.2, damping: 0.62}) : 0;
	if (isFall) {
		picture = t < adEnd
			? {transformOrigin: '0 0', transform: `translateY(${fallTau * fallTau * H * 1.5}px) rotate(${slip + 13 * fallTau}deg)`, boxShadow: `0 40px 110px rgba(0,0,0,${0.4 * clamp01((t - freeze) * 4)})`}
			: {transformOrigin: '50% 50%', transform: `translateY(${(1 - riseK) * H * 1.3}px) rotate(${(1 - straighten) * (-3 + 8 * (1 - riseK))}deg)`, boxShadow: straighten < 0.98 ? '0 40px 110px rgba(0,0,0,0.4)' : undefined};
	}
	// Peel: the picture is the film on a new phone. A corner lifts, then it comes off, folded along a moving line.
	const isPeel = q.kind === 'peel';
	const peelAngle = (((isPeel && t < adEnd ? lerp(38, 30, glide(t, go, D)) : 34)) * Math.PI) / 180;
	const peelD = {x: Math.cos(peelAngle), y: Math.sin(peelAngle)};
	const peelMax = W * peelD.x + H * peelD.y + 60;
	const lifted = isPeel && q.in ? (92 + 7 * Math.sin((t - cardT[0]) * 5.4)) * glide(t, cardT[0] + 0.08, 0.7) : 0;
	const peelP = isPeel ? (t < adEnd ? lerp(lifted, peelMax, Math.pow(glide(t, go, D), 1.25)) : peelMax * (1 - glide(t, resume - B, B))) : 0;
	const peelOn = isPeel && peelP > 0.5;
	if (peelOn) picture = {opacity: 0};
	// Closer: a step of the camera on each word, then right in.
	const isCloser = q.kind === 'closer';
	const TARGET = SPOTV.target ?? VIDEO.subject;
	const closerU = isCloser
		? t < adEnd
			? cardT.reduce((a, at, i) => a + [0.3, 0.42, 0.5][i] * glide(t, at - 0.02, 0.36), 0) + 1.6 * Math.pow(glide(t, go, D), 1.5)
			: 2.82 * (1 - glide(t, resume - B, B))
		: 0;
	const closerZ = Math.exp(closerU);
	const closerC = {x: lerp(TARGET.x, W / 2, 1 - 1 / closerZ), y: lerp(TARGET.y, H / 2, 1 - 1 / closerZ)};
	const closerOpen = isCloser ? (t < adEnd ? glide(t, go + D * 0.42, D * 0.58) : 1 - glide(t, resume - B, B * 0.6)) : 0;
	if (isCloser) picture = {transformOrigin: '0 0', transform: `translate(${closerC.x - TARGET.x * closerZ}px, ${closerC.y - TARGET.y * closerZ}px) scale(${closerZ})`, filter: closerZ > 4 ? `blur(${Math.min(9, (closerZ - 4) * 1.6)}px)` : undefined};
	const overPicture = LEAVES.includes(q.kind);

	const under = q.kind === 'zoomout' ? zoomC > 0.001 : isPhoto ? printIn > 0.001 : isMuseum ? hangK > 0.001 || (t >= adEnd && t < resume) : isDoor ? doorK > 0.001 : isFall ? t >= freeze : false;

	// Thought: glass, then the glass opens into the ad, whose paper fills it.
	const isThought = q.kind === 'thought';
	const lineCount = isThought ? 1 + (q.cards.length > 1 ? glide(t, cardT[1] - 0.05, 0.22) : 0) : 1;
	const backLines = isThought && t >= pull ? 1 + (q.back.length > 1 ? glide(t, backT[1] - 0.05, 0.22) : 0) : 0;
	const LINE = 76;
	const widest = (cards: Card[]) => Math.max(...cards.map((c) => textWidth(c.text, 62, -0.02)));
	const bubbleW = (t < adEnd ? widest(q.cards.length ? q.cards : [{text: ' '}]) : widest(q.back.length ? q.back : [{text: ' '}])) + 110;
	const bubbleH = 48 + LINE * (t < adEnd ? lineCount : Math.max(1, backLines));
	const bubble = {r: VIDEO.head.x - 64, b: VIDEO.head.y - 78};
	const opens = isThought ? glide(t, go, D) - glide(t, pull, B) : 0;
	const dotsIn = (delay: number) => (isThought ? step(t - inAt + 0.04 - delay, {response: 0.24, damping: 0.72}) * (1 - glide(t, resume - 0.22, 0.2)) : 0);
	const tb = {x: lerp(bubble.r - bubbleW, 0, opens), y: lerp(bubble.b - bubbleH, 0, opens), w: lerp(bubbleW, W, opens), h: lerp(bubbleH, H, opens), r: lerp(bubbleH / 2, 0, opens)};
	const filled = isThought ? glide(t, go, 0.16) - glide(t, pull + B - 0.16, 0.16) : 0;

	// Replay's sponsor band: runs in from the left, then opens up into the ad. One shape.
	const isReplay = q.kind === 'replay';
	const bandRun = isReplay ? glide(t, thisAt - 0.06, 0.32) - glide(t, pull + B, 0.22) : 0;
	const bandOpen = isReplay ? glide(t, go, D) - glide(t, pull, B) : 0;
	const band = {x: 0, y: lerp(792, 0, bandOpen), w: W * bandRun, h: lerp(132, H, bandOpen)};

	// Flood: the ad opens out of a point.
	const flood = q.kind === 'flood' ? glide(t, go, D) - glide(t, pull, B) : 0;
	const origin = q.from === 'prick' ? PRICK : q.from === 'button' ? PLAY_BTN : q.from === 'center' ? {x: W / 2, y: H / 2} : VIDEO.head;
	const melt = q.kind === 'melt' ? glide(t, go, D) - glide(t, pull, B) : 0;
	const dotOn = q.from === 'prick' && ((t >= cardT[0] + 0.3 && t < go + 0.08) || (t >= pull + B - 0.08 && t < resume - 0.02));

	const flashW = !q.soft && !q.gentle && !isPhoto && t >= freeze && t < freeze + 0.1 ? 0.34 * (1 - (t - freeze) / 0.1) : isPhoto && t >= snapAt + 0.04 && t < snapAt + 0.2 ? 0.95 * (1 - (t - snapAt - 0.04) / 0.16) : isPhoto && t >= pull && t < pull + 0.12 ? 0.6 * (1 - (t - pull) / 0.12) : 0;
	const blink = isPhoto && t >= snapAt && t < snapAt + 0.04; // the shutter closes for an instant
	const fadeFrom = isPhoto ? snapAt : isMuseum ? museumAt : isSplit || isFall || isPeel || isCloser || isBlink ? freeze : overPicture ? go - 0.2 : go;
	// A picture on the wall has no player: it only comes back once the picture fills the screen again.
	const controlsBack = (isMuseum && q.gentle) || overPicture ? glide(t, resume - 0.06, 0.2) : glide(t, resume - 0.4, 0.3);
	const controls = (1 - glide(t, fadeFrom, 0.25) + controlsBack - glide(t, resume + 1.2, 0.4)) * ((isMuseum || overPicture) && t >= adStart && t < resume - 0.4 ? 0 : 1);
	const above = toScreen(C0.x, FRAME.y0 - 92 / s);
	const wordsUntil = isBoard ? go + 0.1 : isPhoto ? go + D : isGallery ? go + 0.34 : q.kind === 'cut' || isMuseum ? adStart : go + 0.04;
	// Gallery: the caption is on the wall under the picture, it leaves with it.
	const onWall: React.CSSProperties = isGallery ? {transform: `translateX(${-walk * (W + GAP) * 0.58}px)`, opacity: t < adEnd ? 1 - glide(t, go, 0.3) : 1} : {};

	const cardAt = (ts: number[]) => {
		let i = -1;
		ts.forEach((x, k) => {
			if (t >= x) i = k;
		});
		return i;
	};
	const ci = t < wordsUntil ? cardAt(cardT) : -1;
	const bi = t >= pull && t < textOut ? cardAt(backT) : -1;
	const placeOf = (c: Card) => {
		if (c.caption) return {x: isSplit ? (splitV * W) / 2 : W / 2, y: CAPTION_Y};
		if (c.ink) return {x: W / 2, y: 82};
		// nearFrame: on the surface's side of the picture, and still, so the moving camera never slides it onto the person.
		const at = c.nearFrame ? {x: lerp(C0.x, W / 2, U_HOLD), y: SKY.y} : c.frame ? above : SKY;
		// Never out of the frame, wherever the surface is.
		const half = (textWidth(c.text, c.size ?? sizeFor(c.text), -0.02) * (c.face === 1 || c.face === 2 ? 1 : 1.05)) / 2 + 40;
		return {x: Math.max(half, Math.min(W - half, at.x)), y: at.y};
	};
	const sizeOf = (c: Card) => c.size ?? (c.caption ? 118 : c.ink ? 118 : undefined);

	return (
		<AbsoluteFill style={{background: q.kind === 'whip' ? PAPER : INK, overflow: 'hidden'}}>
			<svg width={0} height={0} style={{position: 'absolute'}}>
				<filter id="whip">
					<feGaussianBlur stdDeviation={`${whipBlur} 0`} />
				</filter>
				<filter id="tilt">
					<feGaussianBlur stdDeviation={`0 ${tiltBlur}`} />
				</filter>
			</svg>
			{under && (isMuseum && (t < adEnd || isGallery) ? <AbsoluteFill style={{background: PAPER}} /> : <Img src={adSrc} style={fullAd} />)}
			{isDoor && doorK > 0.001 && <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 520, background: 'linear-gradient(90deg, rgba(0,0,0,0.42), transparent)', opacity: Math.sin(Math.PI * clamp01(doorK))}} />}
			{isSwipe && swipeK > 0.001 && <Img src={adSrc} style={{...fullAd, top: (H + 16) * (1 - swipeK)}} />}
			{q.kind === 'whip' && whip > 0.001 && <Img src={adSrc} style={{...fullAd, left: W - whip * W, filter: whipBlur > 0.5 ? 'url(#whip)' : undefined}} />}
			{isTilt && tiltK > 0.001 && <Img src={adSrc} style={{...fullAd, transform: tiltAt((tiltK - 1) * (H + TILT_GAP)), filter: tiltBlur > 0.5 ? 'url(#tilt)' : undefined}} />}
			{isFlip && !flipFront && (
				<div style={{...fullAd, transform: `perspective(2400px) rotateY(${flipDeg - 180}deg) scale(${flipLift})`}}>
					<Img src={adSrc} style={fullAd} />
					<AbsoluteFill style={{background: '#000', opacity: flipShade}} />
				</div>
			)}
			{foldOn && (
				<>
					<Img src={adSrc} style={{...fullAd, transform: `scale(${0.95 + 0.05 * foldK})`}} />
					<div style={{...fullAd, background: 'linear-gradient(90deg, rgba(0,0,0,0.5), transparent 26%, transparent 74%, rgba(0,0,0,0.5))', opacity: Math.sin(Math.PI * clamp01(foldK))}} />
					{[0, 1].map((side) => {
						const deg = 104 * foldK;
						if (deg >= 90) return null;
						return (
							<div key={side} style={{position: 'absolute', top: 0, left: side ? W / 2 : 0, width: W / 2, height: H, overflow: 'hidden', transformOrigin: side ? '100% 50%' : '0 50%', transform: `perspective(2400px) rotateY(${side ? deg : -deg}deg)`}}>
								<Img src={staticFile(VIDEO.freeze)} style={{...fullAd, left: side ? -W / 2 : 0}} />
								<div style={{position: 'absolute', inset: 0, background: `linear-gradient(${side ? 90 : 270}deg, rgba(255,255,255,${0.14 * Math.min(1, foldK * 20)}), transparent 12%)`}} />
								<AbsoluteFill style={{background: '#000', opacity: 0.55 * foldK}} />
							</div>
						);
					})}
				</>
			)}
			{splitOn && (() => {
				const m = 10 * splitEdge;
				const g = 14 * splitEdge;
				const r = 30 * splitEdge;
				const x = splitV * W;
				const leftW = Math.max(0, x - m - g / 2);
				const rightW = Math.max(0, W - x - m - g / 2);
				return (
					<AbsoluteFill style={{background: '#000'}}>
						<div style={{position: 'absolute', left: m, top: m, width: leftW, height: H - 2 * m, overflow: 'hidden', borderRadius: r}}>
							<Img src={staticFile(VIDEO.freeze)} style={{...fullAd, left: (leftW - W) / 2, top: -m}} />
							{cardT.length > 0 && <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 480, background: 'linear-gradient(transparent, rgba(0,0,0,0.5))', opacity: glide(t, cardT[0] - 0.1, 0.25) * (1 - glide(t, go, 0.2))}} />}
						</div>
						<div style={{position: 'absolute', left: x + g / 2, top: m, width: rightW, height: H - 2 * m, overflow: 'hidden', borderRadius: r}}>
							<Img src={adSrc} style={{...fullAd, left: (rightW - W) / 2, top: -m}} />
						</div>
						{q.pill && <div style={{position: 'absolute', left: x - 5, top: H / 2 - 52, width: 10, height: 104, borderRadius: 5, background: '#fff', opacity: 0.9 * splitEdge, boxShadow: '0 2px 14px rgba(0,0,0,0.5)'}} />}
					</AbsoluteFill>
				);
			})()}
			{eyeOnAd && <Img src={adSrc} style={{...fullAd, filter: eyeBlur > 0.3 ? `blur(${eyeBlur}px)` : undefined}} />}
			{peelOn && (() => {
				const P = {x: W - peelP * peelD.x, y: H - peelP * peelD.y};
				const dot = 2 * (P.x * peelD.x + P.y * peelD.y);
				const matrix = `matrix(${1 - 2 * peelD.x * peelD.x}, ${-2 * peelD.x * peelD.y}, ${-2 * peelD.x * peelD.y}, ${1 - 2 * peelD.y * peelD.y}, ${dot * peelD.x}, ${dot * peelD.y})`;
				const deg = (peelAngle * 180) / Math.PI;
				const len = Math.abs(W * peelD.x) + Math.abs(H * peelD.y);
				const fold = (P.x - W / 2) * peelD.x + (P.y - H / 2) * peelD.y + len / 2;
				return (
					<>
						<Img src={adSrc} style={fullAd} />
						<div style={{position: 'absolute', left: P.x, top: P.y - 1600, width: 260, height: 3200, transformOrigin: '0 50%', transform: `rotate(${deg}deg)`, background: 'linear-gradient(90deg, rgba(0,0,0,0.46), transparent)'}} />
						{halfPlane(SHEET, P, peelD, -1).length > 2 && <Img src={staticFile(VIDEO.freeze)} style={{...fullAd, clipPath: polygon(halfPlane(SHEET, P, peelD, -1))}} />}
						<div style={{position: 'absolute', left: P.x - 120, top: P.y - 1600, width: 120, height: 3200, transformOrigin: '100% 50%', transform: `rotate(${deg}deg)`, background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.2))'}} />
						{halfPlane(SHEET, P, peelD, 1).length > 2 && (
							<div style={{...fullAd, filter: 'drop-shadow(-16px -12px 34px rgba(0,0,0,0.42))'}}>
								<div style={{...fullAd, transformOrigin: '0 0', transform: matrix, clipPath: polygon(halfPlane(SHEET, P, peelD, 1)), background: `linear-gradient(${deg + 90}deg, #ffffff ${fold}px, #f1f4f6 ${fold + 46}px, #d5dbe0 ${fold + 240}px, #e6eaed ${fold + 560}px)`}}>
									<Img src={staticFile(VIDEO.freeze)} style={{...fullAd, opacity: 0.1}} />
								</div>
							</div>
						)}
					</>
				);
			})()}

			<AbsoluteFill style={picture}>
				{isPhoto && printIn > 0.001 && <div style={{position: 'absolute', left: -m, top: -m, right: -m, bottom: -m * 4.2, background: '#fff', boxShadow: `0 ${50 * printIn}px ${130 * printIn}px rgba(0,0,0,0.3)`}} />}
				<AbsoluteFill style={swing ? {transformOrigin: '50% -8%', transform: `rotate(${swing}deg)`} : undefined}>
					{isMuseum && hangK > 0.001 && <div style={{position: 'absolute', inset: -18 * hangK, background: '#141414', boxShadow: `0 ${40 * hangK}px ${120 * hangK}px rgba(0,0,0,0.28)`}} />}
					<AbsoluteFill style={{overflow: 'hidden'}}>{scene}</AbsoluteFill>
				</AbsoluteFill>
				{isDoor && doorK > 0.001 && <AbsoluteFill style={{background: '#000', opacity: 0.34 * clamp01(doorK)}} />}
				{isGallery && (
					<div style={{position: 'absolute', left: W + GAP, top: 0, width: W, height: H}}>
						{hangK > 0.001 && <div style={{position: 'absolute', inset: -18 * hangK, background: '#141414', boxShadow: `0 ${40 * hangK}px ${120 * hangK}px rgba(0,0,0,0.28)`}} />}
						<Img src={adSrc} style={fullAd} />
					</div>
				)}
				{isBoard && bloomK > 0.001 && paused && (
					<AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${bx - C0.x * s}px, ${by - C0.y * s}px) scale(${s})`}}>
						<div style={{position: 'absolute', left: BOARD.x - 190, top: BOARD.y - 140, width: BOARD.w + 380, height: BOARD.h + 320, background: 'radial-gradient(closest-side, rgba(255,236,214,0.38), transparent)', mixBlendMode: 'screen', opacity: bloomK * led}} />
						<div style={{position: 'absolute', left: BOARD.x, top: BOARD.y, width: BOARD.w, height: BOARD.h, overflow: 'hidden', clipPath: `inset(${(BOARD.h - bh) / 2}px ${(BOARD.w - bw) / 2}px round ${lerp(10 / s, 1.5, bloomK)}px)`}}>
							<Img src={adSrc} style={{width: '100%', height: '100%'}} />
							<div style={{position: 'absolute', inset: 0, boxShadow: 'inset 0 0 8px rgba(0,0,0,0.35)', opacity: led}} />
						</div>
						{POLE && <Img src={staticFile(VIDEO.freeze)} style={{...fullAd, clipPath: `inset(${POLE.y}px ${W - POLE.x - POLE.w}px ${H - POLE.y - POLE.h}px ${POLE.x}px)`, transform: `translateX(${-poleAway * 260}px)`, opacity: 1 - poleAway}} />}
					</AbsoluteFill>
				)}
				{isBoard && paused && personIn > 0.001 && (
					<AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${bx - C0.x * sp}px, ${by - C0.y * sp}px) scale(${sp})`, opacity: clamp01(personIn)}}>
						<Img src={staticFile(PERSON)} style={fullAd} />
					</AbsoluteFill>
				)}
			</AbsoluteFill>

			{isCloser && closerOpen > 0.001 && <Img src={adSrc} style={{...fullAd, clipPath: `inset(${((1 - closerOpen) * H) / 2}px ${((1 - closerOpen) * W) / 2}px round ${60 * (1 - closerOpen)}px)`}} />}
			{isFlip && flipFront && flipShade > 0.01 && <AbsoluteFill style={{background: '#000', opacity: flipShade, transform: picture.transform}} />}
			{isPhoto && t >= freeze && t < snapAt && (
				<>
					<Viewfinder t={t} at={freeze} out={snapAt} a={{x: VIDEO.box.x0, y: VIDEO.box.y0}} b={{x: VIDEO.box.x1, y: VIDEO.box.y1}} />
					{/* the focus hunts, then locks */}
					<div style={{position: 'absolute', left: VIDEO.head.x - 62, top: VIDEO.head.y - 62, width: 124, height: 124, border: `4px solid ${t > snapAt - 0.32 ? PALETTE.orange : WHITE}`, borderRadius: 6, transform: `scale(${t > snapAt - 0.32 ? 1 : 1.26 - 0.26 * ((t - freeze) * 5 % 1)})`, boxShadow: '0 1px 8px rgba(0,0,0,0.4)'}} />
				</>
			)}
			{dotOn && (
				<>
					<div style={{position: 'absolute', left: PRICK.x - 15, top: PRICK.y - 15, width: 30, height: 30, borderRadius: 15, background: PALETTE.orange, boxShadow: '0 0 0 3px rgba(255,255,255,0.9), 0 2px 12px rgba(0,0,0,0.4)', transform: `scale(${step(t - (t < pull ? cardT[0] + 0.3 : pull + B - 0.08), {response: 0.2, damping: 0.65})})`}} />
					{t < go && <div style={{position: 'absolute', left: PRICK.x - 40, top: PRICK.y - 40, width: 80, height: 80, borderRadius: 40, border: '3px solid rgba(255,255,255,0.9)', opacity: 1 - clamp01((t - cardT[0] - 0.3) / 0.5), transform: `scale(${0.3 + clamp01((t - cardT[0] - 0.3) / 0.5)})`}} />}
				</>
			)}

			{isReplay && replaying && (
				<div style={{position: 'absolute', left: 54, top: 50, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderRadius: 10, background: 'rgba(10,10,12,0.72)', fontFamily, fontWeight: 700, fontSize: 30, letterSpacing: '0.04em', color: WHITE}}>
					{t < thisAt ? <span>◀◀</span> : <span style={{width: 16, height: 16, borderRadius: 8, background: '#ff2d2d'}} />}
					REPLAY
				</div>
			)}
			{isReplay && t >= thisAt && t < go + 0.06 && (
				<svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: glide(t, thisAt, 0.15) * (1 - glide(t, go, 0.08)), filter: 'drop-shadow(0 1px 8px rgba(0,0,0,0.5))'}}>
					<polyline points={Array.from({length: 24}, (_, i) => VIDEO.freezeAt - REPLAY_BACK + ((replayS - (VIDEO.freezeAt - REPLAY_BACK)) * i) / 23).map((x) => headAt(x)).map((p) => `${p.x + 70},${p.y + 85}`).join(' ')} fill="none" stroke={PALETTE.orange} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
					<circle cx={body.x} cy={body.y} r={150} fill="none" stroke={WHITE} strokeWidth={7} strokeDasharray="26 18" transform={`rotate(${(t - thisAt) * 90} ${body.x} ${body.y})`} />
				</svg>
			)}

			{flood > 0.001 && <Img src={adSrc} style={{...fullAd, clipPath: `circle(${Math.sqrt(flood) * far(origin.x, origin.y)}px at ${origin.x}px ${origin.y}px)`}} />}
			{melt > 0.001 && <Img src={adSrc} style={{...fullAd, opacity: melt, transform: `scale(${1.03 - 0.03 * melt})`}} />}

			{isThought && dotsIn(0) > 0.001 && (
				<>
					{opens < 0.3 && (
						<>
							<div style={{position: 'absolute', left: VIDEO.head.x - 48, top: VIDEO.head.y - 42, width: 20, height: 20, borderRadius: 10, ...glass(true), transform: `scale(${dotsIn(0)})`}} />
							<div style={{position: 'absolute', left: VIDEO.head.x - 80, top: VIDEO.head.y - 74, width: 34, height: 34, borderRadius: 17, ...glass(true), transform: `scale(${dotsIn(0.07)})`}} />
						</>
					)}
					<div style={{position: 'absolute', left: tb.x, top: tb.y, width: tb.w, height: tb.h, borderRadius: tb.r, overflow: 'hidden', ...glass(true), transformOrigin: '100% 100%', transform: `scale(${dotsIn(0.14)})`}}>
						<div style={{position: 'absolute', inset: 0, background: PAPER, opacity: filled}} />
						<Img src={adSrc} style={{position: 'absolute', left: -tb.x, top: -tb.y, width: W, height: H, opacity: filled}} />
						{opens < 0.15 && t < resume - 0.2 && (
							<div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily, fontWeight: 700, fontSize: 62, lineHeight: `${LINE - 6}px`, letterSpacing: '-0.02em', color: WHITE, whiteSpace: 'pre', textShadow: '0 1px 14px rgba(0,0,0,0.35)', opacity: 1 - filled}}>
								{t < adEnd
									? q.cards.map((c, i) => t >= cardT[i] - 0.03 && <div key={i}><Revealed t={t} text={c.text} starts={cardW[i]} /></div>)
									: q.back.map((c, i) => t >= backT[i] - 0.03 && <div key={i} style={{opacity: glide(t, backT[i] - 0.03, 0.08)}}>{c.text}</div>)}
							</div>
						)}
					</div>
				</>
			)}

			{isReplay && bandRun > 0.001 && (
				<div style={{position: 'absolute', left: band.x, top: band.y, width: band.w, height: band.h, overflow: 'hidden', background: PAPER, boxShadow: '0 16px 60px rgba(0,0,0,0.3)'}}>
					<Img src={adSrc} style={{position: 'absolute', left: 0, top: -band.y, width: W, height: H, opacity: bandOpen > 0.001 ? 1 : 0}} />
					<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, background: PALETTE.orange, opacity: 1 - bandOpen}} />
					{t < go + 0.04 && t >= thisAt - 0.03 && (
						<div style={{position: 'absolute', left: 74, top: 0, height: 132, display: 'flex', alignItems: 'center', whiteSpace: 'pre', fontFamily, fontWeight: 700, fontSize: 66, letterSpacing: '-0.025em', color: INK}}>
							<Revealed t={t} text={q.cards[2].text} starts={cardW[2]} />
						</div>
					)}
				</div>
			)}

			{isBoard && <Viewfinder t={t} at={frameAt} out={go - 0.06} a={toScreen(FRAME.x0, FRAME.y0)} b={toScreen(FRAME.x1, FRAME.y1)} soft={q.soft} lands={q.gentle} />}

			{overPicture && !isDoor && !isSwipe && !splitOn && cardT.length > 0 && t < go + 0.2 && <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 480, background: 'linear-gradient(transparent, rgba(0,0,0,0.5))', opacity: glide(t, cardT[0] - 0.1, 0.25) * (1 - glide(t, go, 0.2))}} />}
			{ci >= 0 && !isThought && !(isReplay && ci === 2) && (
				<AbsoluteFill style={onWall}>
					<Words t={t} card={q.cards[ci]} at={cardT[ci]} until={cardT[ci + 1] ?? wordsUntil} starts={cardW[ci]} x={placeOf(q.cards[ci]).x} y={placeOf(q.cards[ci]).y} soft={(q.soft || q.gentle) && !q.cards[ci].reveal} size={sizeOf(q.cards[ci])} color={overPicture ? WHITE : undefined} />
				</AbsoluteFill>
			)}
			{bi >= 0 && !isThought && (
				<AbsoluteFill style={onWall}>
					<Words t={t} card={q.back[bi]} at={backT[bi]} until={backT[bi + 1] ?? textOut} starts={backW[bi]} x={placeOf(q.back[bi]).x} y={placeOf(q.back[bi]).y} soft={q.soft} size={sizeOf(q.back[bi])} color={overPicture && !isDoor && !isSwipe ? (AD.lastDark ? WHITE : INK) : undefined} />
				</AbsoluteFill>
			)}

			{isBlink && eye < 0.995 && (
				eye < 0.015 ? (
					<AbsoluteFill style={{background: '#090403'}} />
				) : (
					<div style={{position: 'absolute', left: W / 2 - W * 0.92, top: H / 2 - eye * H * 1.02, width: W * 1.84, height: eye * H * 2.04, borderRadius: '50%', boxShadow: '0 0 130px 2200px #090403'}} />
				)
			)}
			{flashW > 0 && <AbsoluteFill style={{background: WHITE, opacity: flashW}} />}
			{blink && <AbsoluteFill style={{background: '#000'}} />}
			<Player controls={clamp01(controls)} progress={clamp01((SHOWN.at + VIDEO.freezeAt) / SHOWN.length)} paused={paused} press={0} time={SHOWN.at + (t < freeze ? VIDEO.leadIn + tf * VIDEO.leadInRate : t < resume ? VIDEO.freezeAt : VIDEO.freezeAt + (tf - resume))} length={SHOWN.length} />

			{q.in && (
				<Sequence from={Math.round(inAt * fps)}>
					<Audio src={staticFile(V.line(q.in).file)} volume={TALK ? VOICE_UP : q.soft ? 0.9 : 1} />
				</Sequence>
			)}
			{q.out && (
				<Sequence from={Math.round(outAt * fps)}>
					<Audio src={staticFile(V.line(q.out).file)} volume={TALK ? VOICE_UP : q.soft ? 0.9 : 1} />
				</Sequence>
			)}
			{sfxFor(q, L).map((e, i) => (
				<Sequence key={i} from={Math.round(e.t * fps)}>
					<Audio src={staticFile(`sfx/${e.src}`)} volume={e.volume} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};
