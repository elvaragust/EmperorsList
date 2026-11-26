import { describe, expect, it } from 'vitest';
import { fileKey, pickSource, preferSource, realPath } from '../fileKeys';

describe('fileKeys', () => {
  it('keeps another source’s copy: a second source gets its own key', () => {
    expect(fileKey('Orks.json', 'A/x')).toBe('Orks.json');
    expect(fileKey('Orks.json', 'A/x', { source: 'A/x' })).toBe('Orks.json');
    const k = fileKey('Orks.json', 'B/y', { source: 'A/x' });
    expect(k).not.toBe('Orks.json');
    expect(realPath({ path: k, source: 'B/y' })).toBe('Orks.json');
    expect(realPath({ path: 'Orks.json', source: 'A/x' })).toBe('Orks.json');
  });

  it('uses the current source when it has files, else the one with most files', () => {
    const files = [{ source: 'A/x' }, { source: 'A/x' }, { source: 'B/y' }];
    expect(pickSource(files, 'B/y')).toBe('B/y');
    expect(pickSource(files, 'C/z')).toBe('A/x');
    expect(pickSource([], 'C/z')).toBeUndefined();
  });

  it('prefers the current source’s copy of a catalogue', () => {
    const a = { source: 'A/x', id: 1 };
    const b = { source: 'B/y', id: 2 };
    expect(preferSource([a, b], 'B/y')).toBe(b);
    expect(preferSource([a], 'B/y')).toBe(a);
    expect(preferSource([], 'B/y')).toBeUndefined();
  });
});
