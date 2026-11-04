// Written by pipeline/bridge/invent.py: one import per move Muse Code wrote. Do not edit by hand.
import type {MoveProps, Spec} from '../../kit';
import type React from 'react';
import * as M11042011208 from './M11042011208';
import * as M11042017b1f from './M11042017b1f';
export const GEN: Record<string, {Component: React.FC<MoveProps>; seconds: (s: Spec) => number}> = {
	'gen-m11042011208': {Component: M11042011208.Move, seconds: M11042011208.seconds},
	'gen-m11042017b1f': {Component: M11042017b1f.Move, seconds: M11042017b1f.seconds},
};
