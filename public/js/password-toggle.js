// Adds accessible show/hide controls to password fields on any page.
let passwordToggleId = 0;
const visiblePasswordIcon = `
  <svg class="password-eye" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>`;
const hiddenPasswordIcon = `
  <svg class="password-eye" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 3l18 18M10.6 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.4 0 2.7-.3 3.8-.8"></path>
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
  </svg>`;

const setPasswordVisible = (input, button, visible) => {
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  button.setAttribute('aria-pressed', String(visible));
  button.innerHTML = visible ? hiddenPasswordIcon : visiblePasswordIcon;
};

const setupPasswordToggles = (root = document) => {
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('.password-control')) return;

    const control = document.createElement('span');
    control.className = 'password-control';
    const label = input.closest('label');
    if (label) {
      if (!input.id) input.id = `password-toggle-input-${++passwordToggleId}`;
      label.htmlFor = input.id;
      label.insertAdjacentElement('afterend', control);
    } else {
      input.parentNode.insertBefore(control, input);
    }
    control.append(input);

    const button = document.createElement('button');
    button.className = 'password-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = visiblePasswordIcon;
    control.append(button);

    button.addEventListener('click', () => {
      const visible = input.type === 'password';
      setPasswordVisible(input, button, visible);
      button.focus();
    });
  });
};

const hideFormPasswords = (form) => {
  form.querySelectorAll('.password-toggle[aria-pressed="true"]').forEach((button) => {
    const input = button.parentElement.querySelector('input');
    setPasswordVisible(input, button, false);
  });
};

// Keep every password hidden whenever its form is submitted, including failures.
document.addEventListener('submit', (event) => {
  hideFormPasswords(event.target);
}, true);

// Native constraint validation prevents the submit event, so hide passwords here too.
document.addEventListener('invalid', (event) => {
  if (event.target.form) hideFormPasswords(event.target.form);
}, true);

setupPasswordToggles();
