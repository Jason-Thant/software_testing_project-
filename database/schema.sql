-- ==========================================================
-- Database Creation Script for Loan Eligibility System
-- Project: Loan Eligibility Analysis and Decision System
-- ==========================================================

-- 1. Create the database if it doesn't already exist
CREATE DATABASE IF NOT EXISTS loan_eligibility;

-- 2. Switch to the database
USE loan_eligibility;

-- 3. Create the loan_applications table
CREATE TABLE IF NOT EXISTS loan_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    age INT NOT NULL,
    monthly_income DECIMAL(12, 2) NOT NULL,
    monthly_debt DECIMAL(12, 2) NOT NULL,
    dti DECIMAL(5, 2) NOT NULL,
    credit_score INT DEFAULT NULL,
    previous_loan_default VARCHAR(3) NOT NULL,
    historical_late_payments INT NOT NULL,
    overdue_payments INT NOT NULL,
    longest_previous_loan_months INT DEFAULT NULL,
    credit_risk_score INT NOT NULL,
    credit_risk_category VARCHAR(20) NOT NULL,
    loan_amount DECIMAL(12, 2) NOT NULL,
    decision ENUM('APPROVED', 'REJECTED', 'MANUAL REVIEW') NOT NULL,
    reason TEXT NOT NULL,
    review_status VARCHAR(20) DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_rule_settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    setting_value VARCHAR(80) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sample query to verify structure
-- DESCRIBE loan_applications;
