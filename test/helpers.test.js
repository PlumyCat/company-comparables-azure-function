const { validateInput, sanitizeString, formatCurrency, formatNumber, isValidUrl } = require('../src/utils/helpers');

describe('helpers utility functions', () => {
  test('validateInput returns valid for correct data', () => {
    const schema = { name: { required: true, type: 'string' } };
    const result = validateInput({ name: 'ACME' }, schema);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validateInput detects missing field', () => {
    const schema = { name: { required: true, type: 'string' } };
    const result = validateInput({}, schema);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('sanitizeString trims and removes control chars', () => {
    const input = '  hello\nworld\u0007';
    const cleaned = sanitizeString(input);
    expect(cleaned).toBe('hello world');
  });

  test('formatCurrency formats euros', () => {
    // Narrow non-breaking spaces are used as thousand separators
    // and a non-breaking space precedes the euro sign
    expect(formatCurrency(1000)).toBe('1\u202F000\u00A0€');
  });

  test('formatNumber formats number with spaces', () => {
    expect(formatNumber(1000000)).toBe('1\u202F000\u202F000');
  });

  test('isValidUrl detects valid urls', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('not_a_url')).toBe(false);
  });
});
