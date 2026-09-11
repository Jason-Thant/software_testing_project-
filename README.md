# Loan Eligibility Analysis and Decision System

A Node.js and Express application that evaluates loan applications using deterministic business rules, stores application results, and provides applicant and loan-officer views for manual review.

This project is designed for software-testing practice. The business rules are isolated in pure functions so they can be tested with unit, boundary-value, data-flow, control-flow, and integration tests.

## Features

- Loan eligibility evaluation with `APPROVED`, `REJECTED`, or `MANUAL REVIEW` outcomes.
- Debt-to-income (DTI) calculation.
- Project-specific credit repayment risk score with an itemized breakdown.
- Boundary-aware checks for age, income, DTI, credit risk, and loan amount.
- Applicant pages for submitting an application, viewing a result, and browsing history.
- Admin dashboard for statistics, pending manual reviews, final review decisions, and rule settings.
- MySQL persistence with automatic table creation and migrations.
- In-memory fallback when MySQL is unavailable, which is useful for local demonstrations and tests.
- JSON REST API and Jest test suites.

## Technology Stack

- Node.js
- Express 4
- MySQL with `mysql2`
- Jest and Supertest
- HTML, CSS, and browser JavaScript frontend
- `dotenv` for environment configuration
- `nodemon` for development

## Project Structure

```text
.
├── database/schema.sql              MySQL database and table definition
├── public/                          Applicant and admin frontend pages
│   ├── application.html             Loan application form
│   ├── result.html                  Decision result page
│   ├── history.html                 Application history page
│   └── admin/                       Manual-review pages and admin assets
├── src/
│   ├── app.js                       Express app, static files, routes, errors
│   ├── server.js                    Server and database startup
│   ├── config/rules.config.js       Default and configurable rule thresholds
│   ├── controllers/                 HTTP request handlers
│   ├── database/connection.js       MySQL and in-memory persistence
│   ├── middleware/validator.js      Request validation and number conversion
│   ├── routes/                      Applicant and admin API routes
│   ├── rules/decisionLogic.js       Pure eligibility and scoring logic
│   └── services/loanService.js      Evaluation and persistence orchestration
└── tests/
    ├── unit/                        Individual rule tests
    ├── boundary/                    Boundary-value tests
    ├── control-flow/                Decision-path tests
    ├── data-flow/                   Variable/data lifecycle tests
    └── integration/                 HTTP API tests
```

## Getting Started

### Requirements

- Node.js 18 or newer is recommended.
- MySQL 8 is optional. The application starts without it by using in-memory storage.

### Install dependencies

```bash
npm install
```

### Configure the environment

Create a `.env` file in the project root. You can start from `.env.example`:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=loan_eligibility

MIN_MONTHLY_INCOME=3000
MAX_LOAN_AMOUNT=50000
```

The server attempts to connect to MySQL on startup. If the connection fails, it logs a warning and stores applications in memory. In-memory records are lost when the process stops.

### Start the application

```bash
npm start
```

Open these pages in a browser:

- Applicant form: `http://localhost:3000/`
- Application form: `http://localhost:3000/application`
- History: `http://localhost:3000/history`
- Admin manual reviews: `http://localhost:3000/admin/manual-review`
- Health check: `http://localhost:3000/api/health`

For automatic restart during development:

```bash
npm run dev
```

### Initialize MySQL manually

The application creates the database and tables automatically when it can connect. To initialize manually, run `database/schema.sql` with a MySQL client. The database name defaults to `loan_eligibility`.

## Eligibility Decision Process

The decision engine evaluates checks in this order:

1. Age
2. Monthly income
3. DTI
4. Credit repayment assessment
5. Requested loan amount

Age is evaluated first. An age failure immediately returns `REJECTED`, so later checks are not evaluated in that case.

For all other applications:

- Any clear failure results in `REJECTED`.
- If there is no failure but at least one borderline result, the result is `MANUAL REVIEW`.
- If every check passes, the result is `APPROVED`.
- The first clear failure is used as the main rejection reason.
- All borderline reasons are collected for manual review.

Check statuses are `PASS`, `FAIL`, `REVIEW`, and, where applicable in stored/configuration data, `NOT_EVALUATED`.

