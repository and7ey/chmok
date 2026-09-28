import type { Deck } from '../game/types';
import { flirty } from './flirty';
import { late } from './late';
import { tender } from './tender';

export const DECK: Deck = { tender, flirty, late };
