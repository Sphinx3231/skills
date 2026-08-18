// A tiny, dependency-free base64 decoder (ticket 016). React Native/Hermes
// does not reliably expose a global `atob`, and this project does not
// otherwise depend on Node's `Buffer` polyfill — food-recognition.ts needs
// to turn `expo-image-manipulator`'s `saveAsync({ base64: true })` output
// back into raw bytes for `jpeg-js` to decode, so this exists purely to
// avoid pulling in a whole extra package for one small, easily-tested
// function.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHAR_INDEX = new Map(BASE64_CHARS.split('').map((c, i) => [c, i]));

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  // Strip a `data:...;base64,` prefix if present, and any whitespace/padding
  // characters expo-image-manipulator's output never includes but a
  // defensive parser shouldn't choke on either.
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
  const withoutPadding = clean.replace(/=+$/, '');

  const byteLength = Math.floor((withoutPadding.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let buffer = 0;
  let bitsInBuffer = 0;
  let byteIndex = 0;

  for (const char of withoutPadding) {
    // Never undefined here — `clean` above already stripped every
    // character outside the base64 alphabet (plus `=`), and `=` itself was
    // just stripped by `withoutPadding`, so every remaining char is
    // guaranteed to be a `CHAR_INDEX` key.
    const value = CHAR_INDEX.get(char) as number;
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes[byteIndex++] = (buffer >> bitsInBuffer) & 0xff;
    }
  }

  return bytes;
}
