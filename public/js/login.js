document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const alertBox = document.getElementById('loginAlert');

  const setError = (id, message) => {
    const field = document.getElementById(id);
    const error = document.getElementById(`${id}Error`);
    if (field) field.classList.toggle('is-invalid', Boolean(message));
    if (error) error.textContent = message || '';
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();

    setError('email', '');
    setError('password', '');
    alertBox.hidden = true;
    alertBox.textContent = '';

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    let valid = true;

    if (!email) {
      setError('email', 'Email is required.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('email', 'Enter a valid email address.');
      valid = false;
    }

    if (!password) {
      setError('password', 'Password is required.');
      valid = false;
    }

    if (!valid) return;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Invalid email or password.');
      localStorage.setItem('loanPortalToken', result.token);
      localStorage.setItem('loanPortalLoggedIn', 'true');
      localStorage.setItem('loanPortalRole', result.user.role);
      localStorage.setItem('loanPortalUser', JSON.stringify(result.user));
      window.location.href = result.user.role === 'admin' ? '/admin/manual-review' : '/apply';
    } catch (error) {
      alertBox.hidden = false;
      alertBox.textContent = error.message;
    }
  });
});
