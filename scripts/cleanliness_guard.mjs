/**
 * scripts/cleanliness_guard.mjs - 01-ai-labより納品された深層バイナリ検品エンジン
 * REA Case 02 & Case 03 の成果物。消去後バイナリから生文字列・メタデータチャンクが0バイトであることを独立検証する。
 */
import zlib from 'zlib';

export function verifyJpegCleanliness(bytes, forbiddenStrings = ['GPS', 'Sony', 'Canon', 'Apple', 'Nikon']) {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { passed: false, reason: 'Invalid JPEG SOI marker' };
  }

  let offset = 2;
  const strippedMarkersFound = [];
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;

    const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe1) strippedMarkersFound.push('APP1_EXIF');
    if (marker === 0xfe) strippedMarkersFound.push('COM_COMMENT');
    if (marker === 0xe2) strippedMarkersFound.push('APP2_ICC');

    offset += 2 + len;
  }

  const latin1Str = Buffer.from(bytes).toString('latin1');
  const leakedStrings = forbiddenStrings.filter((s) => latin1Str.includes(s));

  const passed = strippedMarkersFound.length === 0 && leakedStrings.length === 0;
  return {
    format: 'jpeg',
    passed,
    strippedMarkersFound,
    leakedStrings,
    verdict: passed ? 'CLEAN_VERIFIED' : 'LEAK_DETECTED'
  };
}

export function verifyPngCleanliness(bytes, forbiddenStrings = ['Author', 'Software', 'Copyright']) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== sig[i]) return { passed: false, reason: 'Invalid PNG signature' };
  }

  const forbiddenChunks = ['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'];
  const foundForbiddenChunks = [];
  let offset = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset + 12 <= bytes.length) {
    const len = view.getUint32(offset, false);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (forbiddenChunks.includes(chunkType)) {
      foundForbiddenChunks.push(chunkType);
    }
    offset += 12 + len;
    if (chunkType === 'IEND') break;
  }

  const latin1Str = Buffer.from(bytes).toString('latin1');
  const leakedStrings = forbiddenStrings.filter((s) => latin1Str.includes(s));

  const passed = foundForbiddenChunks.length === 0 && leakedStrings.length === 0;
  return {
    format: 'png',
    passed,
    foundForbiddenChunks,
    leakedStrings,
    verdict: passed ? 'CLEAN_VERIFIED' : 'LEAK_DETECTED'
  };
}

export function verifyPdfCleanliness(bytes, forbiddenStrings = ['SECRET', 'CONFIDENTIAL']) {
  const buf = Buffer.from(bytes);
  const latin1Str = buf.toString('latin1');

  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  let allDecompressedText = latin1Str;

  while ((match = streamRegex.exec(latin1Str)) !== null) {
    const streamRaw = Buffer.from(match[1], 'latin1');
    try {
      const dec = zlib.inflateSync(streamRaw);
      allDecompressedText += '\n' + dec.toString('latin1');
    } catch (e) {
      try {
        const decRaw = zlib.inflateRawSync(streamRaw);
        allDecompressedText += '\n' + decRaw.toString('latin1');
      } catch (e2) {}
    }
  }

  const hasTextLayer = /\bBT\b/.test(allDecompressedText) && /\bET\b/.test(allDecompressedText);
  const hasRectOverlay = /\bre\s+(?:f|F|b|B)\b/.test(latin1Str);
  const leakedStrings = forbiddenStrings.filter((s) => allDecompressedText.includes(s));
  const isFakeRedaction = hasRectOverlay && (hasTextLayer || leakedStrings.length > 0);

  const passed = !hasTextLayer && leakedStrings.length === 0;
  return {
    format: 'pdf',
    passed,
    hasTextLayer,
    hasRectOverlay,
    isFakeRedaction,
    leakedStrings,
    verdict: passed ? 'SAFE_PERFECT_REDACTION' : (isFakeRedaction ? 'CRITICAL_LEAK_FAKE_REDACTION' : 'LEAK_DETECTED')
  };
}
