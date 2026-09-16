document.addEventListener('DOMContentLoaded', () => {
  const escapeHtml = value => {
    const element = document.createElement('div');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
  };
  const money = value => `$${Number(value).toLocaleString()}`;
  const formatDti = value => `${Number(value).toFixed(2)}%`;
  const setFieldError = (name, message) => {
    const field = document.getElementById(name);
    const error = document.getElementById(`${name}Error`);
    if (field) field.classList.toggle('is-invalid', Boolean(message));
    if (error) error.textContent = message || '';
  };

  const applicationForm = document.getElementById('applicationForm');
  if (applicationForm) {
    fetch('/api/loan/config').then(response => response.json()).then(result => {
      const config = result.config;
      if (!config) return;
      document.getElementById('ageHint').textContent = `Minimum: ${config.minAge}`;
      document.getElementById('incomeHint').textContent = `Review range: $${Number(config.minMonthlyIncome - config.borderlineIncomeBelowMinRange).toLocaleString()}-$${Number(config.minMonthlyIncome + config.borderlineIncomeRange - 1).toLocaleString()}`;
      document.getElementById('loanHint').textContent = `Maximum: $${Number(config.maxLoanAmount).toLocaleString()}`;
    }).catch(() => {});

    applicationForm.addEventListener('submit', async event => {
      event.preventDefault();
      ['age', 'monthlyIncome', 'monthlyDebt', 'previousLoanDefault', 'overduePayments', 'historicalLatePayments', 'longestPreviousLoanRepaymentMonths', 'loanAmount'].forEach(name => setFieldError(name, ''));
      const repaymentMonthsValue = document.getElementById('longestPreviousLoanRepaymentMonths').value;
      const values = {
        age: Number(document.getElementById('age').value),
        monthlyIncome: Number(document.getElementById('monthlyIncome').value),
        monthlyDebt: Number(document.getElementById('monthlyDebt').value),
        previousLoanDefault: document.getElementById('previousLoanDefault').value,
        overduePayments: Number(document.getElementById('overduePayments').value),
        historicalLatePayments: Number(document.getElementById('historicalLatePayments').value),
        longestPreviousLoanRepaymentMonths: repaymentMonthsValue === 'NO_PREVIOUS_LOAN' ? null : Number(repaymentMonthsValue),
        loanAmount: Number(document.getElementById('loanAmount').value)
      };
      const requiredFields = [['age', 'Age is required.'], ['monthlyIncome', 'Monthly income is required.'], ['monthlyDebt', 'Monthly debt is required.'], ['previousLoanDefault', 'Please answer the default history question.'], ['overduePayments', 'Overdue payments is required.'], ['historicalLatePayments', 'Historical late payments is required.'], ['longestPreviousLoanRepaymentMonths', 'Please select a repayment history option.'], ['loanAmount', 'Loan amount is required.']];
      let valid = true;
      requiredFields.forEach(([name, message]) => { if (!document.getElementById(name).value.trim()) { setFieldError(name, message); valid = false; } });
      if (!valid) return;
      const button = document.getElementById('submitButton');
      button.disabled = true;
      try {
        const response = await fetch('/api/loan/check', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('loanPortalToken') ? { Authorization: `Bearer ${localStorage.getItem('loanPortalToken')}` } : {}) }, body: JSON.stringify(values) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to process application.');
        sessionStorage.setItem('latestLoanResult', JSON.stringify(result));
        window.location.href = `/result/${encodeURIComponent(result.id)}`;
      } catch (error) {
        const alert = document.getElementById('formAlert');
        alert.hidden = false;
        alert.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  const resultPanel = document.getElementById('resultPanel');
  if (resultPanel) {
    const applicationId = window.location.pathname.match(/^\/result\/(\d+)$/)?.[1];
    const loadStoredResult = async () => {
      const stored = sessionStorage.getItem('latestLoanResult');
      const storedId = stored ? JSON.parse(stored).id : null;
      const resultId = applicationId || storedId;
      if (resultId) {
        const response = await fetch(`/api/loan/applications/${resultId}`, { headers: localStorage.getItem('loanPortalToken') ? { Authorization: `Bearer ${localStorage.getItem('loanPortalToken')}` } : {} });
        if (!response.ok) throw new Error('Unable to load this application result.');
        return (await response.json());
      }
      return stored ? JSON.parse(stored) : null;
    };

    loadStoredResult().then(result => {
      if (!result) return;
      const decision = result.decision;
      resultPanel.hidden = false;
      document.getElementById('emptyResult').hidden = true;
      const banner = document.getElementById('decisionBanner');
      banner.className = `decision-banner status-${decision === 'MANUAL REVIEW' ? 'review' : decision.toLowerCase()}`;
      document.getElementById('decisionBadge').textContent = decision;
      document.getElementById('decisionMessage').textContent = result.notification?.message || (decision === 'APPROVED' ? 'Congratulations! Your loan has been approved.' : decision === 'REJECTED' ? 'The applicant does not meet the loan eligibility criteria.' : 'The application requires review by an authorized loan officer.');
      if (result.notification) document.getElementById('decisionBanner').classList.add('has-notification');
      document.getElementById('reasonBox').textContent = result.reason;
      if (decision === 'MANUAL REVIEW') {
        const reviewButton = document.getElementById('manualReviewButton');
        reviewButton.hidden = false;
        reviewButton.href = `/admin/manual-review/${encodeURIComponent(result.id)}`;
      }
      const application = result.application;
      const repaymentMonths = application.longestPreviousLoanRepaymentMonths === null ? 'No previous loan' : `${application.longestPreviousLoanRepaymentMonths} months`;
      document.getElementById('summaryGrid').innerHTML = [['Age', `${application.age} years`], ['Monthly income', money(application.monthlyIncome)], ['Existing debt', money(application.monthlyDebt)], ['DTI', formatDti(result.dti)], ['Previous default', application.previousLoanDefault === 'YES' ? 'Yes' : 'No'], ['Current overdue payments', application.overduePayments], ['Historical late payments', application.historicalLatePayments], ['Longest repayment', repaymentMonths], ['Risk category', result.creditRiskCategory], ['Requested loan', money(application.loanAmount)]].map(([label, value]) => `<div class="metric-card"><span class="metric-label">${label}</span><span class="metric-value">${escapeHtml(value)}</span></div>`).join('');
      document.getElementById('checks').innerHTML = Object.entries(result.checks || {}).map(([name, status]) => `<div class="pipeline-step"><span class="step-name">${escapeHtml(name)}</span><span class="step-status status-badge-${status.toLowerCase()}">${escapeHtml(status)}</span></div>`).join('');
    }).catch(error => {
      document.getElementById('emptyResult').hidden = false;
      document.getElementById('emptyResult').querySelector('p').textContent = error.message;
    });
  }

  const historyRows = document.getElementById('historyRows');
  if (historyRows) {
    const loadHistory = async () => {
      try {
        const response = await fetch('/api/loan/applications?limit=50', { headers: localStorage.getItem('loanPortalToken') ? { Authorization: `Bearer ${localStorage.getItem('loanPortalToken')}` } : {} });
        const result = await response.json();
        if (!response.ok || !result.data.length) { historyRows.innerHTML = '<tr><td colspan="10" class="empty-table">No applications submitted yet.</td></tr>'; return; }
        historyRows.innerHTML = result.data.map(item => `<tr><td><strong>#${escapeHtml(item.id)}</strong></td><td>${escapeHtml(item.age)}</td><td>${money(item.monthly_income)}</td><td>${money(item.monthly_debt)}</td><td>${formatDti(item.dti)}</td><td>${escapeHtml(item.credit_risk_category)}</td><td>${money(item.loan_amount)}</td><td><span class="table-badge" data-status="${escapeHtml(item.decision)}">${escapeHtml(item.decision)}</span></td><td><small>${escapeHtml(item.reason)}</small></td><td><small>${new Date(item.created_at).toLocaleString()}</small></td></tr>`).join('');
      } catch (error) { historyRows.innerHTML = `<tr><td colspan="10" class="empty-table">${escapeHtml(error.message)}</td></tr>`; }
    };
    document.getElementById('refreshHistory')?.addEventListener('click', loadHistory);
    loadHistory();
  }
});
