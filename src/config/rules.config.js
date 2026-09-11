/**
 * Loan Eligibility Business Rules Configuration
 *
 * All decision thresholds and borderline ranges are defined here.
 * Override via environment variables or configOverride in tests.
 */

require('dotenv').config();

const RULES_CONFIG = {
  // STEP 1: Age Check
  // Rule: Age < 20 → REJECTED; Age >= 20 → CONTINUE
  // Age NEVER triggers Manual Review.
  MIN_AGE: 20,

  // STEP 2: Monthly Income Check
  // < (MIN_MONTHLY_INCOME - BORDERLINE_INCOME_BELOW_MIN_RANGE) → REJECTED
  // Lower borderline boundary through (MIN_MONTHLY_INCOME + BORDERLINE_INCOME_RANGE - 1) → MANUAL REVIEW
  // >= (MIN_MONTHLY_INCOME + BORDERLINE_INCOME_RANGE) → CONTINUE
  MIN_MONTHLY_INCOME: Number(process.env.MIN_MONTHLY_INCOME) || 3000,
  BORDERLINE_INCOME_BELOW_MIN_RANGE: Number(process.env.BORDERLINE_INCOME_BELOW_MIN_RANGE) || 300,
  BORDERLINE_INCOME_RANGE: Number(process.env.BORDERLINE_INCOME_RANGE) || 300,

  // STEP 3: Debt-To-Income (DTI) Ratio Check
  // DTI < MAX_DTI_PERCENTAGE → CONTINUE
  // DTI === MAX_DTI_PERCENTAGE → MANUAL REVIEW (when DTI_BORDERLINE_ENABLED)
  // DTI > MAX_DTI_PERCENTAGE → REJECTED
  MAX_DTI_PERCENTAGE: 50.0,
  DTI_BORDERLINE_ENABLED: true,

  // STEP 4: Credit Repayment Assessment
  // Risk score 0-39 → HIGH RISK / REJECTED
  // Risk score 40-69 → MEDIUM RISK / MANUAL REVIEW
  // Risk score 70-100 → LOW RISK / CONTINUE
  CREDIT_RISK_THRESHOLDS: {
    HIGH_MAX: 39,
    MEDIUM_MAX: 69,
    LOW_MIN: 70
  },

  // STEP 5: Requested Loan Amount Check
  // > MAX_LOAN_AMOUNT → REJECTED
  // (MAX_LOAN_AMOUNT - BORDERLINE_LOAN_RANGE) to MAX_LOAN_AMOUNT → MANUAL REVIEW
  // < (MAX_LOAN_AMOUNT - BORDERLINE_LOAN_RANGE) → CONTINUE
  MAX_LOAN_AMOUNT: Number(process.env.MAX_LOAN_AMOUNT) || 50000,
  BORDERLINE_LOAN_RANGE: Number(process.env.BORDERLINE_LOAN_RANGE) || 5000,

  // Outcome Constants
  DECISIONS: {
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    MANUAL_REVIEW: 'MANUAL REVIEW'
  },

  // Check Status Constants
  CHECK_STATUS: {
    PASS: 'PASS',
    FAIL: 'FAIL',
    REVIEW: 'REVIEW',
    NOT_EVALUATED: 'NOT_EVALUATED'
  }
};

function getRulesConfiguration() {
  return {
    minAge: RULES_CONFIG.MIN_AGE,
    minMonthlyIncome: RULES_CONFIG.MIN_MONTHLY_INCOME,
    borderlineIncomeBelowMinRange: RULES_CONFIG.BORDERLINE_INCOME_BELOW_MIN_RANGE,
    borderlineIncomeRange: RULES_CONFIG.BORDERLINE_INCOME_RANGE,
    maxDtiPercentage: RULES_CONFIG.MAX_DTI_PERCENTAGE,
    dtiBorderlineEnabled: RULES_CONFIG.DTI_BORDERLINE_ENABLED,
    creditRiskHighMax: RULES_CONFIG.CREDIT_RISK_THRESHOLDS.HIGH_MAX,
    creditRiskMediumMax: RULES_CONFIG.CREDIT_RISK_THRESHOLDS.MEDIUM_MAX,
    creditRiskLowMin: RULES_CONFIG.CREDIT_RISK_THRESHOLDS.LOW_MIN,
    maxLoanAmount: RULES_CONFIG.MAX_LOAN_AMOUNT,
    borderlineLoanRange: RULES_CONFIG.BORDERLINE_LOAN_RANGE
  };
}

function updateRulesConfiguration(updates) {
  const numericFields = [
    'minAge', 'minMonthlyIncome', 'borderlineIncomeBelowMinRange',
    'borderlineIncomeRange', 'maxDtiPercentage', 'creditRiskHighMax',
    'creditRiskMediumMax', 'creditRiskLowMin', 'maxLoanAmount', 'borderlineLoanRange'
  ];
  for (const field of numericFields) {
    if (updates[field] !== undefined) {
      const value = Number(updates[field]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number.`);
      updates[field] = value;
    }
  }
  const next = { ...getRulesConfiguration(), ...updates };
  if (next.creditRiskHighMax >= next.creditRiskMediumMax || next.creditRiskMediumMax >= next.creditRiskLowMin) {
    throw new Error('Credit risk boundaries must be ordered HIGH < MEDIUM < LOW.');
  }
  if (next.borderlineIncomeBelowMinRange > next.minMonthlyIncome) {
    throw new Error('Income borderline range cannot exceed the minimum income.');
  }
  Object.assign(RULES_CONFIG, {
    MIN_AGE: next.minAge,
    MIN_MONTHLY_INCOME: next.minMonthlyIncome,
    BORDERLINE_INCOME_BELOW_MIN_RANGE: next.borderlineIncomeBelowMinRange,
    BORDERLINE_INCOME_RANGE: next.borderlineIncomeRange,
    MAX_DTI_PERCENTAGE: next.maxDtiPercentage,
    MAX_LOAN_AMOUNT: next.maxLoanAmount,
    BORDERLINE_LOAN_RANGE: next.borderlineLoanRange,
    DTI_BORDERLINE_ENABLED: Boolean(next.dtiBorderlineEnabled)
  });
  Object.assign(RULES_CONFIG.CREDIT_RISK_THRESHOLDS, {
    HIGH_MAX: next.creditRiskHighMax,
    MEDIUM_MAX: next.creditRiskMediumMax,
    LOW_MIN: next.creditRiskLowMin
  });
  return getRulesConfiguration();
}

module.exports = RULES_CONFIG;
module.exports.getRulesConfiguration = getRulesConfiguration;
module.exports.updateRulesConfiguration = updateRulesConfiguration;
