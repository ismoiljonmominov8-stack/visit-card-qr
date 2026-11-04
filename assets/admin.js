(function () {
  'use strict';

  var MAX_PHOTO_CHARS = 45000;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    idToken: '',
    cardId: '',
    photo: '',
    cards: [],
    savedCard: null,
    retry: null
  };

  function showGate(message) {
    $('studio').hidden = true;
    $('gate').hidden = false;
    $('gateMessage').textContent = message || '';
  }

  function showView(name) {
    $('gate').hidden = true;
    $('studio').hidden = false;
    $('editor').hidden = name !== 'editor';
    $('result').hidden = name !== 'result';
    $('cards').hidden = name !== 'cards';
    window.scrollTo(0, 0);
  }

  /* Sign-in */

  window.vcGoogleReady = function () {
    if (!VC.config.GOOGLE_CLIENT_ID || !VC.config.API_URL) {
      $('gateText').textContent = 'Setup is not finished. Add the API URL and Google client ID to config.js.';
      return;
    }
    google.accounts.id.initialize({
      client_id: VC.config.GOOGLE_CLIENT_ID,
      callback: onCredential,
      auto_select: true
    });
    google.accounts.id.renderButton($('googleButton'), { theme: 'outline', size: 'large', text: 'signin_with' });
    google.accounts.id.prompt();
  };

  async function onCredential(response) {
    state.idToken = response.credential;
    $('gateMessage').textContent = '';

    try {
      await VC.apiPost({ action: 'whoami', idToken: state.idToken });
    } catch (err) {
      state.idToken = '';
      showGate(err.message);
      return;
    }

    var retry = state.retry;
    state.retry = null;
    if (retry) {
      $('gate').hidden = true;
      $('studio').hidden = false;
      retry();
    } else {
      startNewCard();
    }
  }

  function signOut() {
    state.idToken = '';
    if (window.google) google.accounts.id.disableAutoSelect();
    showGate('');
  }

  // A Google sign-in lasts about an hour. The typed card stays in the form while signing in again.
  function isExpired(err, retry) {
    if (err.code !== 'unauthorized') return false;
    state.idToken = '';
    state.retry = retry;
    showGate('Your sign-in expired. Sign in again to continue.');
    return true;
  }

  /* Photo */

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      image.src = url;
    });
  }

  function encodeSquare(image, size, quality) {
    var side = Math.min(image.naturalWidth, image.naturalHeight);
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    );
    return canvas.toDataURL('image/jpeg', quality);
  }

  function compressPhoto(image) {
    var sizes = [240, 200, 160];
    var qualities = [0.82, 0.68, 0.52, 0.4];
    for (var s = 0; s < sizes.length; s++) {
      for (var q = 0; q < qualities.length; q++) {
        var data = encodeSquare(image, sizes[s], qualities[q]);
        if (data.length <= MAX_PHOTO_CHARS) return data;
      }
    }
    throw new Error('too_large');
  }

  function renderPhoto() {
    var preview = $('photoPreview');
    preview.replaceChildren();
    if (state.photo) {
      var image = document.createElement('img');
      image.src = state.photo;
      image.alt = 'Profile picture';
      preview.appendChild(image);
    } else {
      preview.textContent = 'Add profile picture';
    }
  }

  async function onPhotoChosen(event) {
    var file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    $('formMessage').textContent = '';

    try {
      state.photo = compressPhoto(await loadImage(file));
      renderPhoto();
      $('photoHint').textContent = 'Tap the circle to change the photo';
    } catch (err) {
      $('formMessage').textContent = 'This photo could not be opened. Choose a JPG or PNG file.';
    }
  }

  /* Editor */

  function fillForm(card) {
    state.cardId = card.id || '';
    state.photo = card.photo || '';
    $('fullName').value = card.fullName || '';
    $('phone').value = card.phone || '';
    $('instagram').value = card.instagram ? 'https://instagram.com/' + card.instagram : '';
    $('telegram').value = card.telegram ? 'https://t.me/' + card.telegram : '';
    $('formMessage').textContent = '';
    $('editorTitle').textContent = card.id ? 'Edit card' : 'New visit card';
    $('saveButton').textContent = card.id ? 'Save changes' : 'Create QR code';
    $('photoHint').textContent = 'Tap the circle to ' + (state.photo ? 'change the photo' : 'choose a photo');
    renderPhoto();
  }

  function startNewCard() {
    fillForm({});
    showView('editor');
  }

  function readForm() {
    return {
      id: state.cardId,
      fullName: $('fullName').value.trim(),
      phone: VC.normalizePhone($('phone').value),
      instagram: VC.normalizeInstagram($('instagram').value),
      telegram: VC.normalizeTelegram($('telegram').value),
      photo: state.photo
    };
  }

  function validate(card) {
    if (!card.fullName) return 'Enter the full name.';
    if (!card.phone && !card.telegram && !card.instagram) return 'Add a phone number, Instagram, or Telegram.';
    if (card.phone && !/^\+?\d{7,15}$/.test(card.phone)) return 'Check the phone number.';
    if (card.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(card.instagram)) return 'Check the Instagram link.';
    if (card.telegram && !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(card.telegram)) return 'Check the Telegram link.';
    return '';
  }

  async function saveCard() {
    var card = readForm();
    var problem = validate(card);
    $('formMessage').textContent = problem;
    if (problem) return;

    var button = $('saveButton');
    var label = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving...';

    try {
      var data = await VC.apiPost({ action: 'save', idToken: state.idToken, card: card });
      state.cardId = data.card.id;
      showResult(data.card);
    } catch (err) {
      if (!isExpired(err, saveCard)) {
        $('formMessage').textContent = err.code ? err.message : 'The card was not saved. Check the internet connection and try again.';
      }
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  /* QR code */

  function buildQr(text) {
    var qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    return qr;
  }

  function qrToSvg(qr) {
    var count = qr.getModuleCount();
    var quiet = 4;
    var total = count + quiet * 2;
    var path = '';
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        if (qr.isDark(row, col)) path += 'M' + (col + quiet) + ' ' + (row + quiet) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + total + '" height="' + total + '" fill="#fff"/><path fill="#000" d="' + path + '"/></svg>';
  }

  function qrToPngBlob(qr) {
    var count = qr.getModuleCount();
    var quiet = 4;
    var scale = Math.floor(2048 / (count + quiet * 2));
    var size = scale * (count + quiet * 2);
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#000';
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        if (qr.isDark(row, col)) context.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
      }
    }
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function fileStem(card) {
    var name = card.fullName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return 'qr-' + (name ? name + '-' : '') + card.id;
  }

  function showResult(card) {
    state.savedCard = card;
    var url = VC.cardUrl(card.id);
    var qr = buildQr(url);
    state.qr = qr;
    state.svg = qrToSvg(qr);

    $('resultName').textContent = card.fullName;
    $('qrBox').innerHTML = state.svg;
    $('cardLink').href = url;
    $('cardLink').textContent = url;
    $('copyLink').textContent = 'Copy link';
    $('domainWarning').hidden = !/\.github\.io$/i.test(new URL(url).hostname);
    showView('result');
  }

  /* Saved cards */

  function renderList() {
    var query = $('search').value.trim().toLowerCase();
    var cards = state.cards.filter(function (card) {
      return [card.fullName, card.phone, card.telegram, card.instagram].join(' ').toLowerCase().indexOf(query) !== -1;
    });

    var list = $('cardList');
    list.replaceChildren();
    cards.forEach(function (card) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      var name = document.createElement('strong');
      name.textContent = card.fullName;
      var detail = document.createElement('small');
      detail.textContent = [VC.formatPhone(card.phone), card.telegram && '@' + card.telegram].filter(Boolean).join(', ') || card.id;
      button.append(name, detail);
      button.addEventListener('click', function () { openSavedCard(card); });
      item.appendChild(button);
      list.appendChild(item);
    });

    $('listStatus').textContent = state.cards.length === 0
      ? 'No cards yet. Create the first one with New card.'
      : cards.length === 0 ? 'No card matches this search.' : '';
  }

  async function showCards() {
    showView('cards');
    $('cardList').replaceChildren();
    $('listStatus').textContent = 'Loading cards...';

    try {
      var data = await VC.apiPost({ action: 'list', idToken: state.idToken });
      state.cards = data.cards;
      renderList();
    } catch (err) {
      if (!isExpired(err, showCards)) $('listStatus').textContent = err.message;
    }
  }

  async function openSavedCard(card) {
    $('listStatus').textContent = 'Opening ' + card.fullName + '...';
    try {
      var data = await VC.apiGet({ action: 'card', id: card.id });
      showResult(data.card);
    } catch (err) {
      $('listStatus').textContent = err.message;
    }
  }

  /* Events */

  $('editor').addEventListener('submit', function (event) {
    event.preventDefault();
    saveCard();
  });
  $('photoInput').addEventListener('change', onPhotoChosen);
  $('navNew').addEventListener('click', startNewCard);
  $('navCards').addEventListener('click', showCards);
  $('navSignOut').addEventListener('click', signOut);
  $('search').addEventListener('input', renderList);
  $('editCard').addEventListener('click', function () {
    fillForm(state.savedCard);
    showView('editor');
  });
  $('downloadSvg').addEventListener('click', function () {
    downloadBlob(new Blob([state.svg], { type: 'image/svg+xml' }), fileStem(state.savedCard) + '.svg');
  });
  $('downloadPng').addEventListener('click', async function () {
    downloadBlob(await qrToPngBlob(state.qr), fileStem(state.savedCard) + '.png');
  });
  $('copyLink').addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText($('cardLink').href);
      $('copyLink').textContent = 'Link copied';
    } catch (err) {
      $('copyLink').textContent = 'Copy the link above';
    }
  });

  if (!VC.config.GOOGLE_CLIENT_ID || !VC.config.API_URL) {
    $('gateText').textContent = 'Setup is not finished. Add the API URL and Google client ID to config.js.';
  }
})();
