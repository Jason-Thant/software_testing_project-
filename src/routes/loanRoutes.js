/**
 * Loan API Routes
 */

const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { validateLoanApplication } = require('../middleware/validator');
const { optionalAuth } = require('../middleware/auth');

// POST /api/loan/check - Evaluate loan application
router.post('/check', optionalAuth, validateLoanApplication, loanController.checkEligibility);

// GET /api/loan/applications - Retrieve submitted applications history
router.get('/applications', optionalAuth, loanController.getApplications);

// GET /api/loan/applications/:id - Retrieve one customer result
router.get('/applications/:id', optionalAuth, loanController.getApplicationResult);

// GET /api/loan/config - Retrieve decision rule configuration thresholds
router.get('/config', loanController.getConfig);

module.exports = router;
