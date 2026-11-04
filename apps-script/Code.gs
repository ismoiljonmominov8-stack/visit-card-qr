/**
 * Visit card backend. Paste into Extensions > Apps Script of your Google Sheet.
 * Everyone can read one card by its ID. Only ADMIN_EMAIL can create or change cards.
 */

const ADMIN_EMAIL = 'PASTE_YOUR_BUSINESS_GMAIL_HERE';
const GOOGLE_CLIENT_ID = 'PASTE_YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';

const SHEET_NAME = 'Cards';
const HEADERS = ['id', 'fullName', 'phone', 'telegram', 'instagram', 'photo', 'createdAt', 'updatedAt'];
const CACHE_SECONDS = 3600;
const MAX_PHOTO_CHARS = 48000; // A Sheets cell holds 50,000 characters.
const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const ID_LENGTH = 6;

/** Run this once from the Apps Script editor. It prepares the Sheet. */
function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open Apps Script from inside your Google Sheet.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());

  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setNumberFormat('@').setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function doGet(e) {
  return respond_(function () {
    const params = (e && e.parameter) || {};
    if (params.action === 'ping') return { status: 'running' };
    if (params.action === 'card') return { card: getPublicCard_(params.id) };
    throw apiError_('bad_request', 'Unknown action.');
  });
}

function doPost(e) {
  return respond_(function () {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      throw apiError_('bad_request', 'The request is not valid JSON.');
    }

    const email = verifyAdmin_(body.idToken);
    if (body.action === 'whoami') return { email: email };
    if (body.action === 'list') return { cards: listCards_() };
    if (body.action === 'save') return { card: saveCard_(body.card) };
    throw apiError_('bad_request', 'Unknown action.');
  });
}

function respond_(handler) {
  let payload;
  try {
    payload = Object.assign({ ok: true }, handler());
  } catch (err) {
    if (!err.code) console.error(err);
    payload = { ok: false, code: err.code || 'server_error', error: err.code ? err.message : 'Something went wrong on the server.' };
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function apiError_(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function verifyAdmin_(idToken) {
  if (!idToken || typeof idToken !== 'string') throw apiError_('unauthorized', 'Sign in again.');

  const response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) throw apiError_('unauthorized', 'Your sign-in expired. Sign in again.');

  const info = JSON.parse(response.getContentText());
  const issuerOk = info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com';
  const verified = info.email_verified === 'true' || info.email_verified === true;
  if (!issuerOk || info.aud !== GOOGLE_CLIENT_ID || !verified) {
    throw apiError_('unauthorized', 'This sign-in could not be verified.');
  }

  const email = String(info.email || '').toLowerCase();
  if (email !== ADMIN_EMAIL.toLowerCase()) {
    throw apiError_('forbidden', 'This Google account is not allowed to manage cards.');
  }
  return email;
}

function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw apiError_('not_set_up', 'Run setup() in Apps Script first.');
  const sheet = SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
  if (!sheet) throw apiError_('not_set_up', 'Run setup() in Apps Script first.');
  return sheet;
}

function readRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function rowToCard_(row) {
  const card = {};
  HEADERS.forEach(function (header, index) {
    card[header] = String(row[index] === null || row[index] === undefined ? '' : row[index]);
  });
  return card;
}

function findRowNumber_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

function getPublicCard_(rawId) {
  const id = cleanId_(rawId);
  const cache = CacheService.getScriptCache();
  const cached = cache.get('card:' + id);
  if (cached) return JSON.parse(cached);

  const sheet = getSheet_();
  const rowNumber = findRowNumber_(sheet, id);
  if (!rowNumber) throw apiError_('not_found', 'This card does not exist.');

  const card = rowToCard_(sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0]);
  const publicCard = {
    id: card.id,
    fullName: card.fullName,
    phone: card.phone,
    telegram: card.telegram,
    instagram: card.instagram,
    photo: card.photo
  };
  cache.put('card:' + id, JSON.stringify(publicCard), CACHE_SECONDS);
  return publicCard;
}

function listCards_() {
  return readRows_(getSheet_())
    .map(rowToCard_)
    .map(function (card) {
      delete card.photo;
      return card;
    })
    .sort(function (a, b) {
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

function saveCard_(input) {
  const card = validateCard_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sheet = getSheet_();
    const now = new Date().toISOString();
    let rowNumber;
    let createdAt = now;

    if (card.id) {
      rowNumber = findRowNumber_(sheet, card.id);
      if (!rowNumber) throw apiError_('not_found', 'This card no longer exists.');
      createdAt = String(sheet.getRange(rowNumber, HEADERS.indexOf('createdAt') + 1).getValue());
    } else {
      card.id = newId_(sheet);
      rowNumber = sheet.getLastRow() + 1;
      if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    }

    const row = [card.id, card.fullName, card.phone, card.telegram, card.instagram, card.photo, createdAt, now];
    sheet.getRange(rowNumber, 1, 1, HEADERS.length).setNumberFormat('@').setValues([row]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove('card:' + card.id);
    return rowToCard_(row);
  } finally {
    lock.releaseLock();
  }
}

function validateCard_(input) {
  if (!input || typeof input !== 'object') throw apiError_('invalid', 'The card is empty.');

  const card = {
    id: input.id ? cleanId_(input.id) : '',
    fullName: cleanName_(input.fullName),
    phone: cleanPhone_(input.phone),
    telegram: cleanHandle_(input.telegram, /^[A-Za-z][A-Za-z0-9_]{3,31}$/, 'Telegram username'),
    instagram: cleanHandle_(input.instagram, /^[A-Za-z0-9._]{1,30}$/, 'Instagram username'),
    photo: String(input.photo || '')
  };

  if (!card.fullName) throw apiError_('invalid', 'Enter a full name.');
  if (!card.phone && !card.telegram && !card.instagram) {
    throw apiError_('invalid', 'Add a phone number, Telegram, or Instagram.');
  }
  if (card.photo && (card.photo.length > MAX_PHOTO_CHARS || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(card.photo))) {
    throw apiError_('invalid', 'The photo could not be saved. Choose another one.');
  }
  return card;
}

function cleanId_(value) {
  const id = String(value || '').toLowerCase();
  if (!/^[2-9a-hjkmnp-z]{6}$/.test(id)) throw apiError_('not_found', 'This card does not exist.');
  return id;
}

function cleanName_(value) {
  // A leading =, +, -, or @ could otherwise be treated as a spreadsheet formula.
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@\s]+/, '').slice(0, 80);
}

function cleanPhone_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const phone = (raw.charAt(0) === '+' ? '+' : '') + raw.replace(/\D/g, '');
  if (!/^\+?\d{7,15}$/.test(phone)) throw apiError_('invalid', 'Check the phone number.');
  return phone;
}

function cleanHandle_(value, pattern, label) {
  const handle = String(value || '').trim();
  if (!handle) return '';
  if (!pattern.test(handle)) throw apiError_('invalid', 'Check the ' + label + '.');
  return handle;
}

function newId_(sheet) {
  const taken = {};
  readRows_(sheet).forEach(function (row) {
    taken[String(row[0])] = true;
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
    let id = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      id += ID_ALPHABET.charAt((bytes[i] & 255) % ID_ALPHABET.length);
    }
    if (!taken[id]) return id;
  }
  throw new Error('Could not create a unique card ID.');
}
