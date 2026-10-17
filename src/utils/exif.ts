// src/utils/exif.ts
// ブラウザ内完結（外部通信0バイト）のEXIF・GPS・メタデータ解析＆ロスレス消去＆ZIP一括生成ユーティリティ

export interface ImageMetadataReport {
  format: 'jpeg' | 'png' | 'webp' | 'unknown';
  hasExif: boolean;
  hasGps: boolean;
  hasXmpOrIptc: boolean;
  hasComment: boolean;
  gpsCoordText?: string;
  cameraText?: string;
  dateTimeText?: string;
  softwareText?: string;
  metadataByteCount: number;
  detectedTags: string[];
}

/**
 * 画像バイナリのフォーマットを判定する
 */
export function detectImageFormat(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | 'unknown' {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'webp';
  }
  return 'unknown';
}

/**
 * TIFF/EXIF IFDヘッダを解析してGPS座標・カメラ機種名・撮影日時などを抽出する
 */
function parseTiffExif(tiffBytes: Uint8Array, report: ImageMetadataReport): void {
  if (tiffBytes.length < 8) return;

  const isLittleEndian = tiffBytes[0] === 0x49 && tiffBytes[1] === 0x49; // 'II'
  const isBigEndian = tiffBytes[0] === 0x4d && tiffBytes[1] === 0x4d; // 'MM'
  if (!isLittleEndian && !isBigEndian) return;

  const view = new DataView(tiffBytes.buffer, tiffBytes.byteOffset, tiffBytes.byteLength);
  const getU16 = (offset: number) =>
    offset + 2 <= tiffBytes.length ? view.getUint16(offset, isLittleEndian) : 0;
  const getU32 = (offset: number) =>
    offset + 4 <= tiffBytes.length ? view.getUint32(offset, isLittleEndian) : 0;

  if (getU16(2) !== 0x002a) return;
  const ifd0Offset = getU32(4);
  if (ifd0Offset < 8 || ifd0Offset >= tiffBytes.length) return;

  const readAscii = (valOffset: number, count: number): string => {
    if (valOffset < 0 || valOffset + count > tiffBytes.length) return '';
    let str = '';
    for (let i = 0; i < count; i++) {
      const ch = tiffBytes[valOffset + i];
      if (ch === 0) break;
      if (ch >= 32 && ch <= 126) str += String.fromCharCode(ch);
    }
    return str.trim();
  };

  const readRational = (valOffset: number): number => {
    if (valOffset < 0 || valOffset + 8 > tiffBytes.length) return 0;
    const num = getU32(valOffset);
    const den = getU32(valOffset + 4);
    return den === 0 ? 0 : num / den;
  };

  let make = '';
  let model = '';
  let exifIfdOffset = 0;
  let gpsIfdOffset = 0;

  const numEntries0 = getU16(ifd0Offset);
  for (let i = 0; i < numEntries0; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > tiffBytes.length) break;

    const tag = getU16(entryOffset);
    const type = getU16(entryOffset + 2);
    const count = getU32(entryOffset + 4);
    const valueOffset = count <= 4 && type === 2 ? entryOffset + 8 : getU32(entryOffset + 8);

    if (tag === 0x010f && type === 2) {
      make = readAscii(valueOffset, count);
    } else if (tag === 0x0110 && type === 2) {
      model = readAscii(valueOffset, count);
    } else if (tag === 0x0131 && type === 2) {
      const sw = readAscii(valueOffset, count);
      if (sw) report.softwareText = sw;
    } else if (tag === 0x0132 && type === 2 && !report.dateTimeText) {
      const dt = readAscii(valueOffset, count);
      if (dt) report.dateTimeText = dt;
    } else if (tag === 0x8769) {
      exifIfdOffset = getU32(entryOffset + 8);
    } else if (tag === 0x8825) {
      gpsIfdOffset = getU32(entryOffset + 8);
    }
  }

  if (make || model) {
    report.cameraText = model.startsWith(make) ? model : `${make} ${model}`.trim();
    report.detectedTags.push(`撮影機種 (${report.cameraText})`);
  }

  // Exif SubIFD
  if (exifIfdOffset > 0 && exifIfdOffset + 2 <= tiffBytes.length) {
    const numExif = getU16(exifIfdOffset);
    for (let i = 0; i < numExif; i++) {
      const entryOffset = exifIfdOffset + 2 + i * 12;
      if (entryOffset + 12 > tiffBytes.length) break;
      const tag = getU16(entryOffset);
      const type = getU16(entryOffset + 2);
      const count = getU32(entryOffset + 4);
      const valueOffset = count <= 4 && type === 2 ? entryOffset + 8 : getU32(entryOffset + 8);

      if ((tag === 0x9003 || tag === 0x9004) && type === 2) {
        const dt = readAscii(valueOffset, count);
        if (dt) report.dateTimeText = dt;
      }
    }
  }

  if (report.dateTimeText) {
    report.detectedTags.push(`撮影日時 (${report.dateTimeText})`);
  }
  if (report.softwareText) {
    report.detectedTags.push(`編集ソフト (${report.softwareText})`);
  }

  // GPS IFD
  if (gpsIfdOffset > 0 && gpsIfdOffset + 2 <= tiffBytes.length) {
    report.hasGps = true;
    const numGps = getU16(gpsIfdOffset);
    let latRef = 'N';
    let lonRef = 'E';
    let latDeg: number | null = null;
    let lonDeg: number | null = null;

    for (let i = 0; i < numGps; i++) {
      const entryOffset = gpsIfdOffset + 2 + i * 12;
      if (entryOffset + 12 > tiffBytes.length) break;
      const tag = getU16(entryOffset);
      const type = getU16(entryOffset + 2);
      const count = getU32(entryOffset + 4);

      if (tag === 0x0001 && type === 2) {
        const ch = tiffBytes[entryOffset + 8];
        if (ch === 0x53 || ch === 0x4e) latRef = String.fromCharCode(ch);
      } else if (tag === 0x0002 && type === 5 && count === 3) {
        const valOff = getU32(entryOffset + 8);
        if (valOff + 24 <= tiffBytes.length) {
          const d = readRational(valOff);
          const m = readRational(valOff + 8);
          const s = readRational(valOff + 16);
          latDeg = d + m / 60 + s / 3600;
        }
      } else if (tag === 0x0003 && type === 2) {
        const ch = tiffBytes[entryOffset + 8];
        if (ch === 0x57 || ch === 0x45) lonRef = String.fromCharCode(ch);
      } else if (tag === 0x0004 && type === 5 && count === 3) {
        const valOff = getU32(entryOffset + 8);
        if (valOff + 24 <= tiffBytes.length) {
          const d = readRational(valOff);
          const m = readRational(valOff + 8);
          const s = readRational(valOff + 16);
          lonDeg = d + m / 60 + s / 3600;
        }
      }
    }

    if (latDeg !== null && lonDeg !== null) {
      report.gpsCoordText = `${latDeg.toFixed(4)}° ${latRef}, ${lonDeg.toFixed(4)}° ${lonRef}`;
      report.detectedTags.unshift(`GPS位置情報 (${report.gpsCoordText})`);
    } else {
      report.detectedTags.unshift('GPS位置情報タグ');
    }
  }
}

