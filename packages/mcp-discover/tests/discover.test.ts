import { describe, expect, it } from 'vitest';
import { classifyToolCategory } from '../src/discover';

describe('classifyToolCategory', () => {
  it('read prefixes', () => {
    expect(classifyToolCategory('read_file')).toBe('read');
    expect(classifyToolCategory('list_issues')).toBe('read');
    expect(classifyToolCategory('get_user')).toBe('read');
    expect(classifyToolCategory('search_messages')).toBe('read');
    expect(classifyToolCategory('find_channel')).toBe('read');
  });

  it('write prefixes', () => {
    expect(classifyToolCategory('create_issue')).toBe('write');
    expect(classifyToolCategory('update_status')).toBe('write');
    expect(classifyToolCategory('delete_message')).toBe('write');
    expect(classifyToolCategory('send_dm')).toBe('write');
    expect(classifyToolCategory('post_canvas')).toBe('write');
    expect(classifyToolCategory('put_metadata')).toBe('write');
  });

  it('falls back to interactive', () => {
    expect(classifyToolCategory('schedule_meeting')).toBe('interactive');
    expect(classifyToolCategory('archive_thread')).toBe('interactive');
  });

  it('case-insensitive', () => {
    expect(classifyToolCategory('READ_file')).toBe('read');
  });
});
