import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readSessionMessages } from '@/lib/read-session-jsonl';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');

describe('readSessionMessages', () => {
  it('returns empty array when file does not exist', () => {
    expect(readSessionMessages(FIXTURES, 'nonexistent')).toEqual([]);
  });

  it('parses user + assistant + tool_use entries', () => {
    const messages = readSessionMessages(FIXTURES, 'session');
    expect(messages).toHaveLength(3);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.text).toBe('abre um PR');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.text).toBe('feito, aqui está');
    expect(messages[1]?.toolCalls).toHaveLength(1);
    expect(messages[1]?.toolCalls[0]?.tool).toBe('Bash');
  });
});