/**
 * 画像バイナリ内のメタデータ（EXIF/GPS/XMP/コメント等）を検査してレポートを返す
 */
export function inspectImageMetadata(bytes: Uint8Array): ImageMetadataReport {
  const format = detectImageFormat(bytes);
  const report: ImageMetadataReport = {
    format,
    hasExif: false,
    hasGps: false,
    hasXmpOrIptc: false,
    hasComment: false,
    metadataByteCount: 0,
    detectedTags: [],
  };

  if (format === 'jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segLen < 2 || offset + 2 + segLen > bytes.length) break;

      if (marker === 0xe1) {
        // APP1 (EXIF or XMP)
        report.metadataByteCount += segLen + 2;
        const payload = bytes.subarray(offset + 4, offset + 2 + segLen);
        if (
          payload.length >= 6 &&
          payload[0] === 0x45 && // E
          payload[1] === 0x78 && // x
          payload[2] === 0x69 && // i
          payload[3] === 0x66 && // f
          payload[4] === 0x00 &&
          payload[5] === 0x00
        ) {
          report.hasExif = true;
          parseTiffExif(payload.subarray(6), report);
          if (!report.detectedTags.some((t) => t.includes('EXIF'))) {
            report.detectedTags.push('EXIF撮影メタデータ');
          }
        } else {
          report.hasXmpOrIptc = true;
          report.detectedTags.push('XMP編集メタデータ');
        }
      } else if (marker >= 0xe2 && marker <= 0xef) {
        // APP2..APP15
        report.metadataByteCount += segLen + 2;
        report.hasXmpOrIptc = true;
        if (!report.detectedTags.includes('APP拡張プロファイル/IPTC')) {
          report.detectedTags.push('APP拡張プロファイル/IPTC');
        }
      } else if (marker === 0xfe) {
        // COM
        report.metadataByteCount += segLen + 2;
        report.hasComment = true;
        report.detectedTags.push('埋め込みコメント (COM)');
      }

      offset += 2 + segLen;
    }
  } else if (format === 'png') {
    let offset = 8;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset, false);
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );
      if (offset + 12 + length > bytes.length) break;

      if (type === 'eXIf') {
        report.hasExif = true;
        report.metadataByteCount += length + 12;
        const payload = bytes.subarray(offset + 8, offset + 8 + length);
        parseTiffExif(payload, report);
        report.detectedTags.push('PNG eXIfチャンク');
      } else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        report.hasComment = true;
        report.metadataByteCount += length + 12;
        if (!report.detectedTags.includes(`PNGテキスト情報 (${type})`)) {
          report.detectedTags.push(`PNGテキスト情報 (${type})`);
        }
      } else if (type === 'tIME') {
        report.metadataByteCount += length + 12;
        report.detectedTags.push('PNG更新日時 (tIME)');
      }

      if (type === 'IEND') break;
      offset += 12 + length;
    }
  } else if (format === 'webp') {
    let offset = 12;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (offset + 8 <= bytes.length) {
      const fourCC = String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3]
      );
      const chunkSize = view.getUint32(offset + 4, true);
      const paddedSize = chunkSize + (chunkSize % 2);
      if (offset + 8 + chunkSize > bytes.length) break;

      if (fourCC === 'EXIF') {
        report.hasExif = true;
        report.metadataByteCount += paddedSize + 8;
        const payload = bytes.subarray(offset + 8, offset + 8 + chunkSize);
        const tiffStart =
          payload.length >= 6 &&
          payload[0] === 0x45 &&
          payload[1] === 0x78 &&
          payload[2] === 0x69 &&
          payload[3] === 0x66
            ? payload.subarray(6)
            : payload;
        parseTiffExif(tiffStart, report);
        report.detectedTags.push('WebP EXIFチャンク');
      } else if (fourCC === 'XMP ') {
        report.hasXmpOrIptc = true;
        report.metadataByteCount += paddedSize + 8;
        report.detectedTags.push('WebP XMPチャンク');
      }

      offset += 8 + paddedSize;
    }
  }

  return report;
}

