const request = require('supertest');
const app = require('../../src/app');
const { closeDatabase, clearMemory } = require('../../src/database/connection');

/*
 * DOMAIN TESTING
 *
 * The input space is divided into equivalence domains. One representative
 * value is selected from each domain because values in the same domain should
 * be handled by the same business rule.
 *
 * Valid decision domains:
 *   - age:             [1, 19] reject, [20, 120] continue
 *   - monthly income:  [0, 2699] reject, [2700, 3299] review, [3300, +inf) pass
 *   - DTI:             [0, 50) pass, {50} review, (50, +inf) reject
 *   - credit score:    [0, 39] high, [40, 69] medium, [70, 100] low
 *   - loan amount:     (0, 45000) pass, [45000, 50000] review,
 *                      (50000, +inf) reject
 *
 * Invalid input domains are also exercised through the HTTP endpoint to
 * confirm that invalid data is rejected before the decision engine runs.
 */

const validApplication = (overrides = {}) => ({
  age: 30,
  monthlyIncome: 6000,
  monthlyDebt: 1200,
  previousLoanDefault: 'NO',
  historicalLatePayments: 0,
  overduePayments: 0,
  longestPreviousLoanRepaymentMonths: null,
  loanAmount: 20000,
  ...overrides
});

describe('Domain Testing: Loan application input partitions', () => {
  beforeEach(() => clearMemory());
  afterAll(async () => closeDatabase());

  describe('Age domains', () => {
    test.each([
      ['under minimum age', 10, 'REJECTED'],
      ['eligible adult age', 35, 'APPROVED'],
      ['maximum realistic age', 120, 'APPROVED']
    ])('%s: age %s gives %s', async (_domain, age, expectedDecision) => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ age }));
      expect(response.status).toBe(200);
      expect(response.body.decision).toBe(expectedDecision);
    });

    test.each([
      ['zero', 0],
      ['negative', -1],
      ['above realistic maximum', 121],
      ['fractional', 20.5],
      ['non-numeric', 'adult']
    ])('invalid age domain (%s) is rejected', async (_domain, age) => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ age }));
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('Monthly income domains', () => {
    test.each([
      ['below the review band', 2000, 'REJECTED', 'FAIL'],
      ['inside the review band', 3000, 'MANUAL REVIEW', 'REVIEW'],
      ['above the review band', 6000, 'APPROVED', 'PASS']
    ])('%s: income %s gives %s', async (_domain, monthlyIncome, decision, status) => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ monthlyIncome }));
      expect(response.status).toBe(200);
      expect(response.body.decision).toBe(decision);
      expect(response.body.checks.income).toBe(status);
    });

    test.each([
      ['negative', -100],
      ['non-numeric', 'high']
    ])('invalid income domain (%s) is rejected', async (_domain, monthlyIncome) => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ monthlyIncome }));
      expect(response.status).toBe(400);
    });
  });

  describe('Debt-to-income domains', () => {
    test.each([
      ['below 50 percent', 1000, 'APPROVED', 'PASS'],
      ['exactly 50 percent', 3000, 'MANUAL REVIEW', 'REVIEW'],
      ['above 50 percent', 4000, 'REJECTED', 'FAIL']
    ])('%s gives the expected DTI domain', async (_domain, monthlyDebt, decision, status) => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ monthlyDebt }));
      expect(response.status).toBe(200);
      expect(response.body.decision).toBe(decision);
      expect(response.body.checks.dti).toBe(status);
    });

    test('negative debt is outside the valid domain', async () => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ monthlyDebt: -1 }));
      expect(response.status).toBe(400);
    });
  });

  describe('Credit repayment history domains', () => {
    test.each([
      ['low-risk history', {}, 'LOW RISK', 'APPROVED'],
      ['medium-risk history', {
        previousLoanDefault: 'YES', overduePayments: 1,
        historicalLatePayments: 1, longestPreviousLoanRepaymentMonths: 24
      }, 'MEDIUM RISK', 'MANUAL REVIEW'],
      ['high-risk history', {
        previousLoanDefault: 'YES', overduePayments: 3,
        historicalLatePayments: 6, longestPreviousLoanRepaymentMonths: 37
      }, 'HIGH RISK', 'REJECTED']
    ])('%s is classified correctly', async (_domain, history, category, decision) => {
      const response = await request(app).post('/api/loan/check').send(validApplication(history));
      expect(response.status).toBe(200);
      expect(response.body.creditRiskCategory).toBe(category);
      expect(response.body.decision).toBe(decision);
    });

    test.each([
      ['unsupported default value', { previousLoanDefault: 'MAYBE' }],
      ['negative overdue count', { overduePayments: -1 }],
      ['fractional late-payment count', { historicalLatePayments: 1.5 }],
      ['negative repayment period', { longestPreviousLoanRepaymentMonths: -1 }]
    ])('invalid repayment domain (%s) is rejected', async (_domain, history) => {
      const response = await request(app).post('/api/loan/check').send(validApplication(history));
      expect(response.status).toBe(400);
    });
  });

  describe('Requested loan amount domains', () => {
    test.each([
      ['normal amount', 20000, 'APPROVED', 'PASS'],
      ['near maximum amount', 48000, 'MANUAL REVIEW', 'REVIEW'],
      ['above maximum amount', 60000, 'REJECTED', 'FAIL']
    ])('%s: amount %s gives %s', async (_domain, loanAmount, decision, status) => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ loanAmount }));
      expect(response.status).toBe(200);
      expect(response.body.decision).toBe(decision);
      expect(response.body.checks.loanAmount).toBe(status);
    });

    test.each([
      ['zero', 0],
      ['negative', -1],
      ['non-numeric', 'large']
    ])('invalid loan amount domain (%s) is rejected', async (_domain, loanAmount) => {
      const response = await request(app).post('/api/loan/check').send(validApplication({ loanAmount }));
      expect(response.status).toBe(400);
    });
  });

  describe('Combined decision domains', () => {
    test('a failing domain has priority over review domains', async () => {
      const response = await request(app).post('/api/loan/check').send(validApplication({
        monthlyIncome: 3000,
        monthlyDebt: 2000,
        loanAmount: 48000
      }));

      expect(response.status).toBe(200);
      expect(response.body.checks.income).toBe('REVIEW');
      expect(response.body.checks.dti).toBe('FAIL');
      expect(response.body.checks.loanAmount).toBe('REVIEW');
      expect(response.body.decision).toBe('REJECTED');
    });

    test('multiple review domains are collected when no domain fails', async () => {
      const response = await request(app).post('/api/loan/check').send(validApplication({
        monthlyIncome: 3000,
        monthlyDebt: 1500,
        loanAmount: 48000
      }));

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('MANUAL REVIEW');
      expect(response.body.reasons).toHaveLength(3);
    });
  });
});
