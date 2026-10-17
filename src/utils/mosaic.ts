// src/utils/mosaic.ts
// ブラウザ内完結（外部送信0バイト）の画像モザイク・ぼかし・黒塗り一括処理＆サンプル生成ユーティリティ

export type MaskEffectType = 'pixelate' | 'blur' | 'blackout' | 'whiteout';

export interface NormalizedRegion {
  id: string;
  // 画像幅・高さに対する正規化座標 (0.0 ~ 1.0)
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  effect: MaskEffectType;
  strength: number; // pixelateのブロックサイズ比 または blur強度 (1 ~ 100)
}

/**
 * 指定されたCanvasコンテキスト上の矩形領域にモザイク・ぼかし・黒塗り等を適用する
 */
export function applyRegionEffect(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  region: NormalizedRegion
): void {
  const x = Math.max(0, Math.round(region.nx * canvasWidth));
  const y = Math.max(0, Math.round(region.ny * canvasHeight));
  const w = Math.min(canvasWidth - x, Math.round(region.nw * canvasWidth));
  const h = Math.min(canvasHeight - y, Math.round(region.nh * canvasHeight));

  if (w <= 1 || h <= 1) return;

  if (region.effect === 'blackout') {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  if (region.effect === 'whiteout') {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  if (region.effect === 'pixelate') {
    // ブロックサイズを計算（画像サイズと強度に応じて8px〜64px程度にスケーリング）
    const baseBlock = Math.max(6, Math.round((Math.max(canvasWidth, canvasHeight) / 800) * region.strength));
    const blockSize = Math.max(4, baseBlock);

    const imgData = ctx.getImageData(x, y, w, h);
    const data = imgData.data;

    for (let by = 0; by < h; by += blockSize) {
      for (let bx = 0; bx < w; bx += blockSize) {
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;
        let count = 0;

        const maxY = Math.min(h, by + blockSize);
        const maxX = Math.min(w, bx + blockSize);

        for (let py = by; py < maxY; py++) {
          for (let px = bx; px < maxX; px++) {
            const idx = (py * w + px) * 4;
            rSum += data[idx];
            gSum += data[idx + 1];
            bSum += data[idx + 2];
            aSum += data[idx + 3];
            count++;
          }
        }

        const rAvg = Math.round(rSum / count);
        const gAvg = Math.round(gSum / count);
        const bAvg = Math.round(bSum / count);
        const aAvg = Math.round(aSum / count);

        for (let py = by; py < maxY; py++) {
          for (let px = bx; px < maxX; px++) {
            const idx = (py * w + px) * 4;
            data[idx] = rAvg;
            data[idx + 1] = gAvg;
            data[idx + 2] = bAvg;
            data[idx + 3] = aAvg;
          }
        }
      }
    }

    ctx.putImageData(imgData, x, y);
    return;
  }

  if (region.effect === 'blur') {
    // 縮小＆拡大補間＋複数パスによる不可逆ガウシアン風ブラー（元の文字・顔を完全復元不能にする）
    const scaleFactor = Math.max(4, Math.round(region.strength * 0.7));
    const smallW = Math.max(2, Math.round(w / scaleFactor));
    const smallH = Math.max(2, Math.round(h / scaleFactor));

    const offCanvas = document.createElement('canvas');
    offCanvas.width = smallW;
    offCanvas.height = smallH;
    const offCtx = offCanvas.getContext('2d')!;
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';

    // 元領域を極小Canvasへ縮小転写
    offCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, smallW, smallH);

    // 元のCanvasへ拡大描画
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('filter' in ctx) {
      ctx.filter = `blur(${Math.max(4, Math.round(region.strength / 2))}px)`;
    }
    ctx.drawImage(offCanvas, 0, 0, smallW, smallH, x, y, w, h);
    ctx.filter = 'none';
    ctx.restore();
  }
}

/**
 * 画像バイト列に指定領域リストのモザイク・黒塗りを適用し、新しい画像バイト列（EXIF完全除去済）を返す
 */
export async function renderMaskedImageBytes(
  sourceBytes: Uint8Array,
  mimeType: string,
  regions: NormalizedRegion[]
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const buf = sourceBytes.buffer.slice(
    sourceBytes.byteOffset,
    sourceBytes.byteOffset + sourceBytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([buf], { type: mimeType });
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  for (const reg of regions) {
    applyRegionEffect(ctx, canvas.width, canvas.height, reg);
  }

  const outMime =
    mimeType === 'image/png'
      ? 'image/png'
      : mimeType === 'image/webp'
      ? 'image/webp'
      : 'image/jpeg';

  const outBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('画像の出力に失敗しました'))),
      outMime,
      outMime === 'image/png' ? undefined : 0.92
    );
  });

  const outBuf = await outBlob.arrayBuffer();
  return {
    bytes: new Uint8Array(outBuf),
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * ワンクリック動作検証用：社外秘管理画面キャプチャ＆車両ナンバー風サンプル画像2枚と初期モザイク座標を生成
 */
export async function generateSampleMosaicImages(): Promise<
  {
    name: string;
    bytes: Uint8Array;
    mimeType: string;
    presetRegions: NormalizedRegion[];
  }[]
> {
  const results: {
    name: string;
    bytes: Uint8Array;
    mimeType: string;
    presetRegions: NormalizedRegion[];
  }[] = [];

  // サンプル1: 社外秘CRM・顧客管理画面キャプチャ
  {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d')!;

    // 背景
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 800, 500);

    // ブラウザバー風ヘッダ
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 800, 52);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(24, 26, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(46, 26, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(68, 26, 7, 0, Math.PI * 2);
    ctx.fill();

    // URLバー（機密テナントURL）
    ctx.fillStyle = '#090d16';
    ctx.fillRect(100, 12, 520, 28);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px monospace';
    ctx.fillText('https://internal-admin.corp-secret.local/customers/detail?id=99482', 114, 31);

    // コンテンツカード
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, 80, 720, 380);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 80, 720, 380);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('【社外秘】顧客アカウント詳細・APIシークレット管理画面', 65, 120);

    // 顔写真アイコン枠
    ctx.fillStyle = '#334155';
    ctx.fillRect(65, 150, 120, 140);
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(125, 200, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(85, 240, 80, 45);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('本人確認顔写真', 82, 310);

    // 機密情報テキスト
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('氏名: 山田 太郎 (Yamada Taro) / 役職: 決済承認責任者', 215, 175);
    ctx.fillText('直通携帯: 090-1234-5678 / メール: t.yamada@example.co.jp', 215, 215);
    ctx.fillText('自宅住所: 東京都千代田区丸の内1-9-1 グラントウキョウ28F', 215, 255);

    // 本番APIキー枠
    ctx.fillStyle = '#090d16';
    ctx.fillRect(65, 340, 670, 90);
    ctx.strokeStyle = '#f43f5e';
    ctx.strokeRect(65, 340, 670, 90);
    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('⚠️ PRODUCTION SECRET API KEY & VEHICLE LICENSE PLATE', 85, 368);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('API_KEY = sec_demo_998877665544332211_KEY', 85, 398);
    ctx.fillText('社用車ナンバー: 品川 300 あ 12-34', 85, 422);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());

    results.push({
      name: 'sample_01_admin_screenshot.png',
      bytes,
      mimeType: 'image/png',
      presetRegions: [
        // URLバー
        { id: 'r1', nx: 0.125, ny: 0.024, nw: 0.65, nh: 0.056, effect: 'pixelate', strength: 16 },
        // 顔写真
        { id: 'r2', nx: 0.08, ny: 0.3, nw: 0.15, nh: 0.28, effect: 'pixelate', strength: 20 },
        // 氏名・電話・住所
        { id: 'r3', nx: 0.265, ny: 0.31, nw: 0.65, nh: 0.22, effect: 'blur', strength: 22 },
        // APIキー＆ナンバー黒塗り
        { id: 'r4', nx: 0.1, ny: 0.755, nw: 0.8, nh: 0.1, effect: 'blackout', strength: 20 },
      ],
    });
  }

  // サンプル2: 同様のレイアウトの別顧客キャプチャ（一括適用テスト用）
  {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 800, 500);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 800, 52);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(100, 12, 520, 28);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px monospace';
    ctx.fillText('https://internal-admin.corp-secret.local/customers/detail?id=99483', 114, 31);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, 80, 720, 380);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 80, 720, 380);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('【社外秘】顧客アカウント詳細・APIシークレット管理画面 (#2)', 65, 120);

    ctx.fillStyle = '#334155';
    ctx.fillRect(65, 150, 120, 140);
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(125, 200, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(85, 240, 80, 45);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('氏名: 佐藤 花子 (Sato Hanako) / 役職: 経理部長', 215, 175);
    ctx.fillText('直通携帯: 080-9876-5432 / メール: h.sato@example.co.jp', 215, 215);
    ctx.fillText('自宅住所: 大阪府大阪市北区梅田3-1-1', 215, 255);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(65, 340, 670, 90);
    ctx.strokeStyle = '#f43f5e';
    ctx.strokeRect(65, 340, 670, 90);
    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('⚠️ PRODUCTION SECRET API KEY & VEHICLE LICENSE PLATE', 85, 368);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('API_KEY = sec_demo_112233445566778899_KEY', 85, 398);
    ctx.fillText('社用車ナンバー: なにわ 500 さ 88-99', 85, 422);

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());

    results.push({
      name: 'sample_02_admin_screenshot.png',
      bytes,
      mimeType: 'image/png',
      presetRegions: [],
    });
  }

  return results;
}
