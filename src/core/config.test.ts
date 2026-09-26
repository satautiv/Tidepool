import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, COLOR_COUNT, TRAY_SIZE } from './config';

describe('config', () => {
  it('matches the README game rules', () => {
    expect(BOARD_SIZE).toBe(8);
    expect(TRAY_SIZE).toBe(3);
    expect(COLOR_COUNT).toBe(6);
  });
});
