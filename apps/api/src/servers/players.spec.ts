import { describe, expect, it } from 'vitest';

import { parsePlayersOutput } from './players.js';

describe('parsePlayersOutput', () => {
  it('parses the multi-line Factorio format', () => {
    expect(parsePlayersOutput('Players (2):\n  Alice\n  Bob\n')).toEqual([
      'Alice',
      'Bob',
    ]);
  });

  it('parses the older colon format', () => {
    expect(parsePlayersOutput('Players:\n  Oxyd\n  mp-1\n')).toEqual([
      'Oxyd',
      'mp-1',
    ]);
  });

  it('parses inline names separated by commas', () => {
    expect(parsePlayersOutput('Players (1): Alice')).toEqual(['Alice']);
    expect(parsePlayersOutput('Players online (2): Alice, Bob')).toEqual([
      'Alice',
      'Bob',
    ]);
  });

  it('parses the Factorio online-players header', () => {
    expect(parsePlayersOutput('Online players (0):\n')).toEqual([]);
    expect(parsePlayersOutput('Online players (2):\n  Alice\n  Bob\n')).toEqual(
      ['Alice', 'Bob'],
    );
    expect(parsePlayersOutput('Online players (1): Alice')).toEqual(['Alice']);
  });

  it('returns an empty list when nobody is online', () => {
    expect(parsePlayersOutput('Players (0):')).toEqual([]);
    expect(parsePlayersOutput('No players online')).toEqual([]);
    expect(parsePlayersOutput('')).toEqual([]);
  });

  it('trims whitespace, strips ANSI codes and handles CRLF', () => {
    expect(
      parsePlayersOutput(
        '\u001b[32mPlayers (2):\u001b[0m\r\n  Alice\r\n  Bob\r\n',
      ),
    ).toEqual(['Alice', 'Bob']);
  });

  it('keeps names with spaces and removes duplicates', () => {
    expect(
      parsePlayersOutput('Players (2):\n  John Doe\n  John Doe\n  Alice'),
    ).toEqual(['John Doe', 'Alice']);
  });

  it('ignores command error lines', () => {
    expect(
      parsePlayersOutput('Unknown command.\nPlayers (1):\n  Alice'),
    ).toEqual(['Alice']);
  });
});
