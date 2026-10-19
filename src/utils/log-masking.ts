// HARファイル、JSONログ、.env、テキストログの機密トークン・認証情報・PII一括無害化エンジン
// 外部通信0バイト・純粋クライアントサイド処理

export interface MaskingOptions {
  maskCookies: boolean;          // Cookie / Set-Cookie ヘッダーおよび cookies 配列
  maskAuthHeaders: boolean;      // Authorization (Bearer, Basic等), x-api-key 等
  maskApiKeys: boolean;          // OpenAI (sk-), AWS (AKIA), Stripe (sk_live), GitHub (ghp_), etc.
  maskEmails: boolean;           // メールアドレス
  maskIpAddresses: boolean;      // IPv4 アドレス
  maskEnvSecrets: boolean;       // .env 内の SECRET, KEY, PASSWORD, TOKEN 等
  maskPostData: boolean;         // HAR request/response postData 内の JSON・機密文字列
  customKeywords: string[];      // ユーザー指定の追加伏字キーワード
}

export interface MaskResult {
  maskedContent: string;
  detectedCounts: {
    cookies: number;
    authHeaders: number;
    apiKeys: number;
    emails: number;
    ips: number;
    envSecrets: number;
    customKeywords: number;
    total: number;
  };
  fileType: 'har' | 'env' | 'json' | 'log';
}

export const DEFAULT_LOG_OPTIONS: MaskingOptions = {
  maskCookies: true,
  maskAuthHeaders: true,
  maskApiKeys: true,
  maskEmails: true,
  maskIpAddresses: true,
  maskEnvSecrets: true,
  maskPostData: true,
  customKeywords: [],
};

// 代表的なAPIキー・トークンの正規表現パターン
const API_KEY_PATTERNS = [
  // OpenAI: sk-..., sk-proj-...
  /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
  // AWS Access Key ID: AKIA...
  /\bAKIA[0-9A-Z]{16}\b/g,
  // GitHub Personal Access Token: ghp_...
  /\bghp_[a-zA-Z0-9_-]{30,}\b/g,
  // Stripe Secret Key: sk_live_..., rk_live_...
  /\b[sr]k_(?:live|test)_[a-zA-Z0-9_-]{20,}\b/g,
  // Slack Webhook URL / Tokens: xoxb-..., xoxp-...
  /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g,
  // Private Key Block: -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[a-zA-Z0-9+/=\r\n]+-----END [A-Z ]*PRIVATE KEY-----/g,
];

// メールアドレス正規表現
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// IPv4 アドレス正規表現（プライベート・パブリック共通）
const IP_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;

/**
 * ファイル種別を判定
 */
export function detectLogFileType(filename: string, content: string): 'har' | 'env' | 'json' | 'log' {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith('.har')) return 'har';
  if (lowerName === '.env' || lowerName.endsWith('.env') || lowerName.includes('.env.')) return 'env';
  if (lowerName.endsWith('.json')) {
    // HAR構造か通常のJSONかを中身で判別
    try {
      const parsed = JSON.parse(content);
      if (parsed && parsed.log && Array.isArray(parsed.log.entries)) {
        return 'har';
      }
      return 'json';
    } catch {
      return 'json';
    }
  }

  // 拡張子がない場合の中身判別
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.log && Array.isArray(parsed.log.entries)) return 'har';
      return 'json';
    } catch {}
  }

  // .env パターン行が多いか
  const lines = content.split('\n').filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
  const envLikeLines = lines.filter((l) => /^[A-Z0-9_]+=[^\r\n]*$/.test(l.trim()));
  if (lines.length > 0 && envLikeLines.length / lines.length > 0.6) {
    return 'env';
  }

  return 'log';
}

/**
 * プレーンテキスト内のAPIキー・メール・IP・カスタム語句を置換する共通ヘルパー
 */
function sanitizeTextContent(
  text: string,
  options: MaskingOptions,
  counts: MaskResult['detectedCounts']
): string {
  let result = text;

  // カスタムキーワード
  if (options.customKeywords && options.customKeywords.length > 0) {
    for (const kw of options.customKeywords) {
      if (!kw.trim()) continue;
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const matches = result.match(regex);
      if (matches) {
        counts.customKeywords += matches.length;
        counts.total += matches.length;
        result = result.replace(regex, '[REDACTED_CUSTOM]');
      }
    }
  }

  // APIキー
  if (options.maskApiKeys) {
    for (const pat of API_KEY_PATTERNS) {
      const matches = result.match(pat);
      if (matches) {
        counts.apiKeys += matches.length;
        counts.total += matches.length;
        result = result.replace(pat, '[REDACTED_API_KEY]');
      }
    }
  }

  // メールアドレス
  if (options.maskEmails) {
    const matches = result.match(EMAIL_REGEX);
    if (matches) {
      counts.emails += matches.length;
      counts.total += matches.length;
      result = result.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
    }
  }

  // IPアドレス
  if (options.maskIpAddresses) {
    // 0.0.0.0 や 127.0.0.1 などの安全なIPもマスク対象（外部ベンダー提出時のインフラ隠蔽用）
    const matches = result.match(IP_REGEX);
    if (matches) {
      counts.ips += matches.length;
      counts.total += matches.length;
      result = result.replace(IP_REGEX, '[REDACTED_IP]');
    }
  }

  return result;
}

