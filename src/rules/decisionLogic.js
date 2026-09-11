/**
 * Pure Decision Logic for Loan Eligibility Analysis and Decision System
 * 
 * This module contains pure, deterministic functions implementing the business rules.
 * All functions are isolated from HTTP/Express routes and database layers for optimal testability.
 *
 * DECISION PRIORITY:
 *   1. Age Check        → REJECTED only (never Manual Review)
 *   2. Income Check     → REJECTED / MANUAL REVIEW / PASS
 *   3. DTI Check        → REJECTED / MANUAL REVIEW / PASS
 *   4. Credit Repayment Assessment → REJECTED / MANUAL REVIEW / PASS
 *   5. Loan Amount      → REJECTED / MANUAL REVIEW / PASS
 *
 * FINAL DECISION:
 *   IF any condition clearly fails → REJECTED (with first failure reason)
 *   ELSE IF any condition is borderline → MANUAL REVIEW (with ALL borderline reasons)
 *   ELSE → APPROVED
 */

const RULES_CONFIG = require('../config/rules.config');

/**
 * Calculates the Debt-to-Income (DTI) ratio percentage.
 * DTI = (Existing Monthly Debt / Monthly Income) * 100
 * 
 * @param {number} monthlyDebt - Existing monthly debt obligations
 * @param {number} monthlyIncome - Total monthly gross income
 * @returns {number} DTI percentage rounded to 2 decimal places
 */
function calculateDTI(monthlyDebt, monthlyIncome) {
  if (typeof monthlyDebt !== 'number' || typeof monthlyIncome !== 'number') {
    throw new TypeError('Monthly debt and income must be numbers');
  }
  if (monthlyIncome <= 0) {
    return 100.0; // Infinite/maximum debt ratio if no income
  }
  const ratio = (monthlyDebt / monthlyIncome) * 100;
  return Number(ratio.toFixed(2));
}

/**
 * STEP 1: Evaluates applicant age.
 * Age NEVER results in Manual Review.
 *
 * Boundary cases:
 *  19 → REJECTED
 *  20 → PASS (CONTINUE)
 *  21 → PASS (CONTINUE)
 * 
 * @param {number} age
 * @param {number} [minAge=20]
 * @returns {{ status: 'PASS'|'FAIL', decision?: string, reason?: string }}
 */
function evaluateAge(age, minAge = RULES_CONFIG.MIN_AGE) {
  if (age < minAge) {
    return {
      status: 'FAIL',
      decision: RULES_CONFIG.DECISIONS.REJECTED,
      reason: `Applicant must be at least ${minAge} years old.`
    };
  }
  return { status: 'PASS' };
}

/**
 * STEP 2: Evaluates monthly income with borderline range.
 *
 * < (MIN_MONTHLY_INCOME - BELOW_MIN_RANGE)            → REJECTED
 * (MIN - BELOW_MIN_RANGE) to (MIN + BORDERLINE_RANGE - 1) → MANUAL REVIEW
 * >= (MIN + BORDERLINE_RANGE)                          → PASS
 *
 * Boundary cases (MIN=3000, BELOW_MIN_RANGE=300, RANGE=300):
 *  2699 → REJECTED
 *  2700–3299 → MANUAL REVIEW
 *  3299 → MANUAL REVIEW
 *  3300 → PASS
 * 
 * @param {number} monthlyIncome
 * @param {number} [minIncome]
 * @param {number} [belowMinBorderlineRange]
 * @param {number} [borderlineRange]
 * @returns {{ status: 'PASS'|'FAIL'|'REVIEW', decision?: string, reason?: string }}
 */
function evaluateIncome(
  monthlyIncome,
  minIncome = RULES_CONFIG.MIN_MONTHLY_INCOME,
  belowMinBorderlineRange = RULES_CONFIG.BORDERLINE_INCOME_BELOW_MIN_RANGE,
  borderlineRange = RULES_CONFIG.BORDERLINE_INCOME_RANGE
) {
  if (monthlyIncome < minIncome - belowMinBorderlineRange) {
    return {
      status: 'FAIL',
      decision: RULES_CONFIG.DECISIONS.REJECTED,
      reason: `Monthly income must be at least $${minIncome.toLocaleString()}.`
    };
  }
  if (monthlyIncome < minIncome + borderlineRange) {
    return {
      status: 'REVIEW',
      decision: RULES_CONFIG.DECISIONS.MANUAL_REVIEW,
      reason: 'Monthly income is close to the minimum income requirement.'
    };
  }
  return { status: 'PASS' };
}

