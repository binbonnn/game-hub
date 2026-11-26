/* =========================================================
   Game Hub v2 · Shared profile creation component
   ---------------------------------------------------------
   Satu dialog yang sama dipakai beranda dan semua game.
   Tidak pernah melakukan navigasi, refresh, atau repaint game.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util || {};
  var S = GH.store;
  var C = GH.cloud;
  var I = GH.identity;
  var UI = GH.ui;
  var PU = GH.profileUI = {};

  var GUEST_MESSAGE = 'You\'re currently playing as a guest. Create a player profile to save your progress, scores, and achievements across all games.';
  var NAME_ERROR = 'Nama 1–16 karakter tanpa . / [ ] * ~ ` \' ".';
  var active = false;

  function cleanName(value) {
    return U.cleanName ? U.cleanName(value) : String(value || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  function validName(value) {
    return !!(U.nameValid ? U.nameValid(value) : String(value || '').trim().length > 0);
  }

  function errorText(err) {
    if (C && typeof C.describeError === 'function') return C.describeError(err);
    return U.niceError ? U.niceError(err) : String((err && err.message) || err || 'Gagal menyimpan profil.');
  }

  function resolveMode(requested) {
    if (requested === 'create' || requested === 'activate' || requested === 'edit') return requested;
    if (!I) return 'create';
    if (I.isRegistered()) return 'edit';
    return I.isLegacy() ? 'activate' : 'create';
  }

  function show(mode) {
    if (!I || !UI) return Promise.resolve(false);
    var profile = S.getProfile() || {};
    var chosen = profile.avatar || '🦊';
    var isEdit = mode === 'edit';
    var submitLabel = mode === 'activate' ? 'Aktifkan profil' : (isEdit ? 'Simpan perubahan' : 'Create Profile');

    var body = document.createElement('div');
    body.className = 'profile-form profile-form--' + mode;
    body.innerHTML =
      (isEdit
        ? '<div class="notice notice--success"><strong>Profil aktif.</strong> Nama dan avatar ini dipakai di beranda, papan skor, dan semua game.</div>'
        : '<div class="notice notice--warning"><strong>Belum punya profil.</strong> ' + U.esc(GUEST_MESSAGE) + '</div>') +
      '<label class="field"><span class="label">Nama pemain</span>' +
        '<input class="input" id="ghProfileName" data-profile-name maxlength="16" autocomplete="nickname" value="' + U.esc(profile.name || 'Pemain') + '">' +
      '</label>' +
      '<p class="input-error" data-profile-error role="alert"></p>' +
      '<div class="field"><span class="label">Avatar</span><div data-profile-avatars></div></div>' +
      '<p class="tiny muted">' + (isEdit
        ? 'Perubahan langsung tersinkron ke semua game. UID pemain tidak berubah.'
        : 'Satu profil untuk seluruh Game Hub. Sesi yang sedang berjalan tidak akan dihentikan.') + '</p>';

    var pickerHost = body.querySelector('[data-profile-avatars]');
    if (pickerHost && UI.avatarPicker) {
      pickerHost.appendChild(UI.avatarPicker(chosen, function (avatar) { chosen = avatar; }));
    }

    var busy = false;
    return UI.modal({
      title: isEdit ? 'Profil pemain' : (mode === 'activate' ? 'Aktifkan profil lama' : 'Buat profil pemain'),
      subtitle: isEdit ? 'Identitas terpusat · tersimpan di Firestore' : 'Satu profil, satu UID, untuk semua game',
      body: body,
      initialFocus: '[data-profile-name]',
      actions: [
        { label: 'Batal', value: null, variant: 'ghost' },
        {
          id: 'ghProfileSubmit',
          label: submitLabel,
          value: true,
          variant: 'primary',
          onClick: function (modal, close) {
            if (busy) return false;
            var input = modal.querySelector('[data-profile-name]');
            var err = modal.querySelector('[data-profile-error]');
            var button = modal.querySelector('#ghProfileSubmit');
            var name = cleanName(input ? input.value : '');

            if (!validName(name)) {
              if (err) err.textContent = NAME_ERROR;
              if (input) input.focus();
              return false;
            }

            busy = true;
            if (err) err.textContent = '';
            if (button) {
              button.disabled = true;
              button.textContent = 'Memproses…';
            }

            var operation = isEdit
              ? I.updateProfile({ name: name, avatar: chosen })
              : I.register({ name: name, avatar: chosen });

            operation.then(function () {
              UI.toast({
                type: 'success',
                title: isEdit ? 'Profil diperbarui' : 'Profil berhasil dibuat',
                msg: name + ' · ' + chosen,
                duration: 2600
              });
              close(true);
            }).catch(function (e) {
              busy = false;
              if (err) err.textContent = errorText(e);
              if (button) {
                button.disabled = false;
                button.textContent = submitLabel;
              }
              if (input) input.focus();
            });

            // UI.modal hanya menutup otomatis bila onClick tidak mengembalikan
            // false. Dialog ditutup manual setelah operasi berhasil.
            return false;
          }
        }
      ]
    });
  }

  PU.open = function (opts) {
    opts = typeof opts === 'string' ? { mode: opts } : (opts || {});
    if (active) return Promise.resolve(false);
    active = true;

    var ready = I && typeof I.init === 'function' ? I.init() : Promise.resolve();
    return ready.then(function () {
      return show(resolveMode(opts.mode));
    }).then(function (value) {
      active = false;
      return value;
    }, function (err) {
      active = false;
      if (UI && UI.toast) {
        UI.toast({ type: 'danger', title: 'Profil gagal dibuka', msg: errorText(err) });
      }
      throw err;
    });
  };
})();
