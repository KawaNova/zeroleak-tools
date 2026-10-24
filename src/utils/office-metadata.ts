// Office文書（Excel .xlsx / Word .docx / PowerPoint .pptx）の
// 作成者・最終保存者・会社名・コメント履歴等の機密メタデータ完全消去エンジン
// 外部通信0バイト・純粋クライアントサイド処理（JSZip使用）
import JSZip from 'jszip';

export interface OfficeMetadata {
  creator?: string;
  lastModifiedBy?: string;
  company?: string;
  manager?: string;
  title?: string;
  subject?: string;
  description?: string;
  keywords?: string;
  created?: string;
  modified?: string;
  revision?: string;
  application?: string;
  totalPropertiesFound: number;
}

export interface OfficeWipeResult {
  cleanedBytes: Uint8Array;
  detectedMetadata: OfficeMetadata;
  removedPropertiesCount: number;
  filename: string;
  format: 'xlsx' | 'docx' | 'pptx';
  cleanedFileSize: number;
  originalFileSize: number;
}

/**
 * XMLテキストから特定タグの内容を抽出
 */
function extractTagContent(xml: string, tagName: string): string | undefined {
  // 名前空間プレフィックスがあってもなくてもマッチ（例: <dc:creator> または <creator>）
  const escaped = tagName.replace(':', '\\:');
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${escaped}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${escaped}>`, 'i');
  const match = xml.match(regex);
  if (match && match[1]) {
    const val = match[1].trim();
    return val.length > 0 ? val : undefined;
  }
  return undefined;
}

/**
 * XMLテキストから指定タグを削除（または空要素化）
 */
function removeTag(xml: string, tagName: string): { updatedXml: string; removed: boolean } {
  const escaped = tagName.replace(':', '\\:');
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${escaped}(?:\\s+[^>]*)?>[\\s\\S]*?<\\/(?:[a-zA-Z0-9_-]+:)?${escaped}>`, 'gi');
  const hasMatch = regex.test(xml);
  const updatedXml = xml.replace(regex, '');
  return { updatedXml, removed: hasMatch };
}

/**
 * ファイル名からOffice形式を判定
 */
export function detectOfficeFormat(filename: string): 'xlsx' | 'docx' | 'pptx' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.xltx')) return 'xlsx';
  if (lower.endsWith('.pptx') || lower.endsWith('.potx')) return 'pptx';
  return 'docx';
}

/**
 * Office文書（ZIP）内のメタデータを解析・抽出
 */
export async function inspectOfficeMetadata(fileBytes: Uint8Array | ArrayBuffer): Promise<OfficeMetadata> {
  const zip = await JSZip.loadAsync(fileBytes);
  const meta: OfficeMetadata = {
    totalPropertiesFound: 0,
  };

  // 1. docProps/core.xml の走査
  const coreFile = zip.file('docProps/core.xml');
  if (coreFile) {
    const coreXml = await coreFile.async('text');
    meta.creator = extractTagContent(coreXml, 'creator');
    meta.lastModifiedBy = extractTagContent(coreXml, 'lastModifiedBy');
    meta.title = extractTagContent(coreXml, 'title');
    meta.subject = extractTagContent(coreXml, 'subject');
    meta.description = extractTagContent(coreXml, 'description');
    meta.keywords = extractTagContent(coreXml, 'keywords');
    meta.created = extractTagContent(coreXml, 'created');
    meta.modified = extractTagContent(coreXml, 'modified');
    meta.revision = extractTagContent(coreXml, 'revision');
  }

  // 2. docProps/app.xml の走査
  const appFile = zip.file('docProps/app.xml');
  if (appFile) {
    const appXml = await appFile.async('text');
    meta.company = extractTagContent(appXml, 'Company');
    meta.manager = extractTagContent(appXml, 'Manager');
    meta.application = extractTagContent(appXml, 'Application');
  }

  // 検出件数をカウント
  let count = 0;
  if (meta.creator) count++;
  if (meta.lastModifiedBy) count++;
  if (meta.company) count++;
  if (meta.manager) count++;
  if (meta.title) count++;
  if (meta.subject) count++;
  if (meta.description) count++;
  if (meta.keywords) count++;
  if (meta.created) count++;
  if (meta.modified) count++;
  if (meta.revision) count++;

  meta.totalPropertiesFound = count;
  return meta;
}

