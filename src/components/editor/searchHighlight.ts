import { StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { FindMatch } from '../../services/search/findCore';

export interface SearchHighlightPayload {
  matches: FindMatch[];
  activeIndex: number;
}

export interface SearchFlashRange {
  from: number;
  to: number;
}

export const setSearchHighlightsEffect = StateEffect.define<SearchHighlightPayload | null>();
export const setSearchFlashEffect = StateEffect.define<SearchFlashRange | null>();

const matchMark = Decoration.mark({ class: 'cm-search-match' });
const activeMark = Decoration.mark({ class: 'cm-search-match cm-search-match-active' });
const flashMark = Decoration.mark({ class: 'cm-search-flash' });

function buildMatchDecorations(payload: SearchHighlightPayload | null): DecorationSet {
  if (!payload) return Decoration.none;
  const ranges: Array<Range<Decoration>> = [];
  payload.matches.forEach((match, index) => {
    if (match.to <= match.from) return;
    ranges.push((index === payload.activeIndex ? activeMark : matchMark).range(match.from, match.to));
  });
  return Decoration.set(ranges, true);
}

const searchHighlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSearchHighlightsEffect)) {
        return buildMatchDecorations(effect.value);
      }
    }
    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const searchFlash = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSearchFlashEffect)) {
        const range = effect.value;
        if (!range || range.to <= range.from) return Decoration.none;
        return Decoration.set([flashMark.range(range.from, range.to)], true);
      }
    }
    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const searchHighlightExtension = [searchHighlights, searchFlash];
