/**
 * Input Validation Middleware
 * 
 * Performs strict, independent backend validation for loan application requests.
 * Rejects empty values, non-numeric types, negative values, and out-of-range inputs.
 */

function validateLoanApplication(req, res, next) {
  const {
    age,
    monthlyIncome,
    monthlyDebt,
    previousLoanDefault,
    historicalLatePayments,
    overduePayments,
    longestPreviousLoanRepaymentMonths,
    loanAmount
  } = req.body;
  const errors = [];

  // 1. Age Validation
  if (age === undefined || age === null || age === '') {
    errors.push('Age is required.');
  } else if (typeof age !== 'number' && isNaN(Number(age))) {
    errors.push('Age must be a valid numeric value.');
  } else {
    const numAge = Number(age);
    if (!Number.isInteger(numAge)) {
      errors.push('Age must be an integer.');
    } else if (numAge <= 0 || numAge > 120) {
      errors.push('Age must be a realistic positive number between 1 and 120.');
    }
  }

  // 2. Monthly Income Validation
  if (monthlyIncome === undefined || monthlyIncome === null || monthlyIncome === '') {
    errors.push('Monthly income is required.');
  } else if (typeof monthlyIncome !== 'number' && isNaN(Number(monthlyIncome))) {
    errors.push('Monthly income must be a valid numeric value.');
  } else {
    const numIncome = Number(monthlyIncome);
    if (numIncome < 0) {
      errors.push('Monthly income cannot be negative.');
    }
  }

  // 3. Existing Monthly Debt Validation
  if (monthlyDebt === undefined || monthlyDebt === null || monthlyDebt === '') {
    errors.push('Existing monthly debt is required.');
  } else if (typeof monthlyDebt !== 'number' && isNaN(Number(monthlyDebt))) {
    errors.push('Existing monthly debt must be a valid numeric value.');
  } else {
    const numDebt = Number(monthlyDebt);
    if (numDebt < 0) {
      errors.push('Existing monthly debt cannot be negative.');
    }
  }

  // 4. Credit Repayment Assessment Validation
  if (!['YES', 'NO'].includes(previousLoanDefault)) {
    errors.push('Previous loan default must be either YES or NO.');
  }

  const validateNonNegativeInteger = (value, label) => {
    if (value === undefined || value === null || value === '') {
      errors.push(`${label} is required.`);
      return;
    }
    if (typeof value !== 'number' && (value.trim?.() === '' || isNaN(Number(value)))) {
      errors.push(`${label} must be a valid numeric value.`);
      return;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) errors.push(`${label} must be a valid numeric value.`);
    else if (!Number.isInteger(numberValue)) errors.push(`${label} must be an integer.`);
    else if (numberValue < 0) errors.push(`${label} cannot be negative.`);
  };

  validateNonNegativeInteger(historicalLatePayments, 'Historical late payments');
  validateNonNegativeInteger(overduePayments, 'Overdue payments');

  if (longestPreviousLoanRepaymentMonths !== null && longestPreviousLoanRepaymentMonths !== undefined && longestPreviousLoanRepaymentMonths !== '') {
    validateNonNegativeInteger(longestPreviousLoanRepaymentMonths, 'Longest previous loan repayment');
  }

  // 5. Requested Loan Amount Validation
  if (loanAmount === undefined || loanAmount === null || loanAmount === '') {
    errors.push('Requested loan amount is required.');
  } else if (typeof loanAmount !== 'number' && isNaN(Number(loanAmount))) {
    errors.push('Requested loan amount must be a valid numeric value.');
  } else {
    const numLoan = Number(loanAmount);
    if (numLoan <= 0) {
      errors.push('Requested loan amount must be a positive number greater than 0.');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: errors.join(' '),
      details: errors
    });
  }

  // Sanitize and coerce to numbers for controller
  req.sanitizedApplication = {
    age: Number(age),
    monthlyIncome: Number(monthlyIncome),
    monthlyDebt: Number(monthlyDebt),
    previousLoanDefault,
    historicalLatePayments: Number(historicalLatePayments),
    overduePayments: Number(overduePayments),
    longestPreviousLoanRepaymentMonths: longestPreviousLoanRepaymentMonths === null || longestPreviousLoanRepaymentMonths === '' || longestPreviousLoanRepaymentMonths === undefined
      ? null
      : Number(longestPreviousLoanRepaymentMonths),
    loanAmount: Number(loanAmount)
  };

  next();
}

module.exports = {
  validateLoanApplication
};
