const request = require('supertest');
const app = require('../../src/app');
const { closeDatabase, clearDatabase } = require('../../src/database/connection');

const lowRisk = {
  age: 28,
  monthlyIncome: 6000,
  monthlyDebt: 1500,
  previousLoanDefault: 'NO',
  overduePayments: 0,
  historicalLatePayments: 0,
  longestPreviousLoanRepaymentMonths: null,
  loanAmount: 30000
};

const mediumRisk = {
  ...lowRisk,
  previousLoanDefault: 'YES',
  overduePayments: 1,
  historicalLatePayments: 1,
  longestPreviousLoanRepaymentMonths: 24
};

describe('System Integration Tests: customer and admin workflows', () => {
  beforeEach(async () => clearDatabase());
  afterAll(async () => closeDatabase());

  test('serves customer pages and health endpoint', async () => {
    expect((await request(app).get('/apply')).status).toBe(200);
    expect((await request(app).get('/result/1')).status).toBe(200);
    expect((await request(app).get('/history')).status).toBe(200);
    expect((await request(app).get('/api/health')).body.status).toBe('OK');
  });

  test('admin can read and update decision boundaries used by customer evaluation', async () => {
    const original = (await request(app).get('/api/admin/settings')).body.settings;
    const updated = await request(app).patch('/api/admin/settings').send({ minAge: 21, maxDtiPercentage: 45 });
    expect(updated.status).toBe(200);
    expect(updated.body.settings.minAge).toBe(21);
    expect((await request(app).get('/api/loan/config')).body.config.maxDtiPercentage).toBe(45);
    const changed = await request(app).post('/api/loan/check').send({ ...lowRisk, age: 20, monthlyDebt: 2700 });
    expect(changed.body.decision).toBe('REJECTED');
    await request(app).patch('/api/admin/settings').send(original);
  });

  test('low-risk application is approved', async () => {
    const response = await request(app).post('/api/loan/check').send(lowRisk);
    expect(response.status).toBe(200);
    expect(response.body.decision).toBe('APPROVED');
    expect(response.body.creditRiskCategory).toBe('LOW RISK');
    expect(response.body.checks.creditRisk).toBe('PASS');
  });

  test('high-risk application is rejected', async () => {
    const response = await request(app).post('/api/loan/check').send({
      ...lowRisk,
      previousLoanDefault: 'YES',
      overduePayments: 3,
      historicalLatePayments: 6,
      longestPreviousLoanRepaymentMonths: 37
    });
    expect(response.body.decision).toBe('REJECTED');
    expect(response.body.creditRiskCategory).toBe('HIGH RISK');
    expect(response.body.review_status).toBeNull();
  });

  test('medium-risk application is pending manual review with assessment data', async () => {
    const response = await request(app).post('/api/loan/check').send(mediumRisk);
    expect(response.body.decision).toBe('MANUAL REVIEW');
    expect(response.body.review_status).toBe('PENDING');
    expect(response.body.creditRiskScore).toBe(47);
    expect(response.body.creditRiskCategory).toBe('MEDIUM RISK');
    expect(response.body.application.previousLoanDefault).toBe('YES');
  });

  test('hard rejection overrides medium risk', async () => {
    const response = await request(app).post('/api/loan/check').send({ ...mediumRisk, monthlyDebt: 4000 });
    expect(response.body.decision).toBe('REJECTED');
    expect(response.body.checks.dti).toBe('FAIL');
    expect(response.body.checks.creditRisk).toBe('REVIEW');
  });

  test('rejects missing, negative, non-numeric, and non-finite assessment values', async () => {
    const missing = await request(app).post('/api/loan/check').send({ ...lowRisk, historicalLatePayments: undefined });
    expect(missing.status).toBe(400);
    expect(missing.body.details).toContain('Historical late payments is required.');

    const negative = await request(app).post('/api/loan/check').send({ ...lowRisk, historicalLatePayments: -1 });
    expect(negative.status).toBe(400);
    expect(negative.body.details).toContain('Historical late payments cannot be negative.');

    const nonNumeric = await request(app).post('/api/loan/check').send({ ...lowRisk, overduePayments: 'many' });
    expect(nonNumeric.status).toBe(400);
    expect(nonNumeric.body.details).toContain('Overdue payments must be a valid numeric value.');

    const infinite = await request(app).post('/api/loan/check').send({ ...lowRisk, historicalLatePayments: 'Infinity' });
    expect(infinite.status).toBe(400);
    expect(infinite.body.details).toContain('Historical late payments must be a valid numeric value.');
  });

  test('retrieves a submitted result by application ID', async () => {
    const submitted = await request(app).post('/api/loan/check').send(mediumRisk);
    const response = await request(app).get(`/api/loan/applications/${submitted.body.id}`);
    expect(response.status).toBe(200);
    expect(response.body.creditRiskCategory).toBe('MEDIUM RISK');
    expect(response.body.application.historicalLatePayments).toBe(1);
  });

  test('admin can approve a pending manual review and it leaves the queue', async () => {
    const submitted = await request(app).post('/api/loan/check').send(mediumRisk);
    const queue = await request(app).get('/api/admin/manual-reviews');
    expect(queue.body.data[0].credit_risk_category).toBe('MEDIUM RISK');
    expect(queue.body.data[0].previous_loan_default).toBe('YES');

    const detail = await request(app).get(`/api/admin/manual-reviews/${submitted.body.id}`);
    expect(detail.status).toBe(200);
    const decision = await request(app).patch(`/api/admin/manual-reviews/${submitted.body.id}`).send({ decision: 'APPROVED' });
    expect(decision.body.data).toMatchObject({ decision: 'APPROVED', review_status: 'COMPLETED' });
    expect((await request(app).get('/api/admin/manual-reviews')).body.count).toBe(0);
  });

  test('admin can reject a pending manual review', async () => {
    const submitted = await request(app).post('/api/loan/check').send(mediumRisk);
    const decision = await request(app).patch(`/api/admin/manual-reviews/${submitted.body.id}`).send({ decision: 'REJECTED' });
    expect(decision.status).toBe(200);
    expect(decision.body.data.decision).toBe('REJECTED');
    expect(decision.body.data.review_status).toBe('COMPLETED');
  });

  test('returns 400 for invalid admin decisions', async () => {
    const submitted = await request(app).post('/api/loan/check').send(mediumRisk);
    const response = await request(app).patch(`/api/admin/manual-reviews/${submitted.body.id}`).send({ decision: 'MANUAL REVIEW' });
    expect(response.status).toBe(400);
  });
});
