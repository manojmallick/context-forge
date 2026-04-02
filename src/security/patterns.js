'use strict';

/**
 * Secret detection patterns for SigMap scanner.
 * Each pattern has a name and a regex tested against signature strings.
 */
const PATTERNS = [
  {
    name: 'AWS Access Key',
    regex: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: 'AWS Secret Key',
    // 40-char base64-like string following common AWS secret key assignment patterns
    regex: /(?:aws_secret|secret_access_key|SecretAccessKey)\s*[:=]\s*['"]?[0-9a-zA-Z/+]{40}/i,
  },
  {
    name: 'GCP API Key',
    regex: /AIza[0-9A-Za-z\-_]{35}/,
  },
  {
    name: 'GitHub Token',
    regex: /gh[pousr]_[A-Za-z0-9_]{36,}/,
  },
  {
    name: 'JWT Token',
    regex: /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/,
  },
  {
    name: 'DB Connection String',
    regex: /(mongodb|postgres|postgresql|mysql|redis):\/\/[^:]+:[^@]+@/i,
  },
  {
    name: 'SSH Private Key',
    regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  {
    name: 'Stripe Key',
    regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/,
  },
  {
    name: 'Twilio Key',
    regex: /SK[0-9a-fA-F]{32}/,
  },
  {
    name: 'Generic Secret',
    regex: /(secret|password|passwd|api_key|apikey|auth_token|access_token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
];

module.exports = { PATTERNS };
