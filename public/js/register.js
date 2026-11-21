api('/me')
  .then(() => (location.href = 'calendar.html'))
  .catch(() => {});

$('#rf').onsubmit = async (event) => {
  event.preventDefault();
  if ($('#p').value !== $('#confirm-password').value) {
    $('#err').textContent = 'Passwords do not match';
    $('#confirm-password').focus();
    return;
  }

  try {
    await api('/register', {
      method: 'POST',
      body: {
        firstName: $('#first').value,
        lastName: $('#last').value,
        email: $('#email').value,
        username: $('#u').value,
        password: $('#p').value,
      },
    });
    location.href = 'calendar.html';
  } catch (error) {
    $('#err').textContent = error.message;
  }
};
