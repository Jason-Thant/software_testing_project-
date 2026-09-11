const { calculateDTI, evaluateCreditRepaymentAssessment, evaluateLoanEligibility } = require('../../src/rules/decisionLogic');

describe('Data Flow: repayment assessment propagation', () => {
  test('monthly debt and income flow into DTI', () => {
    expect(calculateDTI(1000, 4000)).toBe(25);
    expect(calculateDTI(2000, 4000)).toBe(50);
  });

  test('all four repayment answers flow into the assessment score', () => {
    const result = evaluateCreditRepaymentAssessment({
      previousLoanDefault: 'YES',
      overduePayments: 1,
      historicalLatePayments: 1,
      longestPreviousLoanRepaymentMonths: 24
    });
    expect(result.score).toBe(47);
    expect(result.category).toBe('MEDIUM RISK');
    expect(result.breakdown).toEqual({ defaultPoints: 0, overduePoints: 20, latePaymentPoints: 15, repaymentPoints: 12 });
  });

  test('assessment category flows into the complete decision', () => {
    const result = evaluateLoanEligibility({
      age: 30,
      monthlyIncome: 6000,
      monthlyDebt: 1200,
      loanAmount: 20000,
      previousLoanDefault: 'YES',
      overduePayments: 1,
      historicalLatePayments: 1,
      longestPreviousLoanRepaymentMonths: 24
    });
    expect(result.creditRiskScore).toBe(47);
    expect(result.creditRiskCategory).toBe('MEDIUM RISK');
    expect(result.checks.creditRisk).toBe('REVIEW');
    expect(result.decision).toBe('MANUAL REVIEW');
  });
});