## Credit Repayment Risk Score

The application does not calculate a traditional bank or FICO credit score. Its `creditRiskScore` is a project-specific repayment assessment from the applicant's supplied repayment history.

The score is the sum of four components:

```text
creditRiskScore = defaultPoints + overduePoints + latePaymentPoints + repaymentPoints
```

### 1. Previous loan default

| Previous loan default | Points |
| --- | ---: |
| `NO` | 35 |
| `YES` | 0 |

### 2. Overdue payments

| Overdue payments | Points |
| --- | ---: |
| 0 | 30 |
| 1 | 20 |
| 2 | 10 |
| 3 or more | 0 |

### 3. Historical late payments

| Historical late payments | Points |
| --- | ---: |
| 0 | 20 |
| 1-2 | 15 |
| 3-5 | 10 |
| 6 or more | 0 |

### 4. Longest previous loan repayment period

| Repayment period | Points |
| --- | ---: |
| No previous loan supplied | 10 |
| 12 months or less | 15 |
| 13-24 months | 12 |
| 25-36 months | 8 |
| 37 months or more | 5 |

The maximum reachable score with the current rules is 95 points, even though the low-risk threshold is documented as extending to 100.

### Credit risk categories

| Score | Category | Eligibility effect |
| ---: | --- | --- |
| 0-39 | `HIGH RISK` | `REJECTED` |
| 40-69 | `MEDIUM RISK` | `MANUAL REVIEW` |
| 70-100 | `LOW RISK` | Passes the credit-risk check |

Important boundary values:

- 39 is `HIGH RISK`.
- 40 is `MEDIUM RISK`.
- 69 is `MEDIUM RISK`.
- 70 is `LOW RISK`.