/**
 * 画質劣化ゼロ（ロスレス）でJPEG/PNG/WebPからEXIF・GPS・メタデータチャンクのみをバイナリ除去する
 */
export function stripImageMetadataLossless(bytes: Uint8Array): {
  cleanedBytes: Uint8Array;
  removedBytes: number;
} {
  const format = detectImageFormat(bytes);

  if (format === 'jpeg') {
    const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI (FFD8)
    let offset = 2;
    let removedBytes = 0;

    while (offset + 2 <= bytes.length) {
      if (bytes[offset] !== 0xff) {
        chunks.push(bytes.subarray(offset));
        break;
      }
      const marker = bytes[offset + 1];
      // SOS (Start of Scan) 以降は画像データ本体なのでそのまま保持
      if (marker === 0xda) {
        chunks.push(bytes.subarray(offset));
        break;
      }
      if (marker === 0xd9) {
        chunks.push(bytes.subarray(offset, offset + 2));
        break;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        chunks.push(bytes.subarray(offset, offset + 2));
        offset += 2;
        continue;
      }
      if (offset + 4 > bytes.length) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      const segTotal = 2 + segLen;
      if (segLen < 2 || offset + segTotal > bytes.length) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      // APP1..APP15 (0xE1..0xEF) および COM (0xFE) を完全除去
      if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) {
        removedBytes += segTotal;
      } else {
        chunks.push(bytes.subarray(offset, offset + segTotal));
      }
      offset += segTotal;
    }

    // 標準JFIF APP0が無い場合でもSOI+DQT/SOFで正常にデコード可能
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return { cleanedBytes: out, removedBytes };
  }

  if (format === 'png') {
    const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
    let offset = 8;
    let removedBytes = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset, false);
      const chunkTotal = 12 + length;
      if (offset + chunkTotal > bytes.length) {
        chunks.push(bytes.subarray(offset));
        break;
      }
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );

      if (
        type === 'eXIf' ||
        type === 'tEXt' ||
        type === 'zTXt' ||
        type === 'iTXt' ||
        type === 'tIME'
      ) {
        removedBytes += chunkTotal;
      } else {
        chunks.push(bytes.subarray(offset, offset + chunkTotal));
      }

      offset += chunkTotal;
      if (type === 'IEND') break;
    }

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return { cleanedBytes: out, removedBytes };
  }

  if (format === 'webp') {
    const chunks: Uint8Array[] = [new Uint8Array(bytes.subarray(0, 12))];
    let offset = 12;
    let removedBytes = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    while (offset + 8 <= bytes.length) {
      const fourCC = String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3]
      );
      const chunkSize = view.getUint32(offset + 4, true);
      const paddedSize = chunkSize + (chunkSize % 2);
      const chunkTotal = 8 + paddedSize;

      if (offset + 8 + chunkSize > bytes.length) {
        chunks.push(bytes.subarray(offset));
        break;
      }

      if (fourCC === 'EXIF' || fourCC === 'XMP ') {
        removedBytes += chunkTotal;
      } else if (fourCC === 'VP8X' && chunkSize >= 4) {
        const vp8xCopy = new Uint8Array(bytes.subarray(offset, offset + chunkTotal));
        // Clear EXIF (bit 3: 0x08) and XMP (bit 2: 0x04) flags in VP8X
        vp8xCopy[8] = vp8xCopy[8] & ~(0x08 | 0x04);
        chunks.push(vp8xCopy);
      } else {
        chunks.push(bytes.subarray(offset, offset + chunkTotal));
      }

      offset += chunkTotal;
    }

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    if (out.length >= 12) {
      const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
      outView.setUint32(4, out.length - 8, true);
    }
    return { cleanedBytes: out, removedBytes };
  }

  return { cleanedBytes: bytes, removedBytes: 0 };
}

