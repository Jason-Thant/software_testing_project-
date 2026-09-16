/**
 * Express Application Configuration
 * 
 * Sets up middlewares, static assets, and API routes.
 * Exported separately from server.js to allow Supertest integration testing.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const loanRoutes = require('./routes/loanRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public entry points
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/signup.html'));
});

// Applicant pages
app.get('/application', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/application.html'));
});

app.get('/apply', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/application.html'));
});

app.get('/result', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/result.html'));
});

app.get('/result/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/result.html'));
});

app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/history.html'));
});

// Serve static frontend files from /public directory
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/loan', loanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);

// Admin pages
app.get('/admin/manual-review', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/manual-review.html'));
});

app.get('/admin/manual-review/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/manual-review-detail.html'));
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 404 Handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Endpoint ${req.originalUrl} does not exist.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  res.status(err.status || 500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message || 'An unexpected server error occurred.'
  });
});

module.exports = app;
