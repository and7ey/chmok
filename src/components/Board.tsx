import type { ReactNode } from 'react';
import { BOARD } from '../game/board';
import type { SpaceId } from '../game/types';
import type { PlayerState } from '../game/types';

const SIZE = 6;
const cx = (col: number) => ((col - 1 + 0.5) / SIZE) * 100;
const cy = (row: number) => ((row - 1 + 0.5) / SIZE) * 100;

interface Props {
  owners?: Partial<Record<SpaceId, 0 | 1>>;
  players?: [PlayerState, PlayerState];
  currentIndex?: number;
  flat?: boolean;
  interactive?: boolean;
  hub?: ReactNode;
  onSelect?: (id: SpaceId) => void;
}

export function Board({
  owners = {},
  players,
  currentIndex,
  flat,
  interactive,
  hub,
  onSelect,
}: Props) {
  return (
    <div className={`board${flat ? ' board--flat' : ''}`}>
      <div className="board__inner">
        {BOARD.map((space, i) => {
          const owner = owners[space.id];
          return (
            <button
              key={space.id}
              type="button"
              className={[
                'cell',
                space.kind === 'start' ? 'cell--start' : '',
                space.kind === 'surprise' ? 'cell--surprise' : '',
                owner === 0 ? 'cell--owned0' : '',
                owner === 1 ? 'cell--owned1' : '',
                currentIndex === i ? 'cell--current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ gridColumn: space.col, gridRow: space.row }}
              disabled={!interactive}
              onClick={() => onSelect?.(space.id)}
              title={space.kind === 'spot' ? `${space.name} · ${space.price} монет` : space.name}
            >
              <span className="cell__glyph">{space.glyph}</span>
              <span>
                <span className="cell__name">{space.name}</span>
                {space.price > 0 && <span className="cell__price">{'\u00A0'}{space.price}</span>}
              </span>
            </button>
          );
        })}
        <div className="board__hub">{hub}</div>
      </div>

      {players?.map((p) => {
        const space = BOARD[p.pos];
        const dx = p.id === 0 ? -1.6 : 1.6;
        return (
          <span
            key={p.id}
            className={`token token--${p.id}`}
            style={{ left: `${cx(space.col) + dx}%`, top: `${cy(space.row)}%` }}
            aria-hidden
          />
        );
      })}
    </div>
  );
}
