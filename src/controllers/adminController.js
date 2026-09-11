/**
 * Admin Controller
 * 
 * Handles HTTP requests for the Loan Officer Dashboard and Manual Review workflow.
 */

const {
  fetchPendingManualReviews,
  fetchApplicationById,
  fetchApplicationHistory,
  updateReviewStatus
} = require('../database/connection');
const { getRulesConfiguration } = require('../config/rules.config');
const { saveRulesConfiguration } = require('../database/connection');

async function getRuleSettings(req, res) {
  try {
    return res.status(200).json({ success: true, settings: getRulesConfiguration() });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

async function updateRuleSettings(req, res) {
  try {
    const settings = await saveRulesConfiguration(req.body || {});
    return res.status(200).json({ success: true, settings });
  } catch (error) {
    return res.status(400).json({ success: false, error: 'Validation Error', message: error.message });
  }
}

/**
 * GET /api/admin/dashboard
 * Returns aggregate statistics for the dashboard.
 */
async function getDashboardStats(req, res) {
  try {
    const allApps = await fetchApplicationHistory(10000);
    const total = allApps.length;
    const pending = allApps.filter(a => a.decision === 'MANUAL REVIEW' && a.review_status === 'PENDING').length;
    const approved = allApps.filter(a => a.decision === 'APPROVED').length;
    const rejected = allApps.filter(a => a.decision === 'REJECTED').length;
    const manualReview = allApps.filter(a => a.review_status === 'COMPLETED').length;

    return res.status(200).json({
      success: true,
      stats: { total, pending, approved, rejected, completed: manualReview }
    });
  } catch (error) {
    console.error('[Admin Controller] getDashboardStats error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

/**
 * GET /api/admin/manual-reviews
 * Returns all pending manual review applications.
 */
async function listPendingReviews(req, res) {
  try {
    const pendingApps = await fetchPendingManualReviews();
    return res.status(200).json({
      success: true,
      count: pendingApps.length,
      data: pendingApps
    });
  } catch (error) {
    console.error('[Admin Controller] listPendingReviews error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

/**
 * GET /api/admin/manual-reviews/:id
 * Returns a single application for detailed review.
 */
async function getReviewDetail(req, res) {
  try {
    const { id } = req.params;
    const application = await fetchApplicationById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Application #${id} does not exist.`
      });
    }

    if (application.decision !== 'MANUAL REVIEW' || application.review_status !== 'PENDING') {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Application #${id} is not pending manual review.`
      });
    }

    return res.status(200).json({
      success: true,
      data: application
    });
  } catch (error) {
    console.error('[Admin Controller] getReviewDetail error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

/**
 * PATCH /api/admin/manual-reviews/:id
 * Makes the final admin decision (APPROVED or REJECTED).
 */
async function patchReviewDecision(req, res) {
  try {
    const { id } = req.params;
    const { decision } = req.body;

    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Decision must be either "APPROVED" or "REJECTED".'
      });
    }

    const result = await updateReviewStatus(id, decision);
    return res.status(200).json({
      success: true,
      message: `Application #${id} has been ${decision.toLowerCase()} by the loan officer.`,
      data: result
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
    }
    if (error.message.includes('already been reviewed')) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: error.message
      });
    }
    console.error('[Admin Controller] patchReviewDecision error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

module.exports = {
  getRuleSettings,
  updateRuleSettings,
  getDashboardStats,
  listPendingReviews,
  getReviewDetail,
  patchReviewDecision
};
