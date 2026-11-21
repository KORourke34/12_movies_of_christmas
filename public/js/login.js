api('/me')
  .then(() => (location.href = 'calendar.html'))
  .catch(() => {});

$('#lf').onsubmit = async (event) => {
  event.preventDefault();
  try {
    await api('/login', {
      method: 'POST',
      body: { username: $('#u').value, password: $('#p').value },
    });
    location.href = 'calendar.html';
  } catch (error) {
    $('#err').textContent = error.message;
  }
};
