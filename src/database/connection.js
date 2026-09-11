/**
 * Database Connection Module
 * 
 * Manages MySQL connection pool using mysql2/promise.
 * Provides resilient initialization with auto-table migration and an
 * in-memory fallback cache so the application remains operable for demonstration
 * and testing even if a local MySQL daemon is not running.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();
const RULES_CONFIG = require('../config/rules.config');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'loan_eligibility',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;
let isConnected = false;

// Fallback in-memory storage if MySQL is unreachable during offline testing/demos
const inMemoryApplications = [];
let nextMemoryId = 1;
let inMemoryRulesConfiguration = null;

/**
 * Creates MySQL connection pool and ensures the schema exists.
 */
async function initializeDatabase() {
  try {
    // First attempt to connect without database specified to create database if missing
    const rootConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password
    });

    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
    await rootConnection.end();

    // Now create pool with the database
    pool = mysql.createPool(dbConfig);

    // Verify connection and create table
    const connection = await pool.getConnection();
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS loan_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        age INT NOT NULL,
        monthly_income DECIMAL(12, 2) NOT NULL,
        monthly_debt DECIMAL(12, 2) NOT NULL,
        dti DECIMAL(5, 2) NOT NULL,
        credit_score INT DEFAULT NULL,
        previous_loan_default VARCHAR(3) NOT NULL DEFAULT 'NO',
        historical_late_payments INT NOT NULL DEFAULT 0,
        overdue_payments INT NOT NULL DEFAULT 0,
        longest_previous_loan_months INT DEFAULT NULL,
        credit_risk_score INT NOT NULL DEFAULT 0,
        credit_risk_category VARCHAR(20) NOT NULL DEFAULT 'HIGH RISK',
        loan_amount DECIMAL(12, 2) NOT NULL,
        decision ENUM('APPROVED', 'REJECTED', 'MANUAL REVIEW') NOT NULL,
        reason TEXT NOT NULL,
        review_status VARCHAR(20) DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await connection.query(createTableQuery);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS loan_rule_settings (
        setting_key VARCHAR(80) PRIMARY KEY,
        setting_value VARCHAR(80) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const assessmentMigrations = [
      'ALTER TABLE loan_applications MODIFY COLUMN credit_score INT DEFAULT NULL',
      "ALTER TABLE loan_applications ADD COLUMN previous_loan_default VARCHAR(3) NOT NULL DEFAULT 'NO' AFTER credit_score",
      'ALTER TABLE loan_applications ADD COLUMN historical_late_payments INT NOT NULL DEFAULT 0 AFTER previous_loan_default',
      'ALTER TABLE loan_applications ADD COLUMN overdue_payments INT NOT NULL DEFAULT 0 AFTER historical_late_payments',
      'ALTER TABLE loan_applications ADD COLUMN longest_previous_loan_months INT DEFAULT NULL AFTER overdue_payments',
      "ALTER TABLE loan_applications ADD COLUMN credit_risk_score INT NOT NULL DEFAULT 0 AFTER longest_previous_loan_months",
      "ALTER TABLE loan_applications ADD COLUMN credit_risk_category VARCHAR(20) NOT NULL DEFAULT 'HIGH RISK' AFTER credit_risk_score"
    ];
    for (const migration of assessmentMigrations) {
      try { await connection.query(migration); } catch (e) { /* already applied */ }
    }

    // Add review fields if they don't exist (safe migration for older schemas)
    try {
      await connection.query(`
        ALTER TABLE loan_applications ADD COLUMN review_status VARCHAR(20) DEFAULT NULL AFTER reason;
      `);
    } catch (e) {
      // Column already exists – ignore
    }

    try {
      await connection.query(`
        ALTER TABLE loan_applications ADD COLUMN reviewed_at DATETIME DEFAULT NULL AFTER review_status;
      `);
    } catch (e) {
      // Column already exists – ignore
    }

    connection.release();

    isConnected = true;
    await loadRulesConfiguration();
    console.log(`[Database] Successfully connected to MySQL database: ${dbConfig.database}`);
    return true;
  } catch (error) {
    isConnected = false;
    console.warn(`[Database Warning] MySQL connection failed (${error.message}). Running in safe offline mode (in-memory storage).`);
    return false;
  }
}

/**
 * Saves a loan application and decision to the database.
 * 
 * @param {Object} record
 * @returns {Promise<Object>} Inserted record with generated ID and timestamp
 */
