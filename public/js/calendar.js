// calendar.js – builds the 12 doors, handles locked/unlocked clicks and the controls.
(async function () {
  let me;
  try {
    me = await api('/me');
  } catch {
    return (location.href = '/');
  }

  $('#hello').textContent = 'Hi ' + me.name + '!';
  $('#profile-name').textContent = me.name;
  $('#profile-first-name').textContent = me.first_name || 'Not provided';
  $('#profile-last-name').textContent = me.last_name || 'Not provided';
  $('#profile-username').textContent = me.username;
  $('#profile-email').textContent = me.email || 'Not provided';

  const profileToggle = $('#profile-toggle');
  profileToggle.onclick = () => {
    const expanded = profileToggle.getAttribute('aria-expanded') === 'true';
    profileToggle.setAttribute('aria-expanded', String(!expanded));
    const label = expanded ? 'Show profile' : 'Hide profile';
    profileToggle.setAttribute('aria-label', label);
    profileToggle.title = label;
    $('.calendar-layout').classList.toggle('profile-hidden', expanded);
  };

  const avatars = [
    { id: 'santa', icon: '🎅', label: 'Santa' },
    { id: 'reindeer', icon: '🦌', label: 'Reindeer' },
    { id: 'snowman', icon: '⛄', label: 'Snowman' },
    { id: 'elf', icon: '🧝', label: 'Elf' },
    { id: 'penguin', icon: '🐧', label: 'Penguin' },
    { id: 'gingerbread', icon: '🍪', label: 'Gingerbread' },
    { id: 'tree', icon: '🎄', label: 'Christmas tree' },
    { id: 'present', icon: '🎁', label: 'Present' },
  ];
  const avatarFor = (id) => avatars.find((avatar) => avatar.id === id) || avatars[0];
  const renderAvatar = (id) => {
    const avatar = avatarFor(id);
    $('#profile-avatar').textContent = avatar.icon;
    $('#profile-avatar').setAttribute('aria-label', `${avatar.label} profile picture`);
    $('#profile-toggle-avatar').textContent = avatar.icon;
    $('#avatar-options').querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.avatar === avatar.id);
    });
  };
  const renderProgress = (progress) => {
    $('#watched-progress').value = progress.watchedPercentage;
    $('#watched-progress').setAttribute(
      'aria-valuenow',
      progress.watchedPercentage,
    );
    $('#progress-summary').textContent =
      `${progress.watchedCount} of ${progress.movieCount} movies watched`;
    $('#progress-percent').textContent = `${progress.watchedPercentage}% complete`;
  };

  $('#avatar-options').innerHTML = avatars
    .map(
      (avatar) => `<button class="avatar-option" type="button" data-avatar="${avatar.id}" aria-label="${avatar.label}" aria-pressed="false">${avatar.icon}</button>`,
    )
    .join('');
  renderAvatar(me.avatar);
  renderProgress(me);
  $('#avatar-options').onclick = async (event) => {
    const button = event.target.closest('.avatar-option');
    if (!button || button.dataset.avatar === me.avatar) return;

    button.disabled = true;
    $('#avatar-status').textContent = 'Saving picture…';
    try {
      const { avatar } = await api('/profile/avatar', {
        method: 'PUT',
        body: { avatar: button.dataset.avatar },
      });
      me.avatar = avatar;
      renderAvatar(avatar);
      $('#avatar-status').textContent = 'Picture saved.';
    } catch (error) {
      $('#avatar-status').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };

  const key = 'opened:' + me.name;
  const opened = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  const { today, doors, ...progress } = await api('/doors');
  renderProgress(progress);
  const icons = [
    '🎄',
    '🔔',
    '🎁',
    '⭐',
    '❄️',
    '🕯️',
    '🦌',
    '🍪',
    '🧦',
    '⛄',
    '🎅',
    '🌟',
  ]; // one decoration per door

  $('#grid').innerHTML = doors
    .map(
      (d) => `<div class="slot ${d.unlocked ? '' : 'locked'} ${opened.has(d.door) ? 'open' : ''}">
    <div class="inside"><span class="movie-title">${d.unlocked ? esc(d.title || '🎬') : '🔒'}</span></div>
    <button class="door" data-n="${d.door}" aria-label="Door ${d.door}, ${d.unlocked ? 'open' : 'locked'}">
      <i class="deco">${icons[d.door - 1]}</i><b>${d.door}</b></button></div>`,
    )
    .join('');

  const tonight = doors.find((d) => d.unlock_at === today && d.unlocked); // "Tonight's movie" banner
  if (tonight) {
    const b = $('#banner');
    b.hidden = false;
    b.innerHTML = `🍿 Tonight's movie: <b>${esc(tonight.title || 'a surprise')}</b> – door ${tonight.door}`;
  }

  let timer;
  function toast(d) {
    // "Not yet!" + live countdown
    const t = $('#toast');
    t.hidden = false;
    clearInterval(timer);

    const tick = () => {
      let s = Math.max(
        0,
        (new Date(d.unlock_at + 'T00:00:00') - new Date()) / 1000,
      );
      t.textContent = `Not yet! Opens in ${s / 86400 | 0}d ${s % 86400 / 3600 | 0}h ${s % 3600 / 60 | 0}m ${s % 60 | 0}s`;
    };

    tick();
    timer = setInterval(tick, 1000);
    setTimeout(() => {
      t.hidden = true;
      clearInterval(timer);
    }, 4000);
  }

  $('#grid').onclick = (e) => {
    const btn = e.target.closest('.door');
    if (!btn) {
      const slot = e.target.closest('.slot.open');
      if (slot) openModal(doors[slot.querySelector('.door').dataset.n - 1]);
      return;
    }

    const slot = btn.parentNode;
    const d = doors[btn.dataset.n - 1];
    if (!d.unlocked) {
      slot.classList.remove('shake');
      void slot.offsetWidth;
      slot.classList.add('shake');
      sfx.nope();
      return toast(d);
    }

    const first = !opened.has(d.door);
    slot.classList.add('open');
    if (first) {
      opened.add(d.door);
      localStorage.setItem(key, JSON.stringify([...opened]));
      sfx.open();
      confetti();
    }
    setTimeout(() => openModal(d), first && !reduced() ? 750 : 0);
  };

  let noticeTimer;
  const updateWatched = async (event) => {
    const checkbox = event.target.closest('.watched-toggle');
    if (!checkbox) return;

    const doorNumber = Number(checkbox.dataset.door);
    const door = doors.find((item) => item.door === doorNumber);
    if (!door) return;
    const controls = document.querySelectorAll(
      `.watched-toggle[data-door="${doorNumber}"]`,
    );
    const previousValue = door.watched;
    controls.forEach((control) => {
      control.disabled = true;
    });
    try {
      const result = await api(`/doors/${checkbox.dataset.door}/watched`, {
        method: 'PATCH',
        body: { watched: checkbox.checked },
      });
      door.watched = result.watched;
      controls.forEach((control) => {
        control.checked = result.watched;
      });
      renderProgress(result);
      $('#toast').hidden = false;
      $('#toast').textContent = result.watched
        ? 'Movie marked as watched!'
        : 'Movie removed from watched list.';
    } catch (error) {
      door.watched = previousValue;
      controls.forEach((control) => {
        control.checked = previousValue;
      });
      $('#toast').hidden = false;
      $('#toast').textContent = error.message;
    } finally {
      controls.forEach((control) => {
        control.disabled = false;
      });
    }
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      $('#toast').hidden = true;
    }, 3500);
  };
  $('#modal').onchange = updateWatched;

  // ----- controls (all remembered in localStorage) -----
  const flip = (id, k, fn) => {
    $(id).onclick = () => {
      prefs[k] = !prefs[k];
      savePrefs();
      fn && fn();
      show();
    };
  };

  const themes = [
    { id: 'midnight', label: 'Midnight' },
    { id: 'pine', label: 'Pine' },
    { id: 'cranberry', label: 'Cranberry' },
    { id: 'aurora', label: 'Aurora' },
    { id: 'plum', label: 'Plum' },
  ];

  const show = () => {
    $('#mute').textContent = prefs.muted ? '🔇' : '🔊';
    $('#mute').setAttribute('aria-pressed', !!prefs.muted);
    $('#music').setAttribute('aria-pressed', !!prefs.music);
    $('#music').classList.toggle('on', !!prefs.music);
    $('#calm').setAttribute('aria-pressed', reduced());
    $('#vol').value = vol();

    const theme =
      themes.find((option) => option.id === (prefs.theme || 'midnight')) ||
      themes[0];
    $('#theme').setAttribute(
      'aria-label',
      `Change background colour (currently ${theme.label})`,
    );
  };

  flip('#mute', 'muted', syncAudio);
  flip('#music', 'music', () =>
    prefs.music ? music.play().catch(() => {}) : music.pause(),
  );
  $('#calm').onclick = () => {
    prefs.calm = !reduced();
    savePrefs();
    applyPrefs();
    show();
  };
  $('#vol').oninput = (e) => {
    prefs.vol = +e.target.value;
    savePrefs();
    syncAudio();
  };
  $('#theme').onclick = () => {
    const current = themes.findIndex(
      (option) => option.id === (prefs.theme || 'midnight'),
    );
    prefs.theme = themes[(current + 1) % themes.length].id;
    savePrefs();
    applyPrefs();
    show();
  };

  const settings = $('#settings');
  const settingsToggle = $('#settings-toggle');
  const settingsPanel = $('#settings-panel');

  const closeSettings = () => {
    settingsPanel.hidden = true;
    settingsToggle.setAttribute('aria-expanded', 'false');
    settingsToggle.setAttribute('aria-label', 'Open settings');
  };

  settingsToggle.onclick = () => {
    settingsPanel.hidden = !settingsPanel.hidden;
    settingsToggle.setAttribute(
      'aria-expanded',
      String(!settingsPanel.hidden),
    );
    settingsToggle.setAttribute(
      'aria-label',
      settingsPanel.hidden ? 'Open settings' : 'Close settings',
    );
  };

  document.addEventListener('click', (e) => {
    if (!settings.contains(e.target)) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsPanel.hidden) {
      closeSettings();
      settingsToggle.focus();
    }
  });

  $('#out').onclick = async () => {
    await api('/logout', { method: 'POST' });
    location.href = '/';
  };

  show();
})();
