const ESCAPE = String.fromCharCode(27);
const ANSI_ESCAPE = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'g');
const HEADER = /^(online players|players?)\b/i;
const NO_PLAYERS = /^(no players|0 players)\b/i;
const NON_PLAYER_LINE = /^(unknown|command|error|syntax)\b/i;

/**
 * Parses the output of Factorio's `/players online` RCON command.
 *
 * Factorio versions have used both a multi-line list and a single colon-
 * separated line. The header is never a player name.
 */
export function parsePlayersOutput(output: string): string[] {
  const players: string[] = [];

  for (const rawLine of output.replace(ANSI_ESCAPE, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || NO_PLAYERS.test(line) || NON_PLAYER_LINE.test(line)) {
      continue;
    }

    if (HEADER.test(line)) {
      const colon = line.indexOf(':');
      if (colon !== -1) {
        for (const value of line.slice(colon + 1).split(',')) {
          addPlayer(players, value);
        }
      }
      continue;
    }

    addPlayer(players, line);
  }

  return players;
}

function addPlayer(players: string[], value: string): void {
  const name = value.replace(/^[-*]\s+/, '').trim();
  if (name !== '' && !players.includes(name)) {
    players.push(name);
  }
}
