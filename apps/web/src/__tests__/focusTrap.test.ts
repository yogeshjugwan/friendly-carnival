import { describe, expect, it } from 'vitest';
import { trapIndex } from '../lib/useFocusTrap';

describe('trapIndex', () => {
  it('wraps Tab from the last item to the first', () => expect(trapIndex(3, 2, false)).toBe(0));
  it('wraps Shift+Tab from the first item to the last', () => expect(trapIndex(3, 0, true)).toBe(2));
  it('pulls focus in from outside', () => expect(trapIndex(3, -1, false)).toBe(0));
  it('lets the browser move within the list', () => expect(trapIndex(3, 1, false)).toBeNull());
  it('does nothing with no focusable items', () => expect(trapIndex(0, -1, false)).toBeNull());
});