/**
 * Office文書から機密メタデータを完全消去し、安全なファイルを再生成
 */
export async function wipeOfficeMetadata(
  fileBytes: Uint8Array | ArrayBuffer,
  filename: string
): Promise<OfficeWipeResult> {
  const originalSize = fileBytes instanceof Uint8Array ? fileBytes.byteLength : fileBytes.byteLength;
  const zip = await JSZip.loadAsync(fileBytes);
  const detectedMetadata = await inspectOfficeMetadata(fileBytes);
  let removedCount = 0;

  // 1. docProps/core.xml のクリーンアップ
  const coreFile = zip.file('docProps/core.xml');
  if (coreFile) {
    let coreXml = await coreFile.async('text');
    const tagsToRemove = [
      'creator',
      'lastModifiedBy',
      'title',
      'subject',
      'description',
      'keywords',
      'category',
      'created',
      'modified',
      'revision',
    ];

    for (const tag of tagsToRemove) {
      const res = removeTag(coreXml, tag);
      if (res.removed) {
        coreXml = res.updatedXml;
        removedCount++;
      }
    }

    zip.file('docProps/core.xml', coreXml);
  }

  // 2. docProps/app.xml のクリーンアップ
  const appFile = zip.file('docProps/app.xml');
  if (appFile) {
    let appXml = await appFile.async('text');
    const appTagsToRemove = ['Company', 'Manager', 'Template'];
    for (const tag of appTagsToRemove) {
      const res = removeTag(appXml, tag);
      if (res.removed) {
        appXml = res.updatedXml;
        removedCount++;
      }
    }
    // TotalTime は "0" にリセット
    appXml = appXml.replace(/<TotalTime[^>]*>[\s\S]*?<\/TotalTime>/gi, '<TotalTime>0</TotalTime>');

    zip.file('docProps/app.xml', appXml);
  }

  // 3. docProps/custom.xml のクリーンアップ（存在する場合）
  const customFile = zip.file('docProps/custom.xml');
  if (customFile) {
    const cleanCustomXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"></Properties>';
    zip.file('docProps/custom.xml', cleanCustomXml);
    removedCount++;
  }

  // 再圧縮
  const cleanedBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    cleanedBytes,
    detectedMetadata,
    removedPropertiesCount: Math.max(removedCount, detectedMetadata.totalPropertiesFound),
    filename,
    format: detectOfficeFormat(filename),
    cleanedFileSize: cleanedBytes.byteLength,
    originalFileSize: originalSize,
  };
}

/**
 * テスト・検証用：機密メタデータ（作成者・会社名・更新者等）が含まれる合成サンプルWord文書（.docx）をブラウザ内で即時生成
 */
export async function generateSampleOfficeDocx(): Promise<Uint8Array> {
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
  );

  // _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  );

  // word/document.xml
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>社外秘 新規事業計画書（提携候補先への提示資料）</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  );

  // docProps/core.xml（機密情報入り）
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/coreProperties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>極秘_プロジェクトChronos見積</dc:title>
  <dc:subject>事業計画・外注提携先リスト</dc:subject>
  <dc:creator>佐藤 健太郎 (CEO)</dc:creator>
  <cp:keywords>社外秘, 下請け, 原価見積</cp:keywords>
  <dc:description>取引先A社向け最終提案</dc:description>
  <cp:lastModifiedBy>鈴木 一郎 (外部委託リードエンジニア)</cp:lastModifiedBy>
  <cp:revision>7</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-04-12T10:15:30Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-24T18:45:10Z</dcterms:modified>
</cp:coreProperties>`
  );

  // docProps/app.xml（会社名・管理者名入り）
  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Template>Normal.dotm</Template>
  <TotalTime>320</TotalTime>
  <Application>Microsoft Office Word</Application>
  <Manager>高橋 取締役</Manager>
  <Company>株式会社パートナー開発コンサルティング</Company>
</Properties>`
  );

  return await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
}
