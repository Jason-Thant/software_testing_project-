document.addEventListener('DOMContentLoaded', () => {
  const rows = document.getElementById('reviewRows');
  const refreshButton = document.getElementById('refreshButton');
  const detailPanel = document.getElementById('detailPanel');
  const settingsForm = document.getElementById('settingsForm');

  const escapeHtml = value => {
    const element = document.createElement('div');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
  };

  const money = value => `$${Number(value).toLocaleString()}`;
  const dti = value => `${Number(value).toFixed(2)}%`;
  const showMessage = (text, error = false) => {
    const message = document.getElementById('message');
    if (!message) return;
    message.hidden = false;
    message.textContent = text;
    message.style.background = error ? '#fff0f0' : '#e8f2fb';
    message.style.color = error ? '#b83232' : '#17547f';
  };

  async function loadQueue() {
    if (!rows) return;
    rows.innerHTML = '<tr><td class="empty" colspan="10">Loading pending reviews...</td></tr>';
    try {
      const response = await fetch('/api/admin/manual-reviews');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load reviews.');
      if (!result.data.length) {
        rows.innerHTML = '<tr><td class="empty" colspan="11">No applications are waiting for manual review.</td></tr>';
        return;
      }
      rows.innerHTML = result.data.map(application => `
        <tr>
          <td><strong>#${escapeHtml(application.id)}</strong></td>
          <td>${escapeHtml(application.user_full_name || 'Guest')}<br><small>${escapeHtml(application.user_email || 'No account linked')}</small></td>
          <td>${escapeHtml(application.age)}</td>
          <td>${money(application.monthly_income)}</td>
          <td>${money(application.monthly_debt)}</td>
          <td>${dti(application.dti)}</td>
          <td>${escapeHtml(application.credit_risk_category)}</td>
          <td>${money(application.loan_amount)}</td>
          <td>${escapeHtml(application.reason)}</td>
          <td><span class="status pending">PENDING</span></td>
          <td><a class="button button-review" href="/admin/manual-review/${encodeURIComponent(application.id)}">Review</a></td>
        </tr>
      `).join('');
    } catch (error) {
      rows.innerHTML = `<tr><td class="empty" colspan="11">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function loadSettings() {
    if (!settingsForm) return;
    const response = await fetch('/api/admin/settings');
    const result = await response.json();
    Object.entries(result.settings || {}).forEach(([key, value]) => {
      const input = settingsForm.elements[key];
      if (input) input.value = value;
    });
  }

  settingsForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const settings = Object.fromEntries(new FormData(settingsForm).entries());
    const response = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    const result = await response.json();
    const message = document.getElementById('settingsMessage');
    message.hidden = false;
    message.textContent = response.ok ? 'Decision boundaries saved.' : result.message;
    if (response.ok) await loadSettings();
  });

  async function loadDetail() {
    if (!detailPanel) return;
    const id = window.location.pathname.split('/').filter(Boolean).pop();
    try {
      const response = await fetch(`/api/admin/manual-reviews/${encodeURIComponent(id)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load this application.');
      const application = result.data;
      document.getElementById('detailSubtitle').textContent = `${application.user_full_name || 'Guest applicant'}${application.user_email ? ` (${application.user_email})` : ''} - Application #${application.id}`;
      document.getElementById('applicationDetails').innerHTML = [
        ['Applicant name', application.user_full_name || 'Guest applicant'],
        ['Applicant email', application.user_email || 'No account linked'],
        ['Age', application.age],
        ['Monthly income', money(application.monthly_income)],
        ['Existing monthly debt', money(application.monthly_debt)],
        ['DTI', dti(application.dti)],
        ['Risk category', application.credit_risk_category],
        ['Requested loan', money(application.loan_amount)],
        ['Decision', application.decision],
        ['Review status', application.review_status || 'Not reviewed']
      ].map(([label, value]) => `<div class="detail-item"><span class="label">${label}</span><span class="value">${escapeHtml(value)}</span></div>`).join('');
      const reasons = application.reason.split(/(?<=\.)\s+/).filter(Boolean);
      document.getElementById('assessmentDetails').innerHTML = [
        `Previous loan default: ${application.previous_loan_default === 'YES' ? 'Yes' : 'No'}`,
        `Overdue payments: ${application.overdue_payments}`,
        `Historical late payments: ${application.historical_late_payments}`,
        `Longest previous loan repayment: ${application.longest_previous_loan_months === null ? 'No previous loan' : `${application.longest_previous_loan_months} months`}`,
        `Risk category: ${application.credit_risk_category}`
      ].map(item => `<li>${escapeHtml(item)}</li>`).join('');
      document.getElementById('reasons').innerHTML = reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('');
      detailPanel.hidden = false;

      const submitDecision = async decision => {
        const buttons = document.querySelectorAll('#reviewActions button');
        buttons.forEach(button => { button.disabled = true; });
        try {
          const decisionResponse = await fetch(`/api/admin/manual-reviews/${encodeURIComponent(application.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision })
          });
          const decisionResult = await decisionResponse.json();
          if (!decisionResponse.ok) throw new Error(decisionResult.message || 'Unable to complete review.');
          document.getElementById('reviewStatus').textContent = 'COMPLETED';
          document.getElementById('reviewStatus').className = 'status completed';
          document.getElementById('reviewActions').hidden = true;
          showMessage(decisionResult.message);
        } catch (error) {
          buttons.forEach(button => { button.disabled = false; });
          showMessage(error.message, true);
        }
      };
      document.getElementById('approveButton').addEventListener('click', () => submitDecision('APPROVED'));
      document.getElementById('rejectButton').addEventListener('click', () => submitDecision('REJECTED'));
    } catch (error) {
      document.getElementById('errorState').hidden = false;
      document.getElementById('errorState').textContent = error.message;
    }
  }

  refreshButton?.addEventListener('click', loadQueue);
  if (rows) loadQueue();
  if (settingsForm) loadSettings();
  if (detailPanel) loadDetail();
});
