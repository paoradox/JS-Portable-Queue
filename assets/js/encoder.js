/*
 * encoder.js — Encoder page controller
 *
 * Depends on: auth.js, queue.js, ui.js, bootstrap.js.
 */
(function (window, document) {
    'use strict';

    var STORAGE_RECONCILE_DEBOUNCE_MS = 75;

    var SPEAK_LABELS = {
        c1:    'Station 1',
        c2:    'Station 2',
        c3:    'Station 3',
        c4:    'Station 4',
        c5:    'Station 5',
        c6:    'Station 6',
        pwd:   'Priority station',
        escal: 'Escalation station'
    };

    var session = null;
    var activeCounterId = null;
    var unsubscribeQueue = null;
    var storageReconcileTimer = null;
    var stopClock = null;
    var loginModalInstance = null;
    var el = {};

    function $(id) { return document.getElementById(id); }

    function cacheElements() {
        el.authGate            = $('authGate');
        el.firstRunForm        = $('firstRunForm');
        el.firstRunUsername    = $('firstRunUsername');
        el.firstRunPassword    = $('firstRunPassword');
        el.firstRunPasswordCfm = $('firstRunPasswordConfirm');
        el.firstRunError       = $('firstRunError');
        el.firstRunSubmit      = $('firstRunSubmit');

        el.loginModal          = $('loginModal');
        el.loginCloseX         = $('loginCloseX');
        el.loginUsername       = $('username');
        el.loginPassword       = $('password');
        el.loginError          = $('loginError');
        el.loginSubmit         = $('loginSubmit');

        el.activeUser          = $('activeUser');
        el.logoutBtn           = $('logoutBtn');
        el.adminNavItem        = $('adminNavItem');
        el.datetime            = $('datetime');

        el.counterPicker       = $('counterPicker');
        el.counterPickerSelect = $('counterPickerSelect');
        el.counterDash         = $('counterDash');
        el.dashCounterLabel    = $('dashCounterLabel');
        el.dashCurrentValue    = $('dashCurrentValue');
        el.dashLastUpdated     = $('dashLastUpdated');
        el.dashPrefix          = $('dashPrefix');
        el.dashManualInput     = $('dashManualInput');
        el.dashSetBtn          = $('dashSetBtn');
        el.dashNextBtn         = $('dashNextBtn');
        el.dashError           = $('dashError');
        el.dashSpeakBtn        = $('dashSpeakBtn');
    }

    function ensureModal(element) {
        var M = window.bootstrap.Modal;
        if (typeof M.getOrCreateInstance === 'function') {
            return M.getOrCreateInstance(element);
        }
        if (typeof M.getInstance === 'function') {
            var existing = M.getInstance(element);
            if (existing) { return existing; }
        }
        return new M(element);
    }

    function showError(element, message) { element.textContent = message || ''; }
    function clearError(element) { element.textContent = ''; }

    // ---------------------------------------------------------------
    // Sidebar auth button: "Login" when logged out, "Logout" when in
    // ---------------------------------------------------------------

    function renderAuthButton() {
        if (!el.logoutBtn) { return; }
        el.logoutBtn.textContent = window.JSQ_Auth.isLoggedIn() ? 'Logout' : 'Login';
    }

    // ---------------------------------------------------------------
    // Auth gate: first-run only
    // ---------------------------------------------------------------

    function showFirstRunForm() {
        el.firstRunForm.classList.remove('d-none');
        el.authGate.classList.remove('d-none');
    }

    function hideAuthGate() {
        el.authGate.classList.add('d-none');
    }

    function handleFirstRunSubmit() {
        clearError(el.firstRunError);

        var username = el.firstRunUsername.value.trim();
        var password = el.firstRunPassword.value;
        var confirm  = el.firstRunPasswordCfm.value;

        if (password !== confirm) {
            showError(el.firstRunError, 'Passwords do not match.');
            return;
        }

        el.firstRunSubmit.disabled = true;

        window.JSQ_Auth.createUser({
            username: username,
            password: password,
            isAdmin: true
        }).then(function () {
            return window.JSQ_Auth.login(username, password);
        }).then(function () {
            el.firstRunSubmit.disabled = false;
            hideAuthGate();
            renderAuthButton();
            beginSession();
        }).catch(function (err) {
            el.firstRunSubmit.disabled = false;
            showError(el.firstRunError, err.message || 'Could not create account.');
        });
    }

    // ---------------------------------------------------------------
    // Login modal
    // ---------------------------------------------------------------

    function openLoginModal() {
        if (!window.bootstrap || !window.bootstrap.Modal) {
            console.error('encoder.js: Bootstrap JS is not loaded.');
            return;
        }
        if (!loginModalInstance) {
            loginModalInstance = ensureModal(el.loginModal);
        }
        el.loginError.textContent = '';
        loginModalInstance.show();
        window.setTimeout(function () {
            if (el.loginUsername) { el.loginUsername.focus(); }
        }, 200);
    }

    function closeLoginModal(e) {
        if (e) { e.preventDefault(); }
        if (loginModalInstance) { loginModalInstance.hide(); }
    }

    function handleLoginSubmit() {
        clearError(el.loginError);

        var username = el.loginUsername.value.trim();
        var password = el.loginPassword.value;

        if (!username || !password) {
            showError(el.loginError, 'Enter both username and password.');
            return;
        }

        el.loginSubmit.disabled = true;

        window.JSQ_Auth.login(username, password).then(function () {
            el.loginSubmit.disabled = false;
            el.loginPassword.value = '';
            closeLoginModal();
            renderAuthButton();
            beginSession();
        }).catch(function (err) {
            el.loginSubmit.disabled = false;
            showError(el.loginError, err.message || 'Login failed.');
        });
    }

    // ---------------------------------------------------------------
    // Session lifecycle
    // ---------------------------------------------------------------

    function updateAdminLink(isAdmin) {
        if (!el.adminNavItem) { return; }
        el.adminNavItem.classList.toggle('d-none', !isAdmin);
    }

    function beginSession() {
        session = window.JSQ_Auth.getSession();
        if (!session) {
            renderAuthButton();
            openLoginModal();
            return;
        }

        el.activeUser.textContent = session.username;
        updateAdminLink(session.isAdmin);
        hideAuthGate();

        activeCounterId = resolveActiveCounter();
        renderCounterOrPicker();
        subscribeQueueChanges();
    }

    function endSession() {
        window.JSQ_Auth.logout();
        unsubscribeQueueChanges();
        if (stopClock) { stopClock(); stopClock = null; }
        if (storageReconcileTimer) {
            window.clearTimeout(storageReconcileTimer);
            storageReconcileTimer = null;
        }
        session = null;
        activeCounterId = null;
        window.location.href = 'index.html';
    }

    function isValidCounterId(id) {
        if (!id) { return false; }
        return window.JSQ_Queue.COUNTERS.some(function (c) { return c.id === id; });
    }

    function resolveActiveCounter() {
        if (!session) { return null; }
        if (session.counter && isValidCounterId(session.counter)) {
            return session.counter;
        }
        return null;
    }

    function buildCounterPicker() {
        var sel = el.counterPickerSelect;
        sel.innerHTML = '<option value="">— Choose a station —</option>';
        window.JSQ_Queue.COUNTERS.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.label;
            sel.appendChild(opt);
        });
    }

    function renderCounterOrPicker() {
        if (isValidCounterId(activeCounterId)) {
            el.counterPicker.classList.add('d-none');
            el.counterDash.classList.remove('d-none');
            renderCounter();
        } else {
            el.counterDash.classList.add('d-none');
            el.counterPicker.classList.remove('d-none');
            el.counterPickerSelect.value = '';
        }
    }

    function renderCounter() {
        if (!isValidCounterId(activeCounterId)) { return; }

        var counter = window.JSQ_Queue.getCounter(activeCounterId);
        if (!counter) { return; }

        el.dashCounterLabel.textContent = counter.label;
        el.dashCurrentValue.textContent = counter.display;

        if (counter.updatedAt) {
            el.dashLastUpdated.textContent =
                'Last updated: ' + window.JSQ_UI.formatAbsolute(counter.updatedAt);
        } else {
            el.dashLastUpdated.textContent = 'No value issued yet.';
        }

        if (counter.prefix) {
            el.dashPrefix.textContent = counter.prefix;
            el.dashPrefix.classList.remove('d-none');
        } else {
            el.dashPrefix.classList.add('d-none');
        }
    }

    function renderAll() {
        renderCounter();
        window.JSQ_UI.renderBoard();
    }

    function handleCounterPick() {
        var chosen = el.counterPickerSelect.value;
        if (!isValidCounterId(chosen)) { return; }
        clearError(el.dashError);

        try {
            window.JSQ_Auth.setUserCounter(session.userId, chosen);
            session = window.JSQ_Auth.getSession();
            activeCounterId = resolveActiveCounter();
            renderCounterOrPicker();
        } catch (err) {
            showError(el.dashError, err.message || 'Could not save your station.');
        }
    }

    function getActor() {
        if (!session) { return null; }
        return { userId: session.userId, username: session.username };
    }

    function handleIssueNext() {
        if (!isValidCounterId(activeCounterId)) { return; }
        clearError(el.dashError);

        try {
            window.JSQ_Queue.issueNext(activeCounterId, getActor());
            renderAll();
        } catch (err) {
            showError(el.dashError, err.message || 'Could not issue next.');
        }
    }

    function handleSetValue() {
        if (!isValidCounterId(activeCounterId)) { return; }
        clearError(el.dashError);

        var raw = el.dashManualInput.value;
        try {
            window.JSQ_Queue.setCounterValue(activeCounterId, raw, getActor());
            el.dashManualInput.value = '';
            renderAll();
        } catch (err) {
            showError(el.dashError, err.message || 'Could not set value.');
        }
    }

    function buildSpeakText(counter) {
        var label = SPEAK_LABELS[counter.id] || ('Station ' + counter.label);

        if (counter.value == null) {
            return label + ', no number yet';
        }
        if (counter.prefix) {
            return label + ', now serving ' + counter.prefix + ', ' + counter.value;
        }
        return label + ', now serving number ' + counter.value;
    }

    function handleSpeak() {
        if (!('speechSynthesis' in window)) {
            showError(el.dashError, 'Your browser does not support text-to-speech.');
            return;
        }
        if (!isValidCounterId(activeCounterId)) { return; }

        var counter = window.JSQ_Queue.getCounter(activeCounterId);
        if (!counter) { return; }

        var text = buildSpeakText(counter);

        window.speechSynthesis.cancel();
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }

    function subscribeQueueChanges() {
        if (unsubscribeQueue) { return; }
        unsubscribeQueue = window.JSQ_Queue.onChange(renderAll);
    }

    function unsubscribeQueueChanges() {
        if (unsubscribeQueue) {
            unsubscribeQueue();
            unsubscribeQueue = null;
        }
    }

    function handleUsersStorageChange() {
        if (!session) { return; }

        var fresh = window.JSQ_Auth.getSession();
        if (!fresh) { endSession(); return; }

        if (fresh.username !== session.username) {
            el.activeUser.textContent = fresh.username;
        }
        if (fresh.isAdmin !== session.isAdmin) {
            updateAdminLink(fresh.isAdmin);
        }

        session = fresh;
        activeCounterId = resolveActiveCounter();
        renderCounterOrPicker();
    }

    function scheduleUsersReconcile() {
        if (storageReconcileTimer) {
            window.clearTimeout(storageReconcileTimer);
        }
        storageReconcileTimer = window.setTimeout(function () {
            storageReconcileTimer = null;
            handleUsersStorageChange();
        }, STORAGE_RECONCILE_DEBOUNCE_MS);
    }

    // ---------------------------------------------------------------
    // Sidebar button: "Login" or "Logout" depending on state
    // ---------------------------------------------------------------

    function handleAuthButtonClick(e) {
        if (e) { e.preventDefault(); }

        if (!window.JSQ_Auth.isLoggedIn()) {
            openLoginModal();
            return;
        }
        endSession();
    }

    // ---------------------------------------------------------------
    // Event wiring
    // ---------------------------------------------------------------

    function wireEvents() {
        el.firstRunSubmit.addEventListener('click', handleFirstRunSubmit);

        el.loginCloseX.addEventListener('click', closeLoginModal);
        el.loginSubmit.addEventListener('click', handleLoginSubmit);
        el.loginPassword.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLoginSubmit();
            }
        });
        el.loginModal.addEventListener('show.bs.modal', function () {
            document.body.classList.add('login-open');
        });
        el.loginModal.addEventListener('hidden.bs.modal', function () {
            document.body.classList.remove('login-open');
            el.loginError.textContent = '';
            el.loginPassword.value = '';
            // Session state may have changed while the modal was open.
            renderAuthButton();
        });

        el.activeUser.addEventListener('click', function (e) {
            e.preventDefault();
            if (!window.JSQ_Auth.isLoggedIn()) { openLoginModal(); }
        });

        el.logoutBtn.addEventListener('click', handleAuthButtonClick);

        el.firstRunPasswordCfm.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleFirstRunSubmit();
            }
        });

        el.counterPickerSelect.addEventListener('change', handleCounterPick);

        el.dashNextBtn.addEventListener('click', handleIssueNext);
        el.dashSetBtn.addEventListener('click', handleSetValue);
        el.dashSpeakBtn.addEventListener('click', handleSpeak);

        el.dashManualInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSetValue();
            }
        });

        el.dashManualInput.addEventListener('focus', function () {
            this.select();
        });

        window.addEventListener('storage', function (e) {
            if (e.key === 'jsq.users') { scheduleUsersReconcile(); }
        });
    }

    // ---------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------

    function boot() {
        cacheElements();
        wireEvents();
        window.JSQ_UI.wireSidebar();
        buildCounterPicker();

        stopClock = window.JSQ_UI.startClock(el.datetime);
        window.JSQ_UI.renderBoard();

        if (!window.JSQ_Auth.hasAnyUser()) {
            showFirstRunForm();
            renderAuthButton();
            return;
        }

        renderAuthButton();

        if (!window.JSQ_Auth.isLoggedIn()) {
            openLoginModal();
            return;
        }

        beginSession();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.addEventListener('beforeunload', function () {
        if (stopClock) { stopClock(); stopClock = null; }
    });

})(window, document);