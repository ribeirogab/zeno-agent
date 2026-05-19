import { describe, expect, it } from 'vitest';
import { lookupMimetype } from '@/channels/slack/mimetype';

describe('lookupMimetype', () => {
  it('resolves common text extensions', () => {
    expect(lookupMimetype('a.txt')).toBe('text/plain');
    expect(lookupMimetype('b.md')).toBe('text/markdown');
    expect(lookupMimetype('c.markdown')).toBe('text/markdown');
    expect(lookupMimetype('d.json')).toBe('application/json');
    expect(lookupMimetype('e.csv')).toBe('text/csv');
    expect(lookupMimetype('f.tsv')).toBe('text/tab-separated-values');
    expect(lookupMimetype('g.html')).toBe('text/html');
    expect(lookupMimetype('h.htm')).toBe('text/html');
    expect(lookupMimetype('i.svg')).toBe('image/svg+xml');
    expect(lookupMimetype('j.xml')).toBe('application/xml');
    expect(lookupMimetype('k.yaml')).toBe('application/yaml');
    expect(lookupMimetype('l.yml')).toBe('application/yaml');
    expect(lookupMimetype('m.log')).toBe('text/plain');
  });

  it('resolves common binary extensions', () => {
    expect(lookupMimetype('a.pdf')).toBe('application/pdf');
    expect(lookupMimetype('b.png')).toBe('image/png');
    expect(lookupMimetype('c.jpg')).toBe('image/jpeg');
    expect(lookupMimetype('d.jpeg')).toBe('image/jpeg');
    expect(lookupMimetype('e.gif')).toBe('image/gif');
    expect(lookupMimetype('f.webp')).toBe('image/webp');
    expect(lookupMimetype('g.mp4')).toBe('video/mp4');
    expect(lookupMimetype('h.mp3')).toBe('audio/mpeg');
    expect(lookupMimetype('i.wav')).toBe('audio/wav');
    expect(lookupMimetype('j.ogg')).toBe('audio/ogg');
    expect(lookupMimetype('k.zip')).toBe('application/zip');
  });

  it('is case-insensitive on the extension', () => {
    expect(lookupMimetype('REPORT.JSON')).toBe('application/json');
    expect(lookupMimetype('Photo.PnG')).toBe('image/png');
  });

  it('uses application/octet-stream for unknown extensions', () => {
    expect(lookupMimetype('mystery.xyz')).toBe('application/octet-stream');
    expect(lookupMimetype('archive.tar.zst')).toBe('application/octet-stream');
  });

  it('uses application/octet-stream when no extension', () => {
    expect(lookupMimetype('README')).toBe('application/octet-stream');
    expect(lookupMimetype('.hidden')).toBe('application/octet-stream');
  });

  it('handles paths, not just bare names', () => {
    expect(lookupMimetype('/workspace/outbox/abc/data.json')).toBe('application/json');
    expect(lookupMimetype('./relative.md')).toBe('text/markdown');
  });
});
