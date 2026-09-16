/**
 * Loan Application Service Layer
 * 
 * Coordinates decision rule evaluation and persistence.
 */

const { evaluateLoanEligibility } = require('../rules/decisionLogic');
const { saveApplicationRecord, fetchApplicationHistory, fetchApplicationById, fetchApplicationNotification, updateReviewStatus } = require('../database/connection');
const RULES_CONFIG = require('../config/rules.config');

/**
 * Evaluates an application and persists the decision record.
 * 
 * @param {Object} applicationData
 * @returns {Promise<Object>}
 */
async function processLoanApplication(applicationData, user = null) {
  // 1. Evaluate with pure decision engine
  const evaluation = evaluateLoanEligibility(applicationData);

  // 2. Prepare database record
  const recordToSave = {
    age: applicationData.age,
    monthlyIncome: applicationData.monthlyIncome,
    monthlyDebt: applicationData.monthlyDebt,
    dti: evaluation.dti,
    previousLoanDefault: applicationData.previousLoanDefault,
    historicalLatePayments: applicationData.historicalLatePayments,
    overduePayments: applicationData.overduePayments,
    longestPreviousLoanRepaymentMonths: applicationData.longestPreviousLoanRepaymentMonths,
    creditRiskScore: evaluation.creditRiskScore,
    creditRiskCategory: evaluation.creditRiskCategory,
    loanAmount: applicationData.loanAmount,
    decision: evaluation.decision,
    reason: evaluation.reason,
    review_status: evaluation.decision === 'MANUAL REVIEW' ? 'PENDING' : null,
    userId: user?.id || null
  };

  // 3. Persist to PostgreSQL
  const savedRecord = await saveApplicationRecord(recordToSave);

  return {
    id: savedRecord.id,
    decision: evaluation.decision,
    reason: evaluation.reason,
    reasons: evaluation.reasons || [],
    dti: evaluation.dti,
    checks: evaluation.checks,
    creditRiskScore: evaluation.creditRiskScore,
    creditRiskCategory: evaluation.creditRiskCategory,
    review_status: savedRecord.review_status,
    application: {
      age: applicationData.age,
      monthlyIncome: applicationData.monthlyIncome,
      monthlyDebt: applicationData.monthlyDebt,
      previousLoanDefault: applicationData.previousLoanDefault,
      historicalLatePayments: applicationData.historicalLatePayments,
      overduePayments: applicationData.overduePayments,
      longestPreviousLoanRepaymentMonths: applicationData.longestPreviousLoanRepaymentMonths,
      loanAmount: applicationData.loanAmount
    },
    createdAt: savedRecord.created_at,
    storage: savedRecord.storage
  };
}

/**
 * Retrieves application history.
 * 
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
async function getApplicationHistory(limit = 50) {
  return await fetchApplicationHistory(limit);
}

/**
 * Retrieves one submitted application for the customer result page.
 * Rebuilds the rule statuses from the stored inputs while preserving the
 * persisted final decision after an admin review.
 */
async function getApplicationResult(id, user = null) {
  const record = await fetchApplicationById(id);
  if (!record) return null;

  const evaluation = evaluateLoanEligibility({
    age: record.age,
    monthlyIncome: record.monthly_income,
    monthlyDebt: record.monthly_debt,
    previousLoanDefault: record.previous_loan_default,
    historicalLatePayments: record.historical_late_payments,
    overduePayments: record.overdue_payments,
    longestPreviousLoanRepaymentMonths: record.longest_previous_loan_months,
    loanAmount: record.loan_amount
  });

  return {
    id: record.id,
    decision: record.decision,
    reason: record.reason,
    reasons: evaluation.reasons || [],
    dti: Number(record.dti),
    checks: evaluation.checks,
    creditRiskScore: Number(record.credit_risk_score),
    creditRiskCategory: record.credit_risk_category,
    review_status: record.review_status,
    notification: await fetchApplicationNotification(id, user?.id || null),
    createdAt: record.created_at,
    application: {
      age: record.age,
      monthlyIncome: Number(record.monthly_income),
      monthlyDebt: Number(record.monthly_debt),
      previousLoanDefault: record.previous_loan_default,
      historicalLatePayments: record.historical_late_payments,
      overduePayments: record.overdue_payments,
      longestPreviousLoanRepaymentMonths: record.longest_previous_loan_months,
      loanAmount: Number(record.loan_amount)
    }
  };
}

/**
 * Update review status for manual review applications.
 * 
 * @param {number|string} id
 * @param {string} status - 'APPROVED' or 'REJECTED'
 * @returns {Promise<Object>}
 */
async function setManualReviewResult(id, status) {
  return await updateReviewStatus(id, status);
}

/**
 * Returns current rules configuration.
 */
function getRulesConfiguration() {
  return RULES_CONFIG.getRulesConfiguration();
}

module.exports = {
  processLoanApplication,
  getApplicationHistory,
  getApplicationResult,
  getRulesConfiguration,
  setManualReviewResult
};
