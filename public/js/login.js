api('/me')
  .then(() => (location.href = 'calendar.html'))
  .catch(() => {});

$('#lf').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const login = await api('/login', {
      method: 'POST',
      body: { username: $('#u').value, password: $('#p').value },
    });
    location.href = login.mustChange ? 'password.html' : 'calendar.html';
  } catch (error) {
    $('#err').textContent = error.message;
  }
};
