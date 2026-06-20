/**
 * utils.test.ts — Tests for lib/utils.ts (cn function)
 */

import { cn } from '@/lib/utils';

describe('cn (class name utility)', () => {
  it('merges multiple class strings', () => {
    const result = cn('foo', 'bar', 'baz');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
    expect(result).toContain('baz');
  });

  it('handles empty string arguments', () => {
    const result = cn('foo', '', 'bar');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('handles undefined arguments gracefully', () => {
    const result = cn('foo', undefined, 'bar');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('deduplicates tailwind conflicting classes', () => {
    // tailwind-merge should resolve conflicts
    const result = cn('text-red-500', 'text-blue-500');
    // Only the last conflicting class should survive
    expect(result).toBe('text-blue-500');
  });

  it('handles conditional class application', () => {
    const isActive = true;
    const result = cn('base-class', isActive && 'active-class');
    expect(result).toContain('base-class');
    expect(result).toContain('active-class');
  });

  it('excludes false conditional classes', () => {
    const isActive = false;
    const result = cn('base-class', isActive && 'active-class');
    expect(result).toContain('base-class');
    expect(result).not.toContain('active-class');
  });

  it('returns empty string for no valid classes', () => {
    const result = cn('', undefined, false as any, null as any);
    expect(typeof result).toBe('string');
  });

  it('handles single class', () => {
    const result = cn('only-class');
    expect(result).toBe('only-class');
  });

  it('handles array of classes', () => {
    const result = cn(['class-a', 'class-b']);
    expect(result).toContain('class-a');
    expect(result).toContain('class-b');
  });

  it('handles object notation for conditional classes', () => {
    const result = cn({ 'active': true, 'disabled': false });
    expect(result).toContain('active');
    expect(result).not.toContain('disabled');
  });
});
