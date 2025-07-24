const { AnalysisService } = require('../src/services/analysisService');

describe('AnalysisService utilities', () => {
  const service = new AnalysisService();

  test('determineSizeCategory uses employee count', () => {
    const profile = { employees: 30 };
    expect(service.determineSizeCategory(profile)).toBe('small');
  });

  test('areSectorsRelated compares keywords', () => {
    expect(service.areSectorsRelated('Technology', 'Consulting')).toBe(false);
  });

  test('calculateGeoScore compares country and region', () => {
    const ref = { country: 'FR', region: 'Europe' };
    const comp1 = { country: 'FR' };
    const comp2 = { region: 'Europe' };
    expect(service.calculateGeoScore(ref, comp1)).toBe(100);
    expect(service.calculateGeoScore(ref, comp2)).toBe(70);
  });

  test('inferSectorFromName detects Finance sector', () => {
    expect(service.inferSectorFromName('ACME finance group')).toBe('Finance');
    expect(service.inferSectorFromName('ACME')).toBe('Technology');
  });
});