/**
 * .env ファイルの機密値マスク処理
 */
export function maskEnvContent(content: string, options: MaskingOptions): MaskResult {
  const counts: MaskResult['detectedCounts'] = {
    cookies: 0,
    authHeaders: 0,
    apiKeys: 0,
    emails: 0,
    ips: 0,
    envSecrets: 0,
    customKeywords: 0,
    total: 0,
  };

  const secretKeyRegex = /(SECRET|PASSWORD|PASS|PWD|KEY|TOKEN|AUTH|PRIVATE|CREDENTIAL|CERT|DATABASE_URL|DB_PASS|API_KEY|CLIENT_SECRET|ACCESS_KEY)/i;

  const lines = content.split('\n');
  const maskedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line; // コメント行は保持

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return line;

    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);

    if (options.maskEnvSecrets && secretKeyRegex.test(key)) {
      if (value.trim().length > 0) {
        counts.envSecrets++;
        counts.total++;
        // クォートがある場合はクォートを残す
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          const q = value[0];
          return `${key}=${q}[REDACTED_SECRET]${q}`;
        }
        return `${key}=[REDACTED_SECRET]`;
      }
    }

    // 値内部のメールやIP・APIキーを置換
    const sanitizedVal = sanitizeTextContent(value, options, counts);
    return `${key}=${sanitizedVal}`;
  });

  return {
    maskedContent: maskedLines.join('\n'),
    detectedCounts: counts,
    fileType: 'env',
  };
}

/**
 * HAR (HTTP Archive) JSON の構造化マスク処理
 */
export function maskHarContent(content: string, options: MaskingOptions): MaskResult {
  const counts: MaskResult['detectedCounts'] = {
    cookies: 0,
    authHeaders: 0,
    apiKeys: 0,
    emails: 0,
    ips: 0,
    envSecrets: 0,
    customKeywords: 0,
    total: 0,
  };

  let harObj: any;
  try {
    harObj = JSON.parse(content);
  } catch (err) {
    // JSONとして不正な場合はプレーンテキストとして処理
    return maskPlainLogContent(content, options);
  }

  if (!harObj || !harObj.log || !Array.isArray(harObj.log.entries)) {
    return maskJsonContent(content, options);
  }

  const sensitiveHeaders = [
    'authorization',
    'proxy-authorization',
    'x-api-key',
    'x-auth-token',
    'apikey',
    'cookie',
    'set-cookie',
    'token',
    'session',
  ];

  for (const entry of harObj.log.entries) {
    // 1. リクエスト / レスポンスのヘッダー処理
    const sanitizeHeaders = (headers: any[]) => {
      if (!Array.isArray(headers)) return;
      for (const h of headers) {
        if (!h || typeof h.name !== 'string') continue;
        const nameLower = h.name.toLowerCase();

        if (options.maskCookies && (nameLower === 'cookie' || nameLower === 'set-cookie')) {
          counts.cookies++;
          counts.total++;
          h.value = '[REDACTED_COOKIE]';
        } else if (options.maskAuthHeaders && sensitiveHeaders.includes(nameLower)) {
          counts.authHeaders++;
          counts.total++;
          h.value = '[REDACTED_AUTH_HEADER]';
        } else if (typeof h.value === 'string') {
          h.value = sanitizeTextContent(h.value, options, counts);
        }
      }
    };

    if (entry.request && Array.isArray(entry.request.headers)) {
      sanitizeHeaders(entry.request.headers);
    }
    if (entry.response && Array.isArray(entry.response.headers)) {
      sanitizeHeaders(entry.response.headers);
    }

    // 2. cookies 配列の処理
    const sanitizeCookies = (cookies: any[]) => {
      if (!Array.isArray(cookies)) return;
      for (const c of cookies) {
        if (options.maskCookies && c && typeof c.value === 'string') {
          counts.cookies++;
          counts.total++;
          c.value = '[REDACTED_COOKIE_VALUE]';
        }
      }
    };

    if (entry.request && Array.isArray(entry.request.cookies)) {
      sanitizeCookies(entry.request.cookies);
    }
    if (entry.response && Array.isArray(entry.response.cookies)) {
      sanitizeCookies(entry.response.cookies);
    }

    // 3. クエリパラメータ（queryString）
    if (entry.request && Array.isArray(entry.request.queryString)) {
      for (const q of entry.request.queryString) {
        if (!q || typeof q.name !== 'string') continue;
        const qName = q.name.toLowerCase();
        if (/token|key|secret|auth|code|password|access_token|refresh_token/.test(qName)) {
          counts.authHeaders++;
          counts.total++;
          q.value = '[REDACTED_QUERY_PARAM]';
        } else if (typeof q.value === 'string') {
          q.value = sanitizeTextContent(q.value, options, counts);
        }
      }
    }

    // 4. postData (リクエストボディ)
    if (options.maskPostData && entry.request && entry.request.postData && typeof entry.request.postData.text === 'string') {
      entry.request.postData.text = sanitizeTextContent(entry.request.postData.text, options, counts);
    }

    // 5. response.content (レスポンスボディ)
    if (options.maskPostData && entry.response && entry.response.content && typeof entry.response.content.text === 'string') {
      entry.response.content.text = sanitizeTextContent(entry.response.content.text, options, counts);
    }

    // 6. URL 内のトークン・IP・カスタムキーワード
    if (entry.request && typeof entry.request.url === 'string') {
      entry.request.url = sanitizeTextContent(entry.request.url, options, counts);
    }
  }

  return {
    maskedContent: JSON.stringify(harObj, null, 2),
    detectedCounts: counts,
    fileType: 'har',
  };
}