/**
 * Canvasピクセル再描画による完全クリーンアップ（EXIF回転適用＆全チャンク再生成）
 */
export async function stripImageMetadataCanvas(
  bytes: Uint8Array,
  format: 'jpeg' | 'png' | 'webp'
): Promise<Uint8Array> {
  const mime =
    format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mime });
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const outBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvasエンコードに失敗しました'))),
      mime,
      format === 'png' ? undefined : 0.92
    );
  });

  const buf = await outBlob.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * 外部ライブラリ不要・ブラウザメモリ完結の高速ZIPアーカイブ生成（STORE方式・UTF-8対応）
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipArchive(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: UTF-8
    lv.setUint16(8, 0, true); // compression: STORE (0)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, file.data);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // flags: UTF-8
    cv.setUint16(10, 0, true); // compression: STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + 22;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

/**
 * テスト用：実際のGPS座標・カメラ機種名・撮影日時を持ったEXIF APP1セグメントを生成してJPEGに埋め込む
 */
function buildExifApp1Segment(opts: {
  make: string;
  model: string;
  software: string;
  dateTime: string;
  lat: [number, number, number]; // deg, min, sec
  lon: [number, number, number]; // deg, min, sec
}): Uint8Array {
  const enc = new TextEncoder();
  const makeBytes = enc.encode(opts.make + '\0');
  const modelBytes = enc.encode(opts.model + '\0');
  const swBytes = enc.encode(opts.software + '\0');
  const dtBytes = enc.encode(opts.dateTime + '\0');

  // Little-endian TIFF structure
  const buf = new Uint8Array(512);
  const view = new DataView(buf.buffer);

  // "Exif\0\0"
  buf.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
  const tiffBase = 6;

  // TIFF Header: "II", 0x002A, offset to IFD0 = 8
  buf[tiffBase + 0] = 0x49;
  buf[tiffBase + 1] = 0x49;
  view.setUint16(tiffBase + 2, 0x002a, true);
  view.setUint32(tiffBase + 4, 8, true);

  // IFD0 at tiffBase + 8: 5 entries (Make, Model, Software, DateTime, GPSInfoIFDPointer)
  const ifd0 = tiffBase + 8;
  const numIfd0 = 5;
  view.setUint16(ifd0, numIfd0, true);

  let dataCursor = 8 + 2 + numIfd0 * 12 + 4; // relative to tiffBase

  const writeEntry = (
    ifdOffset: number,
    idx: number,
    tag: number,
    type: number,
    count: number,
    valueOrOffset: number
  ) => {
    const pos = ifdOffset + 2 + idx * 12;
    view.setUint16(pos, tag, true);
    view.setUint16(pos + 2, type, true);
    view.setUint32(pos + 4, count, true);
    view.setUint32(pos + 8, valueOrOffset, true);
  };

  const writeStringData = (bytes: Uint8Array): number => {
    const relOffset = dataCursor;
    buf.set(bytes, tiffBase + relOffset);
    dataCursor += bytes.length + (bytes.length % 2);
    return relOffset;
  };

  writeEntry(ifd0, 0, 0x010f, 2, makeBytes.length, writeStringData(makeBytes));
  writeEntry(ifd0, 1, 0x0110, 2, modelBytes.length, writeStringData(modelBytes));
  writeEntry(ifd0, 2, 0x0131, 2, swBytes.length, writeStringData(swBytes));
  writeEntry(ifd0, 3, 0x0132, 2, dtBytes.length, writeStringData(dtBytes));

  const gpsIfdRelOffset = dataCursor;
  writeEntry(ifd0, 4, 0x8825, 4, 1, gpsIfdRelOffset);
  view.setUint32(ifd0 + 2 + numIfd0 * 12, 0, true); // next IFD = 0

  // GPS IFD: 4 entries (LatRef, Lat, LonRef, Lon)
  const gpsIfd = tiffBase + gpsIfdRelOffset;
  const numGps = 4;
  view.setUint16(gpsIfd, numGps, true);
  dataCursor += 2 + numGps * 12 + 4;

  // LatRef = 'N\0\0\0' -> 0x0000004E
  writeEntry(gpsIfd, 0, 0x0001, 2, 2, 0x0000004e);

  // Lat rationals (3 * 8 = 24 bytes)
  const latOffset = dataCursor;
  for (let i = 0; i < 3; i++) {
    view.setUint32(tiffBase + dataCursor, Math.round(opts.lat[i] * 100), true);
    view.setUint32(tiffBase + dataCursor + 4, 100, true);
    dataCursor += 8;
  }
  writeEntry(gpsIfd, 1, 0x0002, 5, 3, latOffset);

  // LonRef = 'E\0\0\0' -> 0x00000045
  writeEntry(gpsIfd, 2, 0x0003, 2, 2, 0x00000045);

  // Lon rationals
  const lonOffset = dataCursor;
  for (let i = 0; i < 3; i++) {
    view.setUint32(tiffBase + dataCursor, Math.round(opts.lon[i] * 100), true);
    view.setUint32(tiffBase + dataCursor + 4, 100, true);
    dataCursor += 8;
  }
  writeEntry(gpsIfd, 3, 0x0004, 5, 3, lonOffset);
  view.setUint32(gpsIfd + 2 + numGps * 12, 0, true);

  const payloadLen = 6 + dataCursor;
  const segLen = payloadLen + 2;
  const segment = new Uint8Array(2 + segLen);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = (segLen >> 8) & 0xff;
  segment[3] = segLen & 0xff;
  segment.set(buf.subarray(0, payloadLen), 4);
  return segment;
}

/**
 * ワンクリック動作検証用のGPS・EXIF付きサンプルJPEG画像3枚をメモリ上で生成する
 */
export async function generateSampleExifJpegs(): Promise<{ name: string; bytes: Uint8Array }[]> {
  const samples = [
    {
      name: 'sample_01_office_whiteboard.jpg',
      title: '社内ホワイトボード撮影写真',
      subtitle: 'GPS: 東京駅丸の内 / iPhone 16 Pro',
      bg: ['#064e3b', '#0f172a'],
      make: 'Apple',
      model: 'iPhone 16 Pro',
      software: 'iOS 19.2',
      dateTime: '2026:10:15 14:32:10',
      lat: [35, 40, 52.32] as [number, number, number],
      lon: [139, 46, 1.56] as [number, number, number],
    },
    {
      name: 'sample_02_remote_home_desk.jpg',
      title: '在宅勤務デスク機材写真',
      subtitle: 'GPS: 東京都渋谷区 / Pixel 9 Pro',
      bg: ['#1e3a8a', '#0f172a'],
      make: 'Google',
      model: 'Pixel 9 Pro',
      software: 'Android 16',
      dateTime: '2026:10:16 21:15:44',
      lat: [35, 39, 28.8] as [number, number, number],
      lon: [139, 42, 5.76] as [number, number, number],
    },
    {
      name: 'sample_03_factory_inspection.jpg',
      title: '工場ライン検査記録写真',
      subtitle: 'GPS: 大阪市北区 / Canon EOS R5',
      bg: ['#134e4a', '#0f172a'],
      make: 'Canon',
      model: 'Canon EOS R5',
      software: 'Firmware 2.1.0',
      dateTime: '2026:10:17 09:05:00',
      lat: [34, 41, 37.32] as [number, number, number],
      lon: [135, 30, 8.28] as [number, number, number],
    },
  ];

  const results: { name: string; bytes: Uint8Array }[] = [];

  for (const s of samples) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 640, 420);
    grad.addColorStop(0, s.bg[0]);
    grad.addColorStop(1, s.bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 420);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 600, 380);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('ZeroLeak EXIF/GPS Sample Image', 45, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(s.title, 45, 130);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px monospace';
    ctx.fillText(s.subtitle, 45, 180);
    ctx.fillText(`Date: ${s.dateTime}`, 45, 220);
    ctx.fillText('※ 内部バイナリにGPS位置情報タグを含んでいます', 45, 340);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9)
    );
    const rawJpeg = new Uint8Array(await blob.arrayBuffer());
    const app1 = buildExifApp1Segment({
      make: s.make,
      model: s.model,
      software: s.software,
      dateTime: s.dateTime,
      lat: s.lat,
      lon: s.lon,
    });

    // Inject APP1 immediately after SOI (0xFFD8)
    const combined = new Uint8Array(rawJpeg.length + app1.length);
    combined.set(rawJpeg.subarray(0, 2), 0);
    combined.set(app1, 2);
    combined.set(rawJpeg.subarray(2), 2 + app1.length);

    results.push({ name: s.name, bytes: combined });
  }

  return results;
}
