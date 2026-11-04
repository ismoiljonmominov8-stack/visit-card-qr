(function () {
  'use strict';

  var config = window.VC_CONFIG || {};

  var icons = {
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.6.2 1.8-.8l3.2-15.3c.4-1.3-.5-1.9-1.7-1.4zM8.2 13.2l10.5-6.6c.5-.3 1-.1.6.2l-8.7 7.9-.3 3.6-2.1-5.1z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M7.5 2.8h9a4.7 4.7 0 0 1 4.7 4.7v9a4.7 4.7 0 0 1-4.7 4.7h-9a4.7 4.7 0 0 1-4.7-4.7v-9a4.7 4.7 0 0 1 4.7-4.7z"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .6 3.6 1 1 0 0 1-.3 1z"/></svg>'
  };

  function normalizeHandle(value, hosts) {
    var text = String(value || '').trim();
    if (!text) return '';
    var match = text.match(new RegExp('^(?:https?://)?(?:www\\.)?(?:' + hosts + ')/([^/?#]+)', 'i'));
    if (match) text = match[1];
    return text.replace(/^@/, '').replace(/\/$/, '');
  }

  function normalizeTelegram(value) {
    return normalizeHandle(value, 't\\.me|telegram\\.me');
  }

  function normalizeInstagram(value) {
    return normalizeHandle(value, 'instagram\\.com|instagr\\.am');
  }

  function normalizePhone(value) {
    var text = String(value || '').trim();
    if (!text) return '';
    return (text.charAt(0) === '+' ? '+' : '') + text.replace(/\D/g, '');
  }

  function formatPhone(phone) {
    var match = String(phone || '').match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
    return match ? '+998 ' + match[1] + ' ' + match[2] + ' ' + match[3] + ' ' + match[4] : phone;
  }

  function validPhoto(photo) {
    return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo || '');
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('');
  }

  function publicBaseUrl() {
    var base = String(config.PUBLIC_BASE_URL || '').trim();
    if (!base) base = location.origin + location.pathname.replace(/admin\/?(index\.html)?$/, '');
    return base.replace(/\/+$/, '');
  }

  function cardUrl(id) {
    return publicBaseUrl() + '/?c=' + encodeURIComponent(id);
  }

  function apiError(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function fetchWithTimeout(url, options, ms) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms);
    return fetch(url, Object.assign({}, options, { signal: controller.signal, redirect: 'follow' }))
      .finally(function () { clearTimeout(timer); });
  }

  async function readResponse(response) {
    var data;
    try {
      data = await response.json();
    } catch (err) {
      throw apiError('network', 'The server sent an unreadable reply.');
    }
    if (!data.ok) throw apiError(data.code || 'server_error', data.error || 'The request failed.');
    return data;
  }

  async function apiGet(params) {
    var query = new URLSearchParams(params).toString();
    var response = await fetchWithTimeout(config.API_URL + '?' + query, {}, 20000);
    return readResponse(response);
  }

  // text/plain keeps this a simple request, which Apps Script can accept from another site.
  async function apiPost(body) {
    var response = await fetchWithTimeout(config.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }, 40000);
    return readResponse(response);
  }

  window.VC = {
    config: config,
    icons: icons,
    normalizeTelegram: normalizeTelegram,
    normalizeInstagram: normalizeInstagram,
    normalizePhone: normalizePhone,
    formatPhone: formatPhone,
    validPhoto: validPhoto,
    initials: initials,
    publicBaseUrl: publicBaseUrl,
    cardUrl: cardUrl,
    apiGet: apiGet,
    apiPost: apiPost
  };
})();