/**
 * STEP 3: Evaluates Debt-to-Income (DTI) ratio with optional borderline.
 *
 * When DTI_BORDERLINE_ENABLED:
 *   DTI < 50%   → PASS
 *   DTI === 50%  → MANUAL REVIEW
 *   DTI > 50%   → REJECTED
 *
 * When DTI_BORDERLINE_ENABLED = false:
 *   DTI <= 50%  → PASS
 *   DTI > 50%   → REJECTED
 * 
 * @param {number} dti
 * @param {number} [maxDti=50]
 * @param {boolean} [borderlineEnabled=true]
 * @returns {{ status: 'PASS'|'FAIL'|'REVIEW', decision?: string, reason?: string }}
 */
function evaluateDTI(
  dti,
  maxDti = RULES_CONFIG.MAX_DTI_PERCENTAGE,
  borderlineEnabled = RULES_CONFIG.DTI_BORDERLINE_ENABLED
) {
  if (dti > maxDti) {
    return {
      status: 'FAIL',
      decision: RULES_CONFIG.DECISIONS.REJECTED,
      reason: `Debt-to-income ratio exceeds ${maxDti}%.`
    };
  }
  if (borderlineEnabled && dti === maxDti) {
    return {
      status: 'REVIEW',
      decision: RULES_CONFIG.DECISIONS.MANUAL_REVIEW,
      reason: `Debt-to-income ratio is at the borderline threshold of ${maxDti}%.`
    };
  }
  return { status: 'PASS' };
}

/**
 * STEP 4: Calculates the project-specific Credit Repayment Assessment.
 * A missing previous loan is treated as the safest repayment-period band.
 */
function evaluateCreditRepaymentAssessment(application) {
  const previousLoanDefault = application.previousLoanDefault;
  const historicalLatePayments = Number(application.historicalLatePayments);
  const overduePayments = Number(application.overduePayments);
  const repaymentMonths = application.longestPreviousLoanRepaymentMonths === null || application.longestPreviousLoanRepaymentMonths === undefined
    ? null
    : Number(application.longestPreviousLoanRepaymentMonths);

  const defaultPoints = previousLoanDefault === 'NO' ? 35 : 0;
  const overduePoints = overduePayments === 0 ? 30 : overduePayments === 1 ? 20 : overduePayments === 2 ? 10 : 0;
  const latePaymentPoints = historicalLatePayments === 0 ? 20 : historicalLatePayments <= 2 ? 15 : historicalLatePayments <= 5 ? 10 : 0;
  const repaymentPoints = repaymentMonths === null ? 10 : repaymentMonths <= 12 ? 15 : repaymentMonths <= 24 ? 12 : repaymentMonths <= 36 ? 8 : 5;
  const score = defaultPoints + overduePoints + latePaymentPoints + repaymentPoints;
  const category = classifyCreditRiskScore(score);

  const reasons = [];
  if (category === 'HIGH RISK') reasons.push('Credit repayment assessment is classified as HIGH RISK.');
  else if (category === 'MEDIUM RISK') reasons.push('Credit repayment assessment is classified as MEDIUM RISK.');

  return {
    status: category === 'HIGH RISK' ? 'FAIL' : category === 'MEDIUM RISK' ? 'REVIEW' : 'PASS',
    decision: category === 'HIGH RISK' ? RULES_CONFIG.DECISIONS.REJECTED : category === 'MEDIUM RISK' ? RULES_CONFIG.DECISIONS.MANUAL_REVIEW : undefined,
    reason: reasons[0],
    score,
    category,
    reasons,
    breakdown: { defaultPoints, overduePoints, latePaymentPoints, repaymentPoints }
  };
}

function classifyCreditRiskScore(score) {
  if (score >= RULES_CONFIG.CREDIT_RISK_THRESHOLDS.LOW_MIN) return 'LOW RISK';
  if (score > RULES_CONFIG.CREDIT_RISK_THRESHOLDS.HIGH_MAX) return 'MEDIUM RISK';
  return 'HIGH RISK';
}

