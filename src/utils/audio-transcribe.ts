// src/utils/audio-transcribe.ts
// ブラウザ内完結（外部送信0バイト）の音声デコード・無音区間分割（VAD）・SRT/VTT字幕変換・個人情報マスキング連携ユーティリティ

import { maskTextContent, DEFAULT_MASK_OPTIONS } from './masking.ts';

export interface TranscriptSegment {
  id: number;
  startSec: number;
  endSec: number;
  text: string;
}

function applyMaskWithCount(rawText: string): { maskedText: string; count: number } {
  const maskedText = maskTextContent(rawText, {
    ...DEFAULT_MASK_OPTIONS,
    replacementType: 'tag',
  });
  const matches = maskedText.match(/\[(マイナンバー|電話番号|メール|郵便番号|カード番号)伏字\]/g);
  return {
    maskedText,
    count: matches ? matches.length : 0,
  };
}

/**
 * 秒数を HH:MM:SS,mmm (SRT形式) または HH:MM:SS.mmm (VTT形式) に変換する
 */
export function formatTimestamp(sec: number, separator: ',' | '.' | ':' = ':'): string {
  const safeSec = Math.max(0, sec);
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = Math.floor(safeSec % 60);
  const millis = Math.round((safeSec - Math.floor(safeSec)) * 1000);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const ms = String(millis).padStart(3, '0');

  if (separator === ',' || separator === '.') {
    return `${hh}:${mm}:${ss}${separator}${ms}`;
  }
  return `${mm}:${ss}`;
}

/**
 * セグメント配列からSRT字幕フォーマット文字列を生成する
 */
export function exportToSrt(segments: TranscriptSegment[], applyPiiMask: boolean): string {
  return segments
    .map((seg, idx) => {
      const start = formatTimestamp(seg.startSec, ',');
      const end = formatTimestamp(seg.endSec, ',');
      const rawText = seg.text.trim() || '（音声区間）';
      const body = applyPiiMask ? applyMaskWithCount(rawText).maskedText : rawText;
      return `${idx + 1}\n${start} --> ${end}\n${body}\n`;
    })
    .join('\n');
}

/**
 * セグメント配列からWebVTT字幕フォーマット文字列を生成する
 */
export function exportToVtt(segments: TranscriptSegment[], applyPiiMask: boolean): string {
  const lines = ['WEBVTT\n'];
  for (const seg of segments) {
    const start = formatTimestamp(seg.startSec, '.');
    const end = formatTimestamp(seg.endSec, '.');
    const rawText = seg.text.trim() || '（音声区間）';
    const body = applyPiiMask ? applyMaskWithCount(rawText).maskedText : rawText;
    lines.push(`${start} --> ${end}\n${body}\n`);
  }
  return lines.join('\n');
}

/**
 * セグメント配列からタイムスタンプ付き議事録テキストを生成する
 */
export function exportToPlainText(
  segments: TranscriptSegment[],
  applyPiiMask: boolean,
  includeTimestamps = true
): { text: string; maskedCount: number } {
  let totalMasked = 0;
  const lines = segments.map((seg) => {
    const rawText = seg.text.trim() || '';
    let finalLine = rawText;
    if (applyPiiMask && rawText) {
      const res = applyMaskWithCount(rawText);
      finalLine = res.maskedText;
      totalMasked += res.count;
    }
    if (includeTimestamps) {
      return `[${formatTimestamp(seg.startSec)} - ${formatTimestamp(seg.endSec)}] ${finalLine}`;
    }
    return finalLine;
  });

  return {
    text: lines.join('\n'),
    maskedCount: totalMasked,
  };
}

/**
 * Web Audio API を用いて音声ファイル（MP3/WAV/M4A/WebM/OGG）をブラウザ内でデコードし、
 * 波形ピーク配列と発話区間（VAD: Voice Activity Detection）を自動検出する
 */
