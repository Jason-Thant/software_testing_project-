/**
 * Loan API Routes
 */

const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { validateLoanApplication } = require('../middleware/validator');

// POST /api/loan/check - Evaluate loan application
router.post('/check', validateLoanApplication, loanController.checkEligibility);

// GET /api/loan/applications - Retrieve submitted applications history
router.get('/applications', loanController.getApplications);

// GET /api/loan/applications/:id - Retrieve one customer result
router.get('/applications/:id', loanController.getApplicationResult);

// GET /api/loan/config - Retrieve decision rule configuration thresholds
router.get('/config', loanController.getConfig);

module.exports = router;
