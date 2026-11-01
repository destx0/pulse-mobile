// Base64 for the Bluetooth values React Native hands over as strings. Hermes has no Buffer, so both directions live
// here as plain JavaScript and run the same in Node (vitest) and on the phone. The decoder is lenient (padding ends the
// value, whitespace is skipped, the URL-safe spellings are accepted); the encoder writes the standard padded form.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[ALPHABET.charCodeAt(i)] = i;
  // URL-safe spellings, in case a platform ever hands those over.
  t["-".charCodeAt(0)] = 62;
  t["_".charCodeAt(0)] = 63;
  return t;
})();

/**
 * Base64 → bytes. Padding ends the value; characters outside the alphabet (whitespace) are skipped.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const code = b64.charCodeAt(i);
    if (code === 61 /* = */) break;
    const v = code < 128 ? LOOKUP[code] : -1;
    if (v < 0) continue;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Bytes → standard padded Base64, the form react-native-ble-plx expects for a write. */
export function bytesToBase64(bytes: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] & 0xff;
    const b = i + 1 < bytes.length ? bytes[i + 1] & 0xff : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] & 0xff : 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : "=";
  }
  return out;
}
