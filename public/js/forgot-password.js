$('#forgot-password-form').onsubmit = async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  $('#forgot-status').textContent = '';
  $('#forgot-error').textContent = '';
  submit.disabled = true;

  try {
    const result = await api('/password/forgot', {
      method: 'POST',
      body: { email: $('#forgot-email').value },
    });
    $('#forgot-status').textContent = result.message;
  } catch (error) {
    $('#forgot-error').textContent = error.message;
  } finally {
    submit.disabled = false;
  }
};