async function saveApplicationRecord(record) {
  const {
    age, monthlyIncome, monthlyDebt, dti, previousLoanDefault, historicalLatePayments,
    overduePayments, longestPreviousLoanRepaymentMonths, creditRiskScore,
    creditRiskCategory, loanAmount, decision, reason
  } = record;

  if (isConnected && pool) {
    try {
      const sql = `
        INSERT INTO loan_applications 
        (age, monthly_income, monthly_debt, dti, previous_loan_default, historical_late_payments,
         overdue_payments, longest_previous_loan_months, credit_risk_score,
         credit_risk_category, loan_amount, decision, reason, review_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await pool.execute(sql, [
        age,
        monthlyIncome,
        monthlyDebt,
        dti,
        previousLoanDefault,
        historicalLatePayments,
        overduePayments,
        longestPreviousLoanRepaymentMonths,
        creditRiskScore,
        creditRiskCategory,
        loanAmount,
        decision,
        reason,
        record.review_status || null
      ]);

      return {
        id: result.insertId,
        age,
        monthly_income: monthlyIncome,
        monthly_debt: monthlyDebt,
        dti,
        previous_loan_default: previousLoanDefault,
        historical_late_payments: historicalLatePayments,
        overdue_payments: overduePayments,
        longest_previous_loan_months: longestPreviousLoanRepaymentMonths,
        credit_risk_score: creditRiskScore,
        credit_risk_category: creditRiskCategory,
        loan_amount: loanAmount,
        decision,
        reason,
        review_status: record.review_status || null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        storage: 'mysql'
      };
    } catch (err) {
      console.error('[Database Error] Failed to write to MySQL, falling back to memory:', err.message);
    }
  }

  // Fallback to memory
  const memoryRecord = {
    id: nextMemoryId++,
    age,
    monthly_income: monthlyIncome,
    monthly_debt: monthlyDebt,
    dti,
    previous_loan_default: previousLoanDefault,
    historical_late_payments: historicalLatePayments,
    overdue_payments: overduePayments,
    longest_previous_loan_months: longestPreviousLoanRepaymentMonths,
    credit_risk_score: creditRiskScore,
    credit_risk_category: creditRiskCategory,
    loan_amount: loanAmount,
    decision,
    reason,
    review_status: record.review_status || null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    storage: 'in-memory'
  };
  inMemoryApplications.unshift(memoryRecord);
  return memoryRecord;
}

/**
 * Fetches all past loan applications ordered from newest to oldest.
 * 
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
async function fetchApplicationHistory(limit = 50) {
  if (isConnected && pool) {
    try {
      const sql = `
         SELECT id, age, monthly_income, monthly_debt, dti, previous_loan_default,
           historical_late_payments, overdue_payments, longest_previous_loan_months,
           credit_risk_score, credit_risk_category, loan_amount,
               decision, reason, review_status, reviewed_at, created_at
        FROM loan_applications
        ORDER BY id DESC
        LIMIT ?
      `;
      const [rows] = await pool.query(sql, [limit]);
      return rows;
    } catch (err) {
      console.error('[Database Error] Failed to read from MySQL, falling back to memory:', err.message);
    }
  }

  return inMemoryApplications.slice(0, limit);
}

async function loadRulesConfiguration() {
  if (isConnected && pool) {
    try {
      const [rows] = await pool.query('SELECT setting_key, setting_value FROM loan_rule_settings');
      if (rows.length > 0) {
        const updates = Object.fromEntries(rows.map(row => [row.setting_key, Number(row.setting_value)]));
        if (updates.dtiBorderlineEnabled !== undefined) updates.dtiBorderlineEnabled = Boolean(updates.dtiBorderlineEnabled);
        inMemoryRulesConfiguration = RULES_CONFIG.updateRulesConfiguration(updates);
      }
    } catch (error) {
      console.error('[Database Error] Failed to load rule settings:', error.message);
    }
  }
  return inMemoryRulesConfiguration || RULES_CONFIG.getRulesConfiguration();
}

async function saveRulesConfiguration(configuration) {
  inMemoryRulesConfiguration = RULES_CONFIG.updateRulesConfiguration(configuration);
  if (isConnected && pool) {
    try {
      for (const [key, value] of Object.entries(inMemoryRulesConfiguration)) {
        await pool.execute(
          'INSERT INTO loan_rule_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          [key, String(value)]
        );
      }
    } catch (error) {
      console.error('[Database Error] Failed to save rule settings:', error.message);
    }
  }
  return inMemoryRulesConfiguration;
}

/**
 * Fetches all pending manual review applications.
 * @returns {Promise<Array>}
 */
async function fetchPendingManualReviews() {
  if (isConnected && pool) {
    try {
      const sql = `
         SELECT id, age, monthly_income, monthly_debt, dti, previous_loan_default,
           historical_late_payments, overdue_payments, longest_previous_loan_months,
           credit_risk_score, credit_risk_category, loan_amount,
               decision, reason, review_status, reviewed_at, created_at
        FROM loan_applications
        WHERE decision = 'MANUAL REVIEW' AND review_status = 'PENDING'
        ORDER BY id DESC
      `;
      const [rows] = await pool.query(sql);
      return rows;
    } catch (err) {
      console.error('[Database Error] fetchPendingManualReviews failed, falling back to memory:', err.message);
    }
  }

  return inMemoryApplications.filter(
    r => r.decision === 'MANUAL REVIEW' && r.review_status === 'PENDING'
  );
}

/**
 * Fetches a single application by ID.
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
async function fetchApplicationById(id) {
  if (isConnected && pool) {
    try {
      const sql = `
         SELECT id, age, monthly_income, monthly_debt, dti, previous_loan_default,
           historical_late_payments, overdue_payments, longest_previous_loan_months,
           credit_risk_score, credit_risk_category, loan_amount,
               decision, reason, review_status, reviewed_at, created_at
        FROM loan_applications
        WHERE id = ?
      `;
      const [rows] = await pool.query(sql, [Number(id)]);
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.error('[Database Error] fetchApplicationById failed, falling back to memory:', err.message);
    }
  }

  return inMemoryApplications.find(r => r.id === Number(id)) || null;
}

// Closes the database pool (useful for clean test teardowns).
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    isConnected = false;
  }
}

// Retrieves pool health status.
function getPoolStatus() {
  return {
    isConnected,
    poolExists: !!pool
  };
}

/**
 * Updates the review status for a given application ID.
 * Only applications with decision = 'MANUAL REVIEW' and review_status = 'PENDING'
 * can be reviewed.
 *
 * @param {number|string} id
 * @param {string} status - 'APPROVED' or 'REJECTED'
 * @returns {Promise<Object>}
 */
async function updateReviewStatus(id, status) {
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new Error('Invalid review status. Must be APPROVED or REJECTED.');
  }

  if (isConnected && pool) {
    try {
      // Verify the record is eligible for review
      const [existing] = await pool.query(
        'SELECT id, decision, review_status FROM loan_applications WHERE id = ?',
        [Number(id)]
      );
      if (existing.length === 0) {
        throw new Error('Record not found');
      }
      if (existing[0].decision !== 'MANUAL REVIEW' || existing[0].review_status !== 'PENDING') {
        throw new Error('This application has already been reviewed or is not eligible for manual review.');
      }

      const sql = `
        UPDATE loan_applications 
        SET decision = ?, review_status = 'COMPLETED', reviewed_at = NOW()
        WHERE id = ? AND review_status = 'PENDING'
      `;
      await pool.execute(sql, [status, Number(id)]);
      return { id: Number(id), decision: status, review_status: 'COMPLETED' };
    } catch (err) {
      if (err.message.includes('not found') || err.message.includes('already been reviewed')) {
        throw err;
      }
      console.error('[Database Error] Failed to update review status, falling back to memory:', err.message);
    }
  }

  // Memory fallback
  const record = inMemoryApplications.find(r => r.id === Number(id));
  if (!record) {
    throw new Error('Record not found');
  }
  if (record.decision !== 'MANUAL REVIEW' || record.review_status !== 'PENDING') {
    throw new Error('This application has already been reviewed or is not eligible for manual review.');
  }
  record.decision = status;
  record.review_status = 'COMPLETED';
  record.reviewed_at = new Date().toISOString();
  return { id: record.id, decision: status, review_status: 'COMPLETED' };
}

module.exports = {
  initializeDatabase,
  saveApplicationRecord,
  fetchApplicationHistory,
  fetchPendingManualReviews,
  fetchApplicationById,
  closeDatabase,
  getPoolStatus,
  updateReviewStatus,
  isDatabaseConnected: () => isConnected,
  getInMemoryApplications: () => inMemoryApplications,
  clearMemory: () => { inMemoryApplications.length = 0; nextMemoryId = 1; },
  loadRulesConfiguration,
  saveRulesConfiguration
};
