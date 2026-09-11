const {
  calculateDTI,
  evaluateAge,
  evaluateIncome,
  evaluateDTI,
  evaluateLoanAmount,
  evaluateCreditRepaymentAssessment,
  classifyCreditRiskScore,
  evaluateLoanEligibility
} = require('../../src/rules/decisionLogic');
const RULES_CONFIG = require('../../src/config/rules.config');

const assessment = (overrides = {}) => ({
  previousLoanDefault: 'NO',
  overduePayments: 0,
  historicalLatePayments: 0,
  longestPreviousLoanRepaymentMonths: null,
  ...overrides
});

const application = (overrides = {}) => ({
  age: 30,
  monthlyIncome: 6000,
  monthlyDebt: 1200,
  loanAmount: 20000,
  ...assessment(),
  ...overrides
});

describe('Unit Tests: Loan eligibility rules', () => {
  test('Calculates and rounds DTI', () => {
    expect(calculateDTI(1500, 5000)).toBe(30);
    expect(calculateDTI(1000, 3000)).toBe(33.33);
  });

  test('Rejects invalid DTI inputs and handles zero income', () => {
    expect(calculateDTI(1000, 0)).toBe(100);
    expect(() => calculateDTI('1000', 3000)).toThrow(TypeError);
  });

  test('Keeps age as a hard rejection with no review state', () => {
    expect(evaluateAge(19).status).toBe('FAIL');
    expect(evaluateAge(20).status).toBe('PASS');
  });

  test('Uses the configurable income borderline floor and upper range', () => {
    expect(evaluateIncome(2699).status).toBe('FAIL');
    expect(evaluateIncome(2700).status).toBe('REVIEW');
    expect(evaluateIncome(3000).status).toBe('REVIEW');
    expect(evaluateIncome(3299).status).toBe('REVIEW');
    expect(evaluateIncome(3300).status).toBe('PASS');
  });

  test('Uses DTI boundaries', () => {
    expect(evaluateDTI(49).status).toBe('PASS');
    expect(evaluateDTI(50).status).toBe('REVIEW');
    expect(evaluateDTI(51).status).toBe('FAIL');
  });

  test('Uses loan amount boundaries', () => {
    expect(evaluateLoanAmount(44999).status).toBe('PASS');
    expect(evaluateLoanAmount(45000).status).toBe('REVIEW');
    expect(evaluateLoanAmount(50000).status).toBe('REVIEW');
    expect(evaluateLoanAmount(50001).status).toBe('FAIL');
  });

  test('Scores default history yes/no', () => {
    expect(evaluateCreditRepaymentAssessment(assessment()).score).toBe(95);
    expect(evaluateCreditRepaymentAssessment(assessment({ previousLoanDefault: 'YES' })).score).toBe(60);
  });

  test('Scores historical late payments 0, 1, 2, 3, 5, and 6', () => {
    expect(evaluateCreditRepaymentAssessment(assessment({ historicalLatePayments: 0 })).breakdown.latePaymentPoints).toBe(20);
    expect(evaluateCreditRepaymentAssessment(assessment({ historicalLatePayments: 1 })).breakdown.latePaymentPoints).toBe(15);
    expect(evaluateCreditRepaymentAssessment(assessment({ historicalLatePayments: 2 })).breakdown.latePaymentPoints).toBe(15);
    expect(evaluateCreditRepaymentAssessment(assessment({ historicalLatePayments: 3 })).breakdown.latePaymentPoints).toBe(10);
    expect(evaluateCreditRepaymentAssessment(assessment({ historicalLatePayments: 5 })).breakdown.latePaymentPoints).toBe(10);
    expect(evaluateCreditRepaymentAssessment(assessment({ historicalLatePayments: 6 })).breakdown.latePaymentPoints).toBe(0);
  });

  test('Scores overdue payments 0, 1, 2, and 3+', () => {
    expect(evaluateCreditRepaymentAssessment(assessment({ overduePayments: 0 })).breakdown.overduePoints).toBe(30);
    expect(evaluateCreditRepaymentAssessment(assessment({ overduePayments: 1 })).breakdown.overduePoints).toBe(20);
    expect(evaluateCreditRepaymentAssessment(assessment({ overduePayments: 2 })).breakdown.overduePoints).toBe(10);
    expect(evaluateCreditRepaymentAssessment(assessment({ overduePayments: 3 })).breakdown.overduePoints).toBe(0);
  });

  test('Scores repayment periods through 12, 24, 36, and 37 months', () => {
    expect(evaluateCreditRepaymentAssessment(assessment({ longestPreviousLoanRepaymentMonths: 12 })).breakdown.repaymentPoints).toBe(15);
    expect(evaluateCreditRepaymentAssessment(assessment({ longestPreviousLoanRepaymentMonths: 13 })).breakdown.repaymentPoints).toBe(12);
    expect(evaluateCreditRepaymentAssessment(assessment({ longestPreviousLoanRepaymentMonths: 24 })).breakdown.repaymentPoints).toBe(12);
    expect(evaluateCreditRepaymentAssessment(assessment({ longestPreviousLoanRepaymentMonths: 25 })).breakdown.repaymentPoints).toBe(8);
    expect(evaluateCreditRepaymentAssessment(assessment({ longestPreviousLoanRepaymentMonths: 36 })).breakdown.repaymentPoints).toBe(8);
    expect(evaluateCreditRepaymentAssessment(assessment({ longestPreviousLoanRepaymentMonths: 37 })).breakdown.repaymentPoints).toBe(5);
  });

  test('Classifies risk score boundaries 39, 40, 69, and 70', () => {
    expect(classifyCreditRiskScore(39)).toBe('HIGH RISK');
    expect(classifyCreditRiskScore(40)).toBe('MEDIUM RISK');
    expect(classifyCreditRiskScore(69)).toBe('MEDIUM RISK');
    expect(classifyCreditRiskScore(70)).toBe('LOW RISK');
  });

  test('Integrates high, medium, and low risk decisions', () => {
    expect(evaluateLoanEligibility(application({ previousLoanDefault: 'YES', overduePayments: 3, historicalLatePayments: 6, longestPreviousLoanRepaymentMonths: 37 })).decision).toBe(RULES_CONFIG.DECISIONS.REJECTED);
    expect(evaluateLoanEligibility(application({ previousLoanDefault: 'YES', overduePayments: 1, historicalLatePayments: 1, longestPreviousLoanRepaymentMonths: 24 })).decision).toBe(RULES_CONFIG.DECISIONS.MANUAL_REVIEW);
    expect(evaluateLoanEligibility(application()).decision).toBe(RULES_CONFIG.DECISIONS.APPROVED);
  });

  test('Hard rejection takes priority over a medium-risk review', () => {
    const result = evaluateLoanEligibility(application({ monthlyDebt: 4000, previousLoanDefault: 'YES', overduePayments: 1, historicalLatePayments: 1, longestPreviousLoanRepaymentMonths: 24 }));
    expect(result.decision).toBe(RULES_CONFIG.DECISIONS.REJECTED);
    expect(result.checks.dti).toBe('FAIL');
    expect(result.checks.creditRisk).toBe('REVIEW');
  });
});