/**
 * 一般 JSON ログの再帰的マスク処理
 */
export function maskJsonContent(content: string, options: MaskingOptions): MaskResult {
  const counts: MaskResult['detectedCounts'] = {
    cookies: 0,
    authHeaders: 0,
    apiKeys: 0,
    emails: 0,
    ips: 0,
    envSecrets: 0,
    customKeywords: 0,
    total: 0,
  };

  let obj: any;
  try {
    obj = JSON.parse(content);
  } catch {
    return maskPlainLogContent(content, options);
  }

  const sensitiveKeyRegex = /(password|passwd|secret|token|auth|cookie|apiKey|access_token|private_key|creditCard|ssn|myNumber)/i;

  function traverse(node: any) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === 'string') {
          node[i] = sanitizeTextContent(node[i], options, counts);
        } else if (typeof node[i] === 'object') {
          traverse(node[i]);
        }
      }
      return;
    }

    for (const key of Object.keys(node)) {
      const val = node[key];
      if (typeof val === 'string') {
        if (options.maskAuthHeaders && sensitiveKeyRegex.test(key)) {
          counts.authHeaders++;
          counts.total++;
          node[key] = '[REDACTED_SECRET]';
        } else {
          node[key] = sanitizeTextContent(val, options, counts);
        }
      } else if (typeof val === 'object') {
        traverse(val);
      }
    }
  }

  traverse(obj);

  return {
    maskedContent: JSON.stringify(obj, null, 2),
    detectedCounts: counts,
    fileType: 'json',
  };
}

/**
 * プレーンテキストログのマスク処理
 */
export function maskPlainLogContent(content: string, options: MaskingOptions): MaskResult {
  const counts: MaskResult['detectedCounts'] = {
    cookies: 0,
    authHeaders: 0,
    apiKeys: 0,
    emails: 0,
    ips: 0,
    envSecrets: 0,
    customKeywords: 0,
    total: 0,
  };

  // Authorization: Bearer ... パターンの行単位処理
  let text = content;
  if (options.maskAuthHeaders) {
    const bearerRegex = /(Bearer\s+)[a-zA-Z0-9_\-\.]{15,}/gi;
    const bearerMatches = text.match(bearerRegex);
    if (bearerMatches) {
      counts.authHeaders += bearerMatches.length;
      counts.total += bearerMatches.length;
      text = text.replace(bearerRegex, '$1[REDACTED_BEARER_TOKEN]');
    }

    const basicRegex = /(Basic\s+)[a-zA-Z0-9+/=]{15,}/gi;
    const basicMatches = text.match(basicRegex);
    if (basicMatches) {
      counts.authHeaders += basicMatches.length;
      counts.total += basicMatches.length;
      text = text.replace(basicRegex, '$1[REDACTED_BASIC_AUTH]');
    }
  }

  // Cookie: ... パターン
  if (options.maskCookies) {
    const cookieHeaderRegex = /(Cookie:\s*)([^\r\n]+)/gi;
    const cookieMatches = text.match(cookieHeaderRegex);
    if (cookieMatches) {
      counts.cookies += cookieMatches.length;
      counts.total += cookieMatches.length;
      text = text.replace(cookieHeaderRegex, '$1[REDACTED_COOKIES]');
    }
  }

  const masked = sanitizeTextContent(text, options, counts);

  return {
    maskedContent: masked,
    detectedCounts: counts,
    fileType: 'log',
  };
}

