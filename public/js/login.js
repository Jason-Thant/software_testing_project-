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

  form.addEventListener('submit', event => {
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

    const accounts = {
      'user@loan.com': { password: 'user123', redirect: '/apply' },
      'admin@loan.com': { password: 'password123', redirect: '/admin/manual-review' }
    };

    const account = accounts[email];

    if (!account || password !== account.password) {
      alertBox.hidden = false;
      alertBox.textContent = 'Invalid email or password. Use one of the demo credentials shown below.';
      return;
    }

    localStorage.setItem('loanPortalLoggedIn', 'true');
    localStorage.setItem('loanPortalRole', email === 'admin@loan.com' ? 'admin' : 'user');
    window.location.href = account.redirect;
  });
});
