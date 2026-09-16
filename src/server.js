/**
 * Server Bootstrap
 */

require('dotenv').config();
const app = require('./app');
const { initializeDatabase } = require('./database/connection');

const PORT = process.env.PORT || 3000;

async function startServer() {
  // Fail startup when PostgreSQL is unavailable so data is never silently lost.
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`Loan Eligibility Analysis & Decision System`);
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Decision API: POST http://localhost:${PORT}/api/loan/check`);
    console.log(`History API:  GET  http://localhost:${PORT}/api/loan/applications`);
    console.log(`==================================================`);
  });
}

startServer().catch(error => {
  console.error(`[Startup Error] ${error.message}`);
  process.exitCode = 1;
});
