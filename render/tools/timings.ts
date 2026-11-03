// Prints a composition's timeline as JSON, for the render script: npx tsx tools/timings.ts [comp]
import {AD, T, TOTAL} from '../src/ad';
import {TL as BILLBOARD, TLS as BILLBOARDS} from '../src/templates/Billboard';
import {TL as DIVE} from '../src/templates/Dive';
import {TLS as GAGS} from '../src/templates/Gag';
import {TLS as THOUGHTS} from '../src/templates/ThoughtScript';
import {TL as HUSH} from '../src/templates/Hush';
import {TLS as QUICKS} from '../src/templates/Quick';
import {TL as REPLAY} from '../src/templates/Replay';
import {TL as SQUEEZE} from '../src/templates/Squeeze';
import {TL as THOUGHT} from '../src/templates/Thought';

type TL = {adStart: number; total: number; adRect?: {x: number; y: number; w: number; h: number; r: number}};
const ALL: Record<string, TL> = {MotionAd: {adStart: T.adStart, total: TOTAL}, Replay: REPLAY, Thought: THOUGHT, Squeeze: SQUEEZE, Hush: HUSH, Billboard: BILLBOARD, Dive: DIVE, ...Object.fromEntries(Object.entries(QUICKS).map(([k, v]) => [`Quick-${k}`, v])), ...Object.fromEntries(Object.entries(BILLBOARDS).map(([k, v]) => [`Billboard-${k}`, v])), ...Object.fromEntries(Object.entries(GAGS).map(([k, v]) => [`Gag-${k}`, v])), ...Object.fromEntries(Object.entries(THOUGHTS).map(([k, v]) => [`Thought-${k}`, v]))};
const tl = ALL[process.argv[2] ?? 'MotionAd'];
console.log(JSON.stringify({total: tl.total, adStart: tl.adStart, adRect: tl.adRect ?? null, adDuration: AD.duration, adVideo: AD.video, adAudio: AD.audio}));
