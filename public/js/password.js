api('/password/status')
  .then((status) => {
    if (status.mustChange) {
      $('#welcome').textContent = 'You must choose a new password before opening the calendar.';
    }
  })
  .catch(() => {
    location.href = '/';
  });

$('#password-form').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  $('#password-status').textContent = '';
  $('#password-error').textContent = '';

  submit.disabled = true;
  try {
    await api('/password/change', {
      method: 'POST',
      body: {
        currentPassword: $('#current-password').value,
        newPassword: $('#new-password').value,
        confirmPassword: $('#confirm-password').value,
      },
    });
    form.reset();
    $('#password-status').textContent = 'Password changed. Redirecting to the calendar…';
    setTimeout(() => {
      location.href = 'calendar.html';
    }, 700);
  } catch (error) {
    $('#password-error').textContent = error.message;
  } finally {
    submit.disabled = false;
  }
};
