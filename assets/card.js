(function () {
  'use strict';

  var strings = {
    uz: {
      call: "Qo'ng'iroq qilish",
      save: 'Kontaktni saqlash',
      notFoundTitle: 'Vizitka topilmadi',
      notFoundText: "Havola noto'g'ri yoki vizitka o'chirilgan.",
      errorTitle: 'Vizitka ochilmadi',
      errorText: "Internetni tekshiring va qayta urinib ko'ring.",
      retry: "Qayta urinish"
    },
    ru: {
      call: 'Позвонить',
      save: 'Сохранить контакт',
      notFoundTitle: 'Визитка не найдена',
      notFoundText: 'Ссылка неверна или визитка удалена.',
      errorTitle: 'Не удалось открыть визитку',
      errorText: 'Проверьте интернет и попробуйте снова.',
      retry: 'Повторить'
    },
    en: {
      call: 'Call',
      save: 'Save contact',
      notFoundTitle: 'Card not found',
      notFoundText: 'The link is wrong or this card was removed.',
      errorTitle: 'The card did not open',
      errorText: 'Check your internet connection and try again.',
      retry: 'Try again'
    }
  };

  var lang = String(navigator.language || 'uz').slice(0, 2).toLowerCase();
  if (!strings[lang]) lang = 'uz';
  var t = strings[lang];
  document.documentElement.lang = lang;

  var root = document.getElementById('root');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showNotice(title, text, onRetry) {
    var box = el('div', 'notice');
    box.appendChild(el('h1', '', title));
    box.appendChild(el('p', '', text));
    if (onRetry) {
      var button = el('button', 'btn', t.retry);
      button.type = 'button';
      button.addEventListener('click', onRetry);
      box.appendChild(button);
    }
    root.replaceChildren(box);
  }

  function contactLink(href, icon, title, detail) {
    var link = el('a', 'contact');
    link.href = href;
    var iconBox = el('span', 'icon');
    iconBox.innerHTML = VC.icons[icon];
    var text = el('span');
    text.appendChild(el('strong', '', title));
    text.appendChild(el('small', '', detail));
    link.appendChild(iconBox);
    link.appendChild(text);
    return link;
  }

  function vcardEscape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function foldLine(line) {
    var parts = [];
    for (var i = 0; i < line.length; i += 74) parts.push(line.slice(i, i + 74));
    return parts.join('\r\n ');
  }

  function buildVcard(card) {
    var name = vcardEscape(card.fullName);
    var lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:;' + name + ';;;', 'FN:' + name];
    if (card.phone) lines.push('TEL;TYPE=CELL:' + card.phone);
    if (card.telegram) lines.push('URL:https://t.me/' + card.telegram);
    if (card.instagram) lines.push('URL:https://www.instagram.com/' + card.instagram + '/');
    if (VC.validPhoto(card.photo)) {
      lines.push(foldLine('PHOTO;ENCODING=b;TYPE=JPEG:' + card.photo.split(',')[1]));
    }
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  }

  function saveContact(card) {
    var blob = new Blob([buildVcard(card)], { type: 'text/vcard;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = card.fullName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') + '.vcf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function showCard(card) {
    document.title = card.fullName;

    var portrait = el('div', 'portrait');
    if (VC.validPhoto(card.photo)) {
      var image = el('img');
      image.src = card.photo;
      image.alt = card.fullName;
      portrait.appendChild(image);
    } else {
      portrait.textContent = VC.initials(card.fullName);
    }

    var contacts = el('div', 'contacts');
    if (card.telegram) {
      contacts.appendChild(contactLink('https://t.me/' + encodeURIComponent(card.telegram), 'telegram', 'Telegram', '@' + card.telegram));
    }
    if (card.instagram) {
      contacts.appendChild(contactLink('https://www.instagram.com/' + encodeURIComponent(card.instagram) + '/', 'instagram', 'Instagram', '@' + card.instagram));
    }
    if (card.phone) {
      contacts.appendChild(contactLink('tel:' + card.phone, 'phone', t.call, VC.formatPhone(card.phone)));
    }

    var save = el('button', 'btn primary', t.save);
    save.type = 'button';
    save.addEventListener('click', function () { saveContact(card); });

    root.replaceChildren(portrait, el('h1', '', card.fullName), contacts, save);
  }

  async function load() {
    var id = new URLSearchParams(location.search).get('c');
    if (!id) {
      showNotice(t.notFoundTitle, t.notFoundText);
      return;
    }

    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var data = await VC.apiGet({ action: 'card', id: id });
        showCard(data.card);
        return;
      } catch (err) {
        if (err.code === 'not_found') {
          showNotice(t.notFoundTitle, t.notFoundText);
          return;
        }
      }
    }
    showNotice(t.errorTitle, t.errorText, function () { location.reload(); });
  }

  load();
})();