export async function analyzeAudioBufferLocal(
  arrayBuffer: ArrayBuffer,
  numWaveformBars = 120
): Promise<{
  durationSec: number;
  sampleRate: number;
  peaks: number[];
  detectedVoiceSegments: { startSec: number; endSec: number }[];
}> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const durationSec = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;

    // 1. 波形バー用ピーク抽出
    const peaks: number[] = [];
    const blockSize = Math.max(1, Math.floor(channelData.length / numWaveformBars));
    let maxPeak = 0.01;
    for (let i = 0; i < numWaveformBars; i++) {
      const start = i * blockSize;
      let sum = 0;
      let count = 0;
      for (let j = 0; j < blockSize && start + j < channelData.length; j += 4) {
        const v = Math.abs(channelData[start + j]);
        if (v > sum) sum = v;
        count++;
      }
      peaks.push(sum);
      if (sum > maxPeak) maxPeak = sum;
    }
    const normalizedPeaks = peaks.map((p) => Math.min(1, p / maxPeak));

    // 2. RMSエネルギーベースのローカルVAD（発話区間自動分割）
    const windowSec = 0.25;
    const windowSamples = Math.max(1, Math.floor(sampleRate * windowSec));
    const rmsList: number[] = [];
    let rmsSum = 0;

    for (let offset = 0; offset < channelData.length; offset += windowSamples) {
      let sq = 0;
      const limit = Math.min(channelData.length, offset + windowSamples);
      for (let i = offset; i < limit; i++) {
        sq += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sq / Math.max(1, limit - offset));
      rmsList.push(rms);
      rmsSum += rms;
    }

    const avgRms = rmsSum / Math.max(1, rmsList.length);
    const threshold = Math.max(0.008, avgRms * 0.45);

    const detectedVoiceSegments: { startSec: number; endSec: number }[] = [];
    let inSpeech = false;
    let segStart = 0;

    for (let w = 0; w < rmsList.length; w++) {
      const t = w * windowSec;
      const isActive = rmsList[w] >= threshold;
      if (isActive && !inSpeech) {
        inSpeech = true;
        segStart = t;
      } else if (!isActive && inSpeech) {
        const segEnd = t;
        if (segEnd - segStart >= 0.75) {
          detectedVoiceSegments.push({
            startSec: Number(segStart.toFixed(2)),
            endSec: Number(segEnd.toFixed(2)),
          });
        }
        inSpeech = false;
      }
    }

    if (inSpeech) {
      detectedVoiceSegments.push({
        startSec: Number(segStart.toFixed(2)),
        endSec: Number(durationSec.toFixed(2)),
      });
    }

    // 近接する発話セグメントを結合（最大8〜12秒単位の見やすい字幕ブロックに整形）
    const merged: { startSec: number; endSec: number }[] = [];
    for (const seg of detectedVoiceSegments) {
      if (merged.length === 0) {
        merged.push({ ...seg });
      } else {
        const prev = merged[merged.length - 1];
        if (seg.startSec - prev.endSec < 0.8 && seg.endSec - prev.startSec <= 10.0) {
          prev.endSec = seg.endSec;
        } else {
          merged.push({ ...seg });
        }
      }
    }

    if (merged.length === 0 && durationSec > 0) {
      merged.push({ startSec: 0, endSec: Number(durationSec.toFixed(2)) });
    }

    return {
      durationSec,
      sampleRate,
      peaks: normalizedPeaks,
      detectedVoiceSegments: merged,
    };
  } finally {
    if (ctx.state !== 'closed') {
      await ctx.close().catch(() => {});
    }
  }
}

/**
 * ワンクリック動作検証用：社外秘経営会議の模擬WAV音声（約12秒・発話エンベロープ付き）とローカル文字起こしセグメントをメモリ上で動的生成する
 */
export function generateSampleMeetingWavAndTranscript(): {
  fileName: string;
  wavBytes: Uint8Array;
  segments: TranscriptSegment[];
} {
  const sampleRate = 16000;
  const durationSec = 12;
  const totalSamples = sampleRate * durationSec;
  const pcmData = new Int16Array(totalSamples);

  // 3つの発話区間（0.5-3.8s, 4.4-8.0s, 8.5-11.5s）に自然な音声風フォルマント波形を生成
  const speechWindows = [
    { start: 0.4, end: 3.8, f1: 220, f2: 660 },
    { start: 4.3, end: 8.1, f1: 195, f2: 585 },
    { start: 8.6, end: 11.6, f1: 240, f2: 720 },
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let val = 0;
    for (const w of speechWindows) {
      if (t >= w.start && t <= w.end) {
        // 音節リズム変調
        const syllableEnv = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4.2 * t);
        const carrier =
          0.6 * Math.sin(2 * Math.PI * w.f1 * t) +
          0.3 * Math.sin(2 * Math.PI * w.f2 * t) +
          0.1 * Math.sin(2 * Math.PI * (w.f1 * 1.5) * t);
        val = carrier * syllableEnv * 0.35;
        break;
      }
    }
    pcmData[i] = Math.max(-32767, Math.min(32767, Math.round(val * 32767)));
  }

  // WAVヘッダ (44 bytes) 構築
  const wavBuffer = new ArrayBuffer(44 + pcmData.byteLength);
  const view = new DataView(wavBuffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // mono = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, pcmData.byteLength, true);

  new Uint8Array(wavBuffer, 44).set(new Uint8Array(pcmData.buffer));

  const segments: TranscriptSegment[] = [
    {
      id: 1,
      startSec: 0.4,
      endSec: 3.8,
      text: '本日の経営会議を始めます。新製品の想定単価は月額49,800円、初期導入目標は300社です。',
    },
    {
      id: 2,
      startSec: 4.3,
      endSec: 8.1,
      text: '法務担当の鈴木より報告します。顧客窓口の直通電話は 090-1234-5678、連絡先は legal-team@example.co.jp に一本化しました。',
    },
    {
      id: 3,
      startSec: 8.6,
      endSec: 11.6,
      text: 'マイナンバー確認番号 1234-5678-9012 等の機密データは外部クラウドへ送信せず、すべてローカル環境で処理してください。',
    },
  ];

  return {
    fileName: 'sample_confidential_board_meeting.wav',
    wavBytes: new Uint8Array(wavBuffer),
    segments,
  };
}
