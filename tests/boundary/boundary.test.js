const {
  evaluateAge,
  evaluateIncome,
  evaluateDTI,
  evaluateLoanAmount,
  evaluateCreditRepaymentAssessment,
  classifyCreditRiskScore,
  evaluateLoanEligibility
} = require('../../src/rules/decisionLogic');

const base = {
  age: 25,
  monthlyIncome: 6000,
  monthlyDebt: 1200,
  loanAmount: 20000,
  previousLoanDefault: 'NO',
  overduePayments: 0,
  historicalLatePayments: 0,
  longestPreviousLoanRepaymentMonths: null
};

describe('Boundary Value Analysis', () => {
  test.each([[19, 'FAIL'], [20, 'PASS'], [21, 'PASS']])('age %i is %s', (age, status) => {
    expect(evaluateAge(age).status).toBe(status);
  });

  test.each([[2699, 'FAIL'], [2700, 'REVIEW'], [3000, 'REVIEW'], [3299, 'REVIEW'], [3300, 'PASS']])('income %i is %s', (income, status) => {
    expect(evaluateIncome(income).status).toBe(status);
  });

  test.each([[49, 'PASS'], [50, 'REVIEW'], [51, 'FAIL']])('DTI %i is %s', (dti, status) => {
    expect(evaluateDTI(dti).status).toBe(status);
  });

  test.each([[44999, 'PASS'], [45000, 'REVIEW'], [50000, 'REVIEW'], [50001, 'FAIL']])('loan amount %i is %s', (amount, status) => {
    expect(evaluateLoanAmount(amount).status).toBe(status);
  });

  test.each([[12, 15], [13, 12], [24, 12], [25, 8], [36, 8], [37, 5]])('repayment period %i months earns %i points', (months, points) => {
    expect(evaluateCreditRepaymentAssessment({ ...base, longestPreviousLoanRepaymentMonths: months }).breakdown.repaymentPoints).toBe(points);
  });

  test.each([[39, 'HIGH RISK'], [40, 'MEDIUM RISK'], [69, 'MEDIUM RISK'], [70, 'LOW RISK']])('risk score %i is %s', (score, category) => {
    expect(classifyCreditRiskScore(score)).toBe(category);
  });

  test('high-risk assessment is a hard rejection', () => {
    const result = evaluateLoanEligibility({ ...base, previousLoanDefault: 'YES', overduePayments: 3, historicalLatePayments: 6, longestPreviousLoanRepaymentMonths: 37 });
    expect(result.decision).toBe('REJECTED');
    expect(result.creditRiskCategory).toBe('HIGH RISK');
  });
});
