import LZString from 'lz-string';

const COMPACT_PREFIX = 'QL1:';

/**
 * Encodes a WebRTC RTCSessionDescription into a compact, QR-friendly string.
 * Uses LZString compression (~3x-4x smaller than btoa(encodeURIComponent(...)))
 * so offline QR codes have far fewer modules and scan reliably on mobile cameras.
 */
export function encodeSDPForQR(
  desc: RTCSessionDescription | RTCSessionDescriptionInit
): string {
  const compactObj = {
    t: desc.type === 'offer' ? 'o' : desc.type === 'answer' ? 'a' : desc.type,
    s: desc.sdp || '',
  };

  try {
    const compressed = LZString.compressToBase64(JSON.stringify(compactObj));
    if (compressed) {
      return `${COMPACT_PREFIX}${compressed}`;
    }
  } catch {
    // Fallback to standard base64 if compression unexpectedly fails
  }

  return btoa(encodeURIComponent(JSON.stringify({ type: desc.type, sdp: desc.sdp })));
}

function normalizeParsedSDP(parsed: unknown): RTCSessionDescriptionInit {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Malformed protocol descriptor object');
  }

  const record = parsed as Record<string, unknown>;

  // Compact format: { t: 'o' | 'a', s: '...' }
  if (typeof record.t === 'string' && typeof record.s === 'string') {
    const type =
      record.t === 'o'
        ? 'offer'
        : record.t === 'a'
          ? 'answer'
          : (record.t as RTCSdpType);
    return { type, sdp: record.s };
  }

  // Standard RTCSessionDescriptionInit format: { type: 'offer' | 'answer', sdp: '...' }
  if (typeof record.type === 'string' && typeof record.sdp === 'string') {
    return { type: record.type as RTCSdpType, sdp: record.sdp };
  }

  throw new Error('Missing SDP type or payload fields');
}

/**
 * Decodes a WebRTC SDP string from a scanned QR code or manual paste.
 * Supports:
 *  - Compact QL1:<LZString Base64> format
 *  - Raw JSON RTCSessionDescriptionInit
 *  - Legacy btoa(encodeURIComponent(json))
 *  - Legacy btoa(json) and URL-encoded variants
 */
export function decodeSDPFromQR(input: string): RTCSessionDescriptionInit {
  if (!input || !input.trim()) {
    throw new Error('Empty protocol string');
  }

  const trimmed = input.trim();

  // 1. Compact LZString format (strip any whitespace/newlines introduced during copy-paste)
  const compactClean = trimmed.replace(/\s+/g, '');
  if (compactClean.startsWith(COMPACT_PREFIX)) {
    const payload = compactClean.slice(COMPACT_PREFIX.length);
    const decompressed = LZString.decompressFromBase64(payload);
    if (decompressed) {
      return normalizeParsedSDP(JSON.parse(decompressed));
    }
    throw new Error('Corrupt compact QR protocol payload');
  }

  // 2. Raw JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return normalizeParsedSDP(JSON.parse(trimmed));
  }

  // 3. Legacy btoa(encodeURIComponent(json))
  try {
    const decoded = decodeURIComponent(atob(compactClean));
    if (decoded && decoded.trim().startsWith('{')) {
      return normalizeParsedSDP(JSON.parse(decoded.trim()));
    }
  } catch {
    // try next decoder
  }

  // 4. Legacy btoa(json)
  try {
    const decoded = atob(compactClean);
    if (decoded && decoded.trim().startsWith('{')) {
      return normalizeParsedSDP(JSON.parse(decoded.trim()));
    }
  } catch {
    // try next decoder
  }

  // 5. Legacy URL-encoded JSON or URL-encoded Base64
  try {
    const unescaped = decodeURIComponent(trimmed);
    if (unescaped.trim().startsWith('{') && unescaped.trim().endsWith('}')) {
      return normalizeParsedSDP(JSON.parse(unescaped.trim()));
    }
    const decoded = atob(unescaped.replace(/\s+/g, ''));
    if (decoded && decoded.trim().startsWith('{')) {
      return normalizeParsedSDP(JSON.parse(decoded.trim()));
    }
  } catch {
    // fall through to error
  }

  // 6. Unprefixed LZString Base64 fallback
  try {
    const decompressed = LZString.decompressFromBase64(compactClean);
    if (decompressed && decompressed.trim().startsWith('{')) {
      return normalizeParsedSDP(JSON.parse(decompressed.trim()));
    }
  } catch {
    // fall through
  }

  throw new Error('Invalid or corrupt protocol string format');
}
