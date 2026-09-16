document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signupForm');
  const alertBox = document.getElementById('signupAlert');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    alertBox.hidden = true;
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
      alertBox.hidden = false;
      alertBox.textContent = 'Enter a name, valid email, and password of at least 6 characters.';
      return;
    }
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.details?.join(' ') || 'Unable to create account.');
      localStorage.setItem('loanPortalToken', result.token);
      localStorage.setItem('loanPortalLoggedIn', 'true');
      localStorage.setItem('loanPortalRole', result.user.role);
      localStorage.setItem('loanPortalUser', JSON.stringify(result.user));
      window.location.href = '/apply';
    } catch (error) {
      alertBox.hidden = false;
      alertBox.textContent = error.message;
    }
  });
});
