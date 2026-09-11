/**
 * Admin API Routes
 * 
 * Handles Loan Officer Dashboard and Manual Review endpoints.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// GET /api/admin/dashboard - Dashboard statistics
router.get('/dashboard', adminController.getDashboardStats);

// GET/PATCH /api/admin/settings - Current configurable decision boundaries
router.get('/settings', adminController.getRuleSettings);
router.patch('/settings', adminController.updateRuleSettings);

// GET /api/admin/manual-reviews - List all pending manual reviews
router.get('/manual-reviews', adminController.listPendingReviews);

// GET /api/admin/manual-reviews/:id - Get single review detail
router.get('/manual-reviews/:id', adminController.getReviewDetail);

// PATCH /api/admin/manual-reviews/:id - Make final admin decision
router.patch('/manual-reviews/:id', adminController.patchReviewDecision);

module.exports = router;