/**
 * STEP 5: Evaluates requested loan amount with borderline range.
 *
 * > MAX_LOAN_AMOUNT                                         → REJECTED
 * (MAX_LOAN_AMOUNT - BORDERLINE_LOAN_RANGE) to MAX          → MANUAL REVIEW
 * < (MAX_LOAN_AMOUNT - BORDERLINE_LOAN_RANGE)                → PASS
 *
 * Boundary cases (MAX=50000, RANGE=5000):
 *  44999 → PASS
 *  45000 → MANUAL REVIEW
 *  50000 → MANUAL REVIEW
 *  50001 → REJECTED
 * 
 * @param {number} loanAmount
 * @param {number} [maxLoan]
 * @param {number} [borderlineRange]
 * @returns {{ status: 'PASS'|'FAIL'|'REVIEW', decision?: string, reason?: string }}
 */
function evaluateLoanAmount(
  loanAmount,
  maxLoan = RULES_CONFIG.MAX_LOAN_AMOUNT,
  borderlineRange = RULES_CONFIG.BORDERLINE_LOAN_RANGE
) {
  if (loanAmount > maxLoan) {
    return {
      status: 'FAIL',
      decision: RULES_CONFIG.DECISIONS.REJECTED,
      reason: `Requested loan amount exceeds the maximum limit of $${maxLoan.toLocaleString()}.`
    };
  }
  if (loanAmount >= maxLoan - borderlineRange) {
    return {
      status: 'REVIEW',
      decision: RULES_CONFIG.DECISIONS.MANUAL_REVIEW,
      reason: 'Requested loan amount is close to the maximum allowed amount.'
    };
  }
  return { status: 'PASS' };
}

/**
 * Master Decision Engine: Evaluates full loan application.
 *
 * ALL five checks are always evaluated (except early-exit on age failure).
 * A single clear FAIL in any check → overall REJECTED.
 * If no FAIL but any REVIEW → overall MANUAL REVIEW (all reasons collected).
 * If all PASS → APPROVED.
 *
 * @param {Object} application
 * @param {number} application.age
 * @param {number} application.monthlyIncome
 * @param {number} application.monthlyDebt
 * @param {string} application.previousLoanDefault
 * @param {number} application.overduePayments
 * @param {number} application.historicalLatePayments
 * @param {number|null} application.longestPreviousLoanRepaymentMonths
 * @param {number} application.loanAmount
 * @param {Object} [configOverride] - Partial override of RULES_CONFIG for testing
 * @returns {{
 *   decision: 'APPROVED' | 'REJECTED' | 'MANUAL REVIEW',
 *   reason: string,
 *   reasons: string[],
 *   dti: number,
 *   checks: {
 *     age: string,
 *     income: string,
 *     dti: string,
 *     creditRisk: string,
 *     loanAmount: string
 *   }
 * }}
 */
