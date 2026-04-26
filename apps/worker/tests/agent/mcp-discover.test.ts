import { describe, expect, it } from 'vitest';
import { classifyToolCategory } from '@/agent/mcp-discover';

describe('classifyToolCategory', () => {
  it('classifies read prefixes', () => {
    expect(classifyToolCategory('read_file')).toBe('read');
    expect(classifyToolCategory('list_issues')).toBe('read');
    expect(classifyToolCategory('get_user')).toBe('read');
    expect(classifyToolCategory('search_messages')).toBe('read');
    expect(classifyToolCategory('find_channel')).toBe('read');
  });

  it('classifies write prefixes', () => {
    expect(classifyToolCategory('create_issue')).toBe('write');
    expect(classifyToolCategory('update_status')).toBe('write');
    expect(classifyToolCategory('delete_message')).toBe('write');
    expect(classifyToolCategory('send_dm')).toBe('write');
    expect(classifyToolCategory('post_canvas')).toBe('write');
    expect(classifyToolCategory('put_metadata')).toBe('write');
  });

  it('classifies anything else as interactive', () => {
    expect(classifyToolCategory('schedule_meeting')).toBe('interactive');
    expect(classifyToolCategory('archive_thread')).toBe('interactive');
    expect(classifyToolCategory('do_thing')).toBe('interactive');
  });

  it('matches case-insensitively', () => {
    expect(classifyToolCategory('READ_file')).toBe('read');
    expect(classifyToolCategory('Update_thing')).toBe('write');
  });
});
