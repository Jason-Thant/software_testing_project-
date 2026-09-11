const { evaluateLoanEligibility } = require('../../src/rules/decisionLogic');

const base = {
  age: 30,
  monthlyIncome: 6000,
  monthlyDebt: 1200,
  loanAmount: 20000,
  previousLoanDefault: 'NO',
  overduePayments: 0,
  historicalLatePayments: 0,
  longestPreviousLoanRepaymentMonths: null
};

describe('Control Flow: decision priority and assessment paths', () => {
  test('underage rejection exits before other rules', () => {
    const result = evaluateLoanEligibility({ ...base, age: 19 });
    expect(result.decision).toBe('REJECTED');
    expect(result.checks.age).toBe('FAIL');
    expect(result.checks.income).toBeUndefined();
  });

  test('high-risk repayment assessment rejects', () => {
    const result = evaluateLoanEligibility({ ...base, previousLoanDefault: 'YES', overduePayments: 3, historicalLatePayments: 6, longestPreviousLoanRepaymentMonths: 37 });
    expect(result.decision).toBe('REJECTED');
    expect(result.checks.creditRisk).toBe('FAIL');
  });

  test('medium-risk repayment assessment requests manual review', () => {
    const result = evaluateLoanEligibility({ ...base, previousLoanDefault: 'YES', overduePayments: 1, historicalLatePayments: 1, longestPreviousLoanRepaymentMonths: 24 });
    expect(result.decision).toBe('MANUAL REVIEW');
    expect(result.checks.creditRisk).toBe('REVIEW');
  });

  test('low-risk repayment assessment continues to approval', () => {
    const result = evaluateLoanEligibility(base);
    expect(result.decision).toBe('APPROVED');
    expect(result.checks.creditRisk).toBe('PASS');
  });

  test('hard DTI rejection overrides medium-risk review', () => {
    const result = evaluateLoanEligibility({ ...base, monthlyDebt: 4000, previousLoanDefault: 'YES', overduePayments: 1, historicalLatePayments: 1, longestPreviousLoanRepaymentMonths: 24 });
    expect(result.decision).toBe('REJECTED');
    expect(result.checks.dti).toBe('FAIL');
    expect(result.checks.creditRisk).toBe('REVIEW');
  });

  test('multiple borderline conditions return all reasons', () => {
    const result = evaluateLoanEligibility({ ...base, monthlyIncome: 2900, monthlyDebt: 1450, previousLoanDefault: 'YES', overduePayments: 1, historicalLatePayments: 1, longestPreviousLoanRepaymentMonths: 24 });
    expect(result.decision).toBe('MANUAL REVIEW');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'Monthly income is close to the minimum income requirement.',
      'Debt-to-income ratio is at the borderline threshold of 50%.',
      'Credit repayment assessment is classified as MEDIUM RISK.'
    ]));
  });
});
