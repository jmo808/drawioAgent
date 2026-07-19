import { describe, test, expect } from 'vitest';
import { generateRandomName } from './nameGenerator';

describe('generateRandomName', () => {
  test('should generate a string in the format Adj-Noun-Hex', () => {
    const name = generateRandomName();
    expect(name).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-[0-9a-f]{4}$/);
  });

  test('should generate different names on successive calls', () => {
    const name1 = generateRandomName();
    const name2 = generateRandomName();
    expect(name1).not.toBe(name2);
  });
});
