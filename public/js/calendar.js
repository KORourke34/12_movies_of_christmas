// calendar.js – builds the welcome and movie doors, and handles their controls.
(async function () {
  let me;
  try {
    me = await api('/me');
  } catch {
    return (location.href = '/');
  }
  if (me.mustChange) return (location.href = 'password.html');

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

  const key = 'opened:' + me.username;
  const storedOpened = readStored(key, []);
  const opened = new Set(Array.isArray(storedOpened) ? storedOpened : []);
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
  const welcomeDoor = { door: 'welcome', unlocked: true, isWelcome: true };

  $('#grid').innerHTML = [welcomeDoor, ...doors]
    .map(
      (d) => `<div class="slot ${d.isWelcome ? 'welcome-slot' : ''} ${d.unlocked ? '' : 'locked'} ${d.vote_open ? 'vote-slot' : ''} ${opened.has(d.door) ? 'open' : ''}">
    <div class="inside"><span class="movie-title">${d.isWelcome ? '' : d.unlocked ? esc(d.title || '🎬') : d.vote_open ? '🗳️ Vote now!' : ''}</span>${d.unlocked && d.poster ? `<img class="inside-poster" src="${esc(d.poster)}" alt="Poster for ${esc(d.title || 'movie')}">` : ''}</div>
    <button class="door" data-n="${d.door}" aria-label="${d.isWelcome ? 'Open the welcome guide' : `Door ${d.door}, ${d.vote_open ? 'vote now' : d.unlocked ? 'open' : 'locked'}`}">
      <i class="deco">${d.isWelcome ? '🎁' : d.vote_open ? '🗳️' : icons[d.door - 1]}</i><b>${d.isWelcome ? '★' : d.door}</b>${d.isWelcome ? '<span class="welcome-door-label">Welcome!</span>' : ''}</button></div>`,
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
      if (slot) {
        const doorButton = slot.querySelector('.door');
        if (doorButton.dataset.n === 'welcome') {
          activeDoor = null;
          openModal({ isWelcome: true, title: 'Welcome!' });
        } else {
          const door = doors.find((item) => item.door === Number(doorButton.dataset.n));
          if (door) openDoorModal(door);
        }
      }
      return;
    }

    const slot = btn.parentNode;
    if (btn.dataset.n === 'welcome') {
      const first = !opened.has('welcome');
      slot.classList.add('open');
      if (first) {
        opened.add('welcome');
        localStorage.setItem(key, JSON.stringify([...opened]));
        sfx.open();
        confetti();
      }
      activeDoor = null;
      setTimeout(() => openModal({ isWelcome: true, title: 'Welcome!' }), first && !reduced() ? 750 : 0);
      return;
    }

    const d = doors.find((item) => item.door === Number(btn.dataset.n));
    if (!d) return;
    if (d.vote_open) {
      openDoorModal(d);
      return;
    }
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
    setTimeout(() => openDoorModal(d), first && !reduced() ? 750 : 0);
  };

  let activeDoor;
  const openDoorModal = (door) => {
    activeDoor = door;
    openModal(door);
    if (door.unlocked && door.title) loadCommunity(door);
  };

  const renderCommunity = (community) => {
    const root = $('#mbody .movie-community');
    if (!root) return;
    root.querySelectorAll('input[name="rating"]').forEach((input) => {
      input.checked = Number(input.value) === Number(community.rating);
    });
    setRatingStars(root.querySelector('.rating-stars'), community.rating);
    root.querySelector('.rating-summary').textContent =
      community.ratingCount
        ? `Friends' average: ${community.ratingAverage}/5 (${community.ratingCount} rating${community.ratingCount === 1 ? '' : 's'})`
        : 'No ratings yet.';
    root.querySelector('.reaction-list').innerHTML = community.reactions
      .map(
        (reaction) => `<button type="button" class="reaction-button ${reaction.reacted ? 'selected' : ''}" data-emoji="${reaction.emoji}" aria-pressed="${reaction.reacted}">${reaction.emoji} <span>${reaction.count}</span></button>`,
      )
      .join('');
    root.querySelector('.comment-list').innerHTML = community.comments
      .map((comment) => {
        const time = new Date(`${comment.created_at.replace(' ', 'T')}Z`);
        const timeText = Number.isNaN(time.valueOf())
          ? comment.created_at
          : time.toLocaleString();
        const canDelete = community.admin || comment.username === me.username;
        return `<li class="comment-item"><div><b>${esc(comment.author)}</b> <time>${esc(timeText)}</time></div><p>${esc(comment.comment)}</p>${canDelete ? `<button type="button" class="comment-delete" data-comment="${comment.id}">Delete</button>` : ''}</li>`;
      })
      .join('');
  };

  const setRatingStars = (stars, value) => {
    if (!stars) return;
    const rating = Number(value) || 0;
    stars.dataset.rating = String(rating);
    stars.querySelectorAll('.rating-star').forEach((star, index) => {
      const fill = Math.max(0, Math.min(1, rating - index)) * 100;
      star.querySelector('.rating-star-icon').style.setProperty('--star-fill', `${fill}%`);
    });
  };

  const loadCommunity = async (door) => {
    try {
      const community = await api(`/doors/${door.door}/community`);
      if (activeDoor?.door === door.door && !$('#modal').hidden) {
        renderCommunity(community);
      }
    } catch (error) {
      if (activeDoor?.door === door.door) {
        const status = $('#mbody .comment-status');
        if (status) status.textContent = error.message;
      }
    }
  };

  const showActionMessage = (selector, message) => {
    const status = $(selector);
    if (status) status.textContent = message;
  };

  $('#modal').addEventListener('change', async (event) => {
    const input = event.target;
    if (input.matches('.watched-toggle')) return updateWatched(event);
    if (input.name !== 'rating' || !activeDoor) return;
    const stars = input.closest('.rating-stars');
    setRatingStars(stars, Number(input.value));
    try {
      const result = await api(`/doors/${activeDoor.door}/rating`, {
        method: 'PUT',
        body: { stars: Number(input.value) },
      });
      showActionMessage(
        '.rating-summary',
        `Friends' average: ${result.average}/5 (${result.count} rating${result.count === 1 ? '' : 's'})`,
      );
    } catch (error) {
      if (activeDoor) loadCommunity(activeDoor);
      showActionMessage('.rating-summary', error.message);
    }
  });

  $('#modal').addEventListener('pointerover', (event) => {
    const option = event.target.closest('.rating-half');
    if (option) setRatingStars(option.closest('.rating-stars'), Number(option.querySelector('input').value));
  });

  $('#modal').addEventListener('pointerout', (event) => {
    const stars = event.target.closest('.rating-stars');
    if (stars && !stars.contains(event.relatedTarget)) {
      setRatingStars(stars, Number(stars.dataset.rating));
    }
  });

  $('#modal').addEventListener('focusin', (event) => {
    const input = event.target.closest('input[name="rating"]');
    if (input) setRatingStars(input.closest('.rating-stars'), Number(input.value));
  });

  $('#modal').addEventListener('focusout', (event) => {
    const stars = event.target.closest('.rating-stars');
    if (stars && !stars.contains(event.relatedTarget)) {
      setRatingStars(stars, Number(stars.dataset.rating));
    }
  });

  $('#modal').addEventListener('click', async (event) => {
    const reaction = event.target.closest('.reaction-button');
    if (reaction && activeDoor) {
      reaction.disabled = true;
      try {
        const result = await api(`/doors/${activeDoor.door}/reactions`, {
          method: 'POST',
          body: { emoji: reaction.dataset.emoji },
        });
        const community = await api(`/doors/${activeDoor.door}/community`);
        renderCommunity({ ...community, reactions: result.reactions });
      } catch (error) {
        showActionMessage('.comment-status', error.message);
      }
      return;
    }

    const remove = event.target.closest('.comment-delete');
    if (remove && activeDoor) {
      remove.disabled = true;
      try {
        await api(
          `/doors/${activeDoor.door}/comments/${remove.dataset.comment}`,
          { method: 'DELETE' },
        );
        await loadCommunity(activeDoor);
      } catch (error) {
        remove.disabled = false;
        showActionMessage('.comment-status', error.message);
      }
    }
  });

  $('#modal').addEventListener('submit', async (event) => {
    const voteForm = event.target.closest('#vote-form');
    const commentForm = event.target.closest('.comment-form');
    if (!voteForm && !commentForm) return;
    event.preventDefault();

    if (voteForm) {
      const candidate = new FormData(voteForm).get('candidate');
      const status = voteForm.querySelector('.vote-status');
      if (candidate === null) {
        status.textContent = 'Choose a movie first.';
        return;
      }
      const button = voteForm.querySelector('button');
      button.disabled = true;
      try {
        await api(`/doors/${activeDoor.door}/vote`, {
          method: 'POST',
          body: { candidate: Number(candidate) },
        });
        activeDoor.user_vote = Number(candidate);
        status.textContent = 'Your vote is saved. You can change it until the door opens.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    }

    if (commentForm) {
      const field = commentForm.elements.comment;
      const button = commentForm.querySelector('button');
      button.disabled = true;
      try {
        await api(`/doors/${activeDoor.door}/comments`, {
          method: 'POST',
          body: { comment: field.value },
        });
        field.value = '';
        showActionMessage('.comment-status', 'Comment posted.');
        await loadCommunity(activeDoor);
      } catch (error) {
        showActionMessage('.comment-status', error.message);
      } finally {
        button.disabled = false;
      }
    }
  });

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
