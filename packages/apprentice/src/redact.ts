// Sensitive data redaction for Apprentice

interface RedactionPattern {
  pattern: RegExp;
  replacement: string;
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  // API Keys
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[OPENAI_KEY]' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: '[GITHUB_TOKEN]' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, replacement: '[GITHUB_OAUTH]' },
  { pattern: /github_pat_[a-zA-Z0-9_]{22,}/g, replacement: '[GITHUB_PAT]' },
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: '[AWS_KEY]' },
  { pattern: /xox[baprs]-[a-zA-Z0-9-]+/g, replacement: '[SLACK_TOKEN]' },
  { pattern: /sk_live_[a-zA-Z0-9]+/g, replacement: '[STRIPE_KEY]' },
  { pattern: /sk_test_[a-zA-Z0-9]+/g, replacement: '[STRIPE_TEST_KEY]' },
  { pattern: /sq0[a-z]{3}-[a-zA-Z0-9-_]{22,}/g, replacement: '[SQUARE_TOKEN]' },

  // NPM tokens
  { pattern: /npm_[a-zA-Z0-9]{36}/g, replacement: '[NPM_TOKEN]' },

  // Passwords in URLs
  { pattern: /:\/\/([^:]+):([^@]+)@/g, replacement: '://$1:[REDACTED]@' },

  // Environment variable assignments with sensitive names
  {
    pattern:
      /\b(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|AUTH_TOKEN|ACCESS_TOKEN|REFRESH_TOKEN)=\S+/gi,
    replacement: '$1=[REDACTED]',
  },

  // Bearer tokens
  { pattern: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },

  // Basic auth headers
  { pattern: /Basic\s+[a-zA-Z0-9+/=]+/gi, replacement: 'Basic [REDACTED]' },

  // JWT tokens (three base64 segments separated by dots)
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    replacement: '[JWT_TOKEN]',
  },

  // Private keys
  {
    pattern:
      /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
    replacement: '[PRIVATE_KEY]',
  },

  // SSH keys
  { pattern: /ssh-rsa\s+[A-Za-z0-9+/=]+/g, replacement: 'ssh-rsa [REDACTED]' },
  {
    pattern: /ssh-ed25519\s+[A-Za-z0-9+/=]+/g,
    replacement: 'ssh-ed25519 [REDACTED]',
  },
];

/**
 * Redact sensitive data from a string
 */
export function redact(input: string): string {
  let result = input;

  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Check if a string contains potentially sensitive data
 */
export function containsSensitiveData(input: string): boolean {
  for (const { pattern } of REDACTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}
