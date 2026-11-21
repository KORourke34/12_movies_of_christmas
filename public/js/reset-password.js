const resetToken = new URLSearchParams(location.search).get('token') || '';

$('#reset-password-form').onsubmit = async (event) => {
  event.preventDefault();
  $('#reset-status').textContent = '';
  $('#reset-error').textContent = '';

  try {
    const result = await api('/password/reset', {
      method: 'POST',
      body: {
        token: resetToken,
        newPassword: $('#reset-new-password').value,
        confirmPassword: $('#reset-confirm-password').value,
      },
    });
    $('#reset-password-form').reset();
    $('#reset-status').textContent = result.message;
    setTimeout(() => {
      location.href = '/';
    }, 900);
  } catch (error) {
    $('#reset-error').textContent = error.message;
  }
};