The API returns both `creditRiskScore` and `creditRiskCategory`. The decision logic also creates a component breakdown containing `defaultPoints`, `overduePoints`, `latePaymentPoints`, and `repaymentPoints.

## DTI Calculation

Debt-to-income ratio is calculated as a percentage using existing monthly debt and total monthly gross income:

```text
DTI = (monthlyDebt / monthlyIncome) * 100
```

The result is rounded to two decimal places. For example:

```text
monthlyDebt = 1,500
monthlyIncome = 5,000
DTI = (1,500 / 5,000) * 100 = 30.00%
```

When monthly income is zero or less, the function returns `100.00` to represent a maximum/unmanageable ratio. Request validation allows zero income, so it will normally be rejected by the DTI check.

### DTI boundaries

The default maximum DTI is 50%:

| DTI | Status | Effect |
| ---: | --- | --- |
| Less than 50% | `PASS` | Continue |
| Exactly 50% | `REVIEW` | `MANUAL REVIEW` |
| Greater than 50% | `FAIL` | `REJECTED` |

The exact-threshold review behavior is enabled by default through `DTI_BORDERLINE_ENABLED`.

## All Default Boundaries

The following are the default values in `src/config/rules.config.js`.

### Age

| Age | Result |
| ---: | --- |
| Less than 20 | `REJECTED` |
| 20 or older | Pass |

Age never produces manual review. The request validator also requires a realistic integer from 1 through 120.

### Monthly income

With a minimum income of $3,000, a lower borderline range of $300, and an upper borderline range of $300:

| Monthly income | Result |
| ---: | --- |
| Less than $2,700 | `REJECTED` |
| $2,700-$3,299 | `MANUAL REVIEW` |
| $3,300 or more | Pass |

The rejection message still states that the normal minimum requirement is $3,000.

### Requested loan amount

With a maximum loan amount of $50,000 and a borderline range of $5,000:

| Requested amount | Result |
| ---: | --- |
| Less than $45,000 | Pass |
| $45,000-$50,000 | `MANUAL REVIEW` |
| More than $50,000 | `REJECTED` |

The request validator requires a positive loan amount.

## Input Validation

`POST /api/loan/check` accepts these fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `age` | integer | Yes | Applicant age |
| `monthlyIncome` | number | Yes | Gross monthly income |
| `monthlyDebt` | number | Yes | Existing monthly debt obligations |
| `previousLoanDefault` | `YES` or `NO` | Yes | Whether a previous loan default occurred |
| `historicalLatePayments` | non-negative integer | Yes | Count of historical late payments |
| `overduePayments` | non-negative integer | Yes | Current/recorded overdue payment count |
| `longestPreviousLoanRepaymentMonths` | non-negative integer or `null` | No | Longest previous repayment period; `null` means no previous loan |
| `loanAmount` | positive number | Yes | Requested loan amount |

Invalid, missing, negative, non-integer, or unsupported values return HTTP `400` with a validation error and a `details` array.

## API Reference

### Health check

```http
GET /api/health
```

### Evaluate and save an application

```http
POST /api/loan/check
Content-Type: application/json
```

Example request:

```json
{
  "age": 30,
  "monthlyIncome": 6000,
  "monthlyDebt": 1200,
  "previousLoanDefault": "NO",
  "historicalLatePayments": 0,
  "overduePayments": 0,
  "longestPreviousLoanRepaymentMonths": null,
  "loanAmount": 20000
}
```

The example has a DTI of 20% and a credit risk score of 95, so it passes the checks and is normally `APPROVED`.

The response includes the application ID, decision, reason(s), DTI, check statuses, credit risk score/category, review status, storage type, and submitted application fields.

### Retrieve application history

```http
GET /api/loan/applications?limit=50
```

The limit defaults to 50 and is capped at 100.

### Retrieve one application

```http
GET /api/loan/applications/:id
```

### Retrieve current rule configuration

```http
GET /api/loan/config
```

### Admin dashboard

```http
GET /api/admin/dashboard
```

Returns total, pending, approved, rejected, and completed review counts.

### Admin rule settings

```http
GET /api/admin/settings
PATCH /api/admin/settings
Content-Type: application/json
```

Supported setting names are `minAge`, `minMonthlyIncome`, `borderlineIncomeBelowMinRange`, `borderlineIncomeRange`, `maxDtiPercentage`, `dtiBorderlineEnabled`, `creditRiskHighMax`, `creditRiskMediumMax`, `creditRiskLowMin`, `maxLoanAmount`, and `borderlineLoanRange`.

Credit-risk boundaries must remain ordered as:

```text
creditRiskHighMax < creditRiskMediumMax < creditRiskLowMin
```

The income lower borderline range cannot exceed the minimum income.

### Admin manual review workflow

```http
GET   /api/admin/manual-reviews
GET   /api/admin/manual-reviews/:id
PATCH /api/admin/manual-reviews/:id
Content-Type: application/json
```

To complete a review, send one of these bodies:

```json
{ "decision": "APPROVED" }
```

or:

```json
{ "decision": "REJECTED" }
```

Only applications currently marked `MANUAL REVIEW` with a `PENDING` review status can be finalized.

## Database

The main table is `loan_applications`. It stores the submitted inputs, calculated DTI, credit-risk score/category, final decision, reason, review status, timestamps, and the optional `credit_score` column retained for schema compatibility.

The active decision engine uses `credit_risk_score` and `credit_risk_category`; it does not calculate or use the separate `credit_score` column.

The `loan_rule_settings` table stores rule settings when MySQL is available. The application also performs safe startup migrations for older versions of the table.

## Testing

Run the complete test suite:

```bash
npm test
```

Run a specific suite:

```bash
npm run test:unit
npm run test:control-flow
npm run test:data-flow
npm run test:boundary
npm run test:integration
```

Generate coverage:

```bash
npm run test:coverage
```

The tests cover calculation examples, exact boundary values, decision priority, input/data flow, HTTP behavior, and MySQL-independent in-memory operation.

## Design Notes

- `src/rules/decisionLogic.js` contains deterministic functions and is independent of Express and the database.
- `src/middleware/validator.js` validates and normalizes incoming request values before they reach the controller.
- `src/services/loanService.js` coordinates evaluation and persistence.
- `src/database/connection.js` chooses MySQL when connected and falls back to in-memory storage when it is not.
- Manual review is a workflow state. The initial decision remains `MANUAL REVIEW` until an administrator submits a final `APPROVED` or `REJECTED` decision.
- This is an educational/demo decision system, not financial advice or a production underwriting model.
