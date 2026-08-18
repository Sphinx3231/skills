import { decodeBase64ToUint8Array } from '../base64';

function toBase64(bytes: number[]): string {
  // Node's Buffer is available in the Jest/Node test environment (unlike on
  // a real RN device, which is exactly why base64.ts can't rely on it) —
  // using it here only to construct known-good fixtures for the real
  // decoder under test.
  return Buffer.from(bytes).toString('base64');
}

describe('decodeBase64ToUint8Array', () => {
  it('decodes a simple ASCII string ("hello")', () => {
    const bytes = [104, 101, 108, 108, 111];
    const result = decodeBase64ToUint8Array(toBase64(bytes));
    expect(Array.from(result)).toEqual(bytes);
  });

  it('decodes binary data covering the full 0-255 byte range', () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    const result = decodeBase64ToUint8Array(toBase64(bytes));
    expect(Array.from(result)).toEqual(bytes);
  });

  it('handles input with no padding needed (length a multiple of 3 bytes)', () => {
    const bytes = [1, 2, 3, 4, 5, 6];
    const result = decodeBase64ToUint8Array(toBase64(bytes));
    expect(Array.from(result)).toEqual(bytes);
  });

  it('handles single-byte and two-byte padded input', () => {
    expect(Array.from(decodeBase64ToUint8Array(toBase64([42])))).toEqual([42]);
    expect(Array.from(decodeBase64ToUint8Array(toBase64([42, 7])))).toEqual([42, 7]);
  });

  it('strips a data: URI prefix before decoding', () => {
    const bytes = [1, 2, 3];
    const withPrefix = `data:image/jpeg;base64,${toBase64(bytes)}`;
    expect(Array.from(decodeBase64ToUint8Array(withPrefix))).toEqual(bytes);
  });

  it('ignores unexpected/whitespace characters rather than throwing', () => {
    const bytes = [104, 101, 108, 108, 111];
    const noisy = toBase64(bytes).split('').join('\n');
    expect(Array.from(decodeBase64ToUint8Array(noisy))).toEqual(bytes);
  });

  it('returns an empty array for an empty string', () => {
    expect(decodeBase64ToUint8Array('').length).toBe(0);
  });
});
