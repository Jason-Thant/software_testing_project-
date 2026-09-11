/**
 * Loan Controller
 * 
 * Handles incoming HTTP requests for loan evaluation and history.
 */

const loanService = require('../services/loanService');

/**
 * Handles POST /api/loan/check
 */
async function checkEligibility(req, res) {
  try {
    const applicationData = req.sanitizedApplication || req.body;
    const result = await loanService.processLoanApplication(applicationData);

    return res.status(200).json({
      success: true,
      decision: result.decision,
      reason: result.reason,
      reasons: result.reasons || [],
      dti: result.dti,
      checks: result.checks,
      creditRiskScore: result.creditRiskScore,
      creditRiskCategory: result.creditRiskCategory,
      review_status: result.review_status || null,
      id: result.id,
      application: result.application,
      createdAt: result.createdAt,
      storage: result.storage
    });
  } catch (error) {
    console.error('[Controller Error] checkEligibility:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while processing the loan application.'
    });
  }
}

/**
 * Handles GET /api/loan/applications
 */
async function getApplications(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const applications = await loanService.getApplicationHistory(limit);

    return res.status(200).json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    console.error('[Controller Error] getApplications:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to retrieve application history.'
    });
  }
}

/**
 * Handles GET /api/loan/applications/:id
 */
async function getApplicationResult(req, res) {
  try {
    const result = await loanService.getApplicationResult(req.params.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Application #${req.params.id} does not exist.`
      });
    }
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Controller Error] getApplicationResult:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to retrieve the application result.'
    });
  }
}

/**
 * Handles GET /api/loan/config
 */
function getConfig(req, res) {
  try {
    const config = loanService.getRulesConfiguration();
    return res.status(200).json({
      success: true,
      config
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to retrieve configuration.'
    });
  }
}

module.exports = {
  checkEligibility,
  getApplications,
  getApplicationResult,
  getConfig
};