/**
 * メインエントリー関数：ファイル名と中身に応じて最適なマスク処理を実行
 */
export function processLogMasking(
  filename: string,
  content: string,
  options: MaskingOptions = DEFAULT_LOG_OPTIONS
): MaskResult {
  const detectedType = detectLogFileType(filename, content);
  switch (detectedType) {
    case 'har':
      return maskHarContent(content, options);
    case 'env':
      return maskEnvContent(content, options);
    case 'json':
      return maskJsonContent(content, options);
    case 'log':
    default:
      return maskPlainLogContent(content, options);
  }
}

/**
 * 検証・デモ用サンプルHARデータ生成ヘルパー
 */
export function generateSampleHar(): string {
  const sample = {
    log: {
      version: '1.2',
      creator: { name: 'Chrome DevTools', version: '124.0.0.0' },
      entries: [
        {
          startedDateTime: '2026-10-19T10:00:00.000Z',
          time: 120,
          request: {
            method: 'POST',
            url: 'https://api.internal-saas.com/v1/users/checkout?token=sec_query_token_1234567890',
            httpVersion: 'HTTP/2.0',
            cookies: [
              { name: 'session_id', value: 'sess_secret_cookie_abcdef1234567890' },
              { name: 'remember_token', value: 'rem_token_999988887777' },
            ],
            headers: [
              { name: 'Host', value: 'api.internal-saas.com' },
              { name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample_secret_payload.signature' },
              { name: 'x-api-key', value: 'sk-proj-openai_live_secret_key_abcdef1234567890' },
              { name: 'Cookie', value: 'session_id=sess_secret_cookie_abcdef1234567890; user_id=1042' },
              { name: 'User-Agent', value: 'Mozilla/5.0 Chrome/124.0.0.0' },
            ],
            queryString: [
              { name: 'token', value: 'sec_query_token_1234567890' },
              { name: 'tenant_ip', value: '192.168.1.105' },
            ],
            postData: {
              mimeType: 'application/json',
              text: JSON.stringify({
                admin_email: 'security-admin@zeroleak-enterprise.jp',
                aws_access_key: 'AKIA' + 'FAKEACCESSKEY999',
                stripe_key: 'sk_test_' + 'fake_sample_dummy_stripe_key_0000',
                internal_ip: '10.0.4.15',
              }),
            },
          },
          response: {
            status: 200,
            statusText: 'OK',
            httpVersion: 'HTTP/2.0',
            headers: [
              { name: 'Set-Cookie', value: 'session_id=new_sess_secret_cookie_9999; Secure; HttpOnly; SameSite=Strict' },
              { name: 'Content-Type', value: 'application/json' },
            ],
            cookies: [
              { name: 'session_id', value: 'new_sess_secret_cookie_9999' },
            ],
            content: {
              size: 150,
              mimeType: 'application/json',
              text: JSON.stringify({
                status: 'success',
                user_email: 'k.sato@example.co.jp',
                client_secret: 'sec_client_secret_987654321',
              }),
            },
          },
        },
      ],
    },
  };
  return JSON.stringify(sample, null, 2);
}

/**
 * 検証・デモ用サンプル.envデータ生成ヘルパー
 */
export function generateSampleEnv(): string {
  return `# Production Environment Settings (Confidential)
PORT=3000
NODE_ENV=production
APP_URL=https://app.zeroleaktools.com

# Database Credentials
DATABASE_URL="postgres://admin_user:P@ssw0rd999_SuperSecret@10.0.1.20:5432/production_db"
DB_PASSWORD="SuperSecretPassword2026!"

# API Keys & Third-Party Secrets (Dummy Safe Values)
OPENAI_API_KEY="sk-proj-fake-sample-dummy-openai-key-999999999999"
AWS_ACCESS_KEY_ID="AKIA" + "FAKEACCESSKEY9999"
AWS_SECRET_ACCESS_KEY="fake_sample_aws_secret_access_key_placeholder"
STRIPE_SECRET_KEY="sk_test_fake_sample_dummy_stripe_key_99999"
GITHUB_TOKEN="ghp_fake_sample_dummy_github_token_000000000"

# Admin Contacts
ADMIN_EMAIL=security-officer@zeroleak-enterprise.jp
SERVER_IP=198.51.100.42
`;
}