function evaluateLoanEligibility(application, configOverride = {}) {
  const config = { ...RULES_CONFIG, ...configOverride };
  const age = Number(application.age);
  const monthlyIncome = Number(application.monthlyIncome);
  const monthlyDebt = Number(application.monthlyDebt);
  const loanAmount = Number(application.loanAmount);

  // Calculate DTI for summary purposes
  const dti = calculateDTI(monthlyDebt, monthlyIncome);

  const checks = {};
  let failResult = null;    // first clear failure
  const reviewReasons = []; // collect all borderline reasons

  // ==========================================
  // STEP 1: Age Check (NEVER Manual Review)
  // ==========================================
  const ageResult = evaluateAge(age, config.MIN_AGE);
  if (ageResult.status === 'FAIL') {
    checks.age = RULES_CONFIG.CHECK_STATUS.FAIL;
    // Age failure is an immediate rejection – skip remaining checks
    return {
      decision: ageResult.decision,
      reason: ageResult.reason,
      reasons: [ageResult.reason],
      dti,
      checks
    };
  }
  checks.age = RULES_CONFIG.CHECK_STATUS.PASS;

  // ==========================================
  // STEP 2: Monthly Income Check
  // ==========================================
  const incomeResult = evaluateIncome(
    monthlyIncome,
    config.MIN_MONTHLY_INCOME,
    config.BORDERLINE_INCOME_BELOW_MIN_RANGE,
    config.BORDERLINE_INCOME_RANGE
  );
  if (incomeResult.status === 'FAIL') {
    checks.income = RULES_CONFIG.CHECK_STATUS.FAIL;
    if (!failResult) failResult = incomeResult;
  } else if (incomeResult.status === 'REVIEW') {
    checks.income = RULES_CONFIG.CHECK_STATUS.REVIEW;
    reviewReasons.push(incomeResult.reason);
  } else {
    checks.income = RULES_CONFIG.CHECK_STATUS.PASS;
  }

  // ==========================================
  // STEP 3: Debt-To-Income (DTI) Ratio Check
  // ==========================================
  const dtiResult = evaluateDTI(dti, config.MAX_DTI_PERCENTAGE, config.DTI_BORDERLINE_ENABLED);
  if (dtiResult.status === 'FAIL') {
    checks.dti = RULES_CONFIG.CHECK_STATUS.FAIL;
    if (!failResult) failResult = dtiResult;
  } else if (dtiResult.status === 'REVIEW') {
    checks.dti = RULES_CONFIG.CHECK_STATUS.REVIEW;
    reviewReasons.push(dtiResult.reason);
  } else {
    checks.dti = RULES_CONFIG.CHECK_STATUS.PASS;
  }

  // ==========================================
  // STEP 4: Credit Repayment Assessment
  // ==========================================
  const creditResult = evaluateCreditRepaymentAssessment(application);
  if (creditResult.status === 'FAIL') {
    checks.creditRisk = RULES_CONFIG.CHECK_STATUS.FAIL;
    if (!failResult) failResult = creditResult;
  } else if (creditResult.status === 'REVIEW') {
    checks.creditRisk = RULES_CONFIG.CHECK_STATUS.REVIEW;
    reviewReasons.push(...creditResult.reasons);
  } else {
    checks.creditRisk = RULES_CONFIG.CHECK_STATUS.PASS;
  }

  // ==========================================
  // STEP 5: Requested Loan Amount Check
  // ==========================================
  const loanResult = evaluateLoanAmount(loanAmount, config.MAX_LOAN_AMOUNT, config.BORDERLINE_LOAN_RANGE);
  if (loanResult.status === 'FAIL') {
    checks.loanAmount = RULES_CONFIG.CHECK_STATUS.FAIL;
    if (!failResult) failResult = loanResult;
  } else if (loanResult.status === 'REVIEW') {
    checks.loanAmount = RULES_CONFIG.CHECK_STATUS.REVIEW;
    reviewReasons.push(loanResult.reason);
  } else {
    checks.loanAmount = RULES_CONFIG.CHECK_STATUS.PASS;
  }

  // ==========================================
  // FINAL DECISION
  // ==========================================

  // Priority 1: Any clear failure → REJECTED
  if (failResult) {
    return {
      decision: failResult.decision,
      reason: failResult.reason,
      reasons: [failResult.reason],
      dti,
      checks,
      creditRiskScore: creditResult.score,
      creditRiskCategory: creditResult.category
    };
  }

  // Priority 2: Any borderline → MANUAL REVIEW (with ALL reasons)
  if (reviewReasons.length > 0) {
    return {
      decision: RULES_CONFIG.DECISIONS.MANUAL_REVIEW,
      reason: reviewReasons.join(' '),
      reasons: reviewReasons,
      dti,
      checks,
      creditRiskScore: creditResult.score,
      creditRiskCategory: creditResult.category
    };
  }

  // Priority 3: All clear → APPROVED
  return {
    decision: RULES_CONFIG.DECISIONS.APPROVED,
    reason: 'Congratulations! The applicant meets the automatic loan eligibility criteria.',
    reasons: [],
    dti,
    checks,
    creditRiskScore: creditResult.score,
    creditRiskCategory: creditResult.category
  };
}

module.exports = {
  calculateDTI,
  evaluateAge,
  evaluateIncome,
  evaluateDTI,
  evaluateCreditRepaymentAssessment,
  classifyCreditRiskScore,
  evaluateLoanAmount,
  evaluateLoanEligibility
};
