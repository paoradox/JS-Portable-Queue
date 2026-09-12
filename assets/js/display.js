/*
 * display.js — Public display board controller
 *
 * Depends on: auth.js, queue.js, ui.js, bootstrap.js.
 */
(function (window, document) {
    'use strict';

    var stopClock = null;
    var unsubscribeQueue = null;
    var loginModal = null;
    var el = {};

    var dingCtx = null;
    var lastDingAt = 0;
    var lastSeenLogTs = null;

    function $(id) { return document.getElementById(id); }

    function cacheElements() {
        el.datetime      = $('datetime');
        el.loginLink     = $('loginLink');
        el.loginModal    = $('loginModal');
        el.loginForm     = $('loginForm');
        el.loginUsername = $('username');
        el.loginPassword = $('password');
        el.loginError    = $('loginError');
        el.loginSubmit   = $('loginSubmit');
        el.loginCloseX   = $('loginCloseX');
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

    function closeLoginModal(e) {
        if (e) { e.preventDefault(); }
        if (loginModal) { loginModal.hide(); }
    }

    // ---------------------------------------------------------------
    // Sound cue
    // ---------------------------------------------------------------

    function getAudioCtx() {
        if (dingCtx) { return dingCtx; }
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) { return null; }
            dingCtx = new Ctx();
        } catch (e) {
            console.warn('display.js: Web Audio unavailable.', e);
            dingCtx = null;
        }
        return dingCtx;
    }

    function playDing() {
        var now = Date.now();
        if (now - lastDingAt < 500) { return; }
        lastDingAt = now;

        var ctx = getAudioCtx();
        if (!ctx) { return; }
        if (ctx.state === 'suspended') { ctx.resume(); }

        var t = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(1320, t + 0.12);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

        osc.start(t);
        osc.stop(t + 0.7);
    }

    function installAudioUnlock() {
        document.addEventListener('click', function unlock() {
            var ctx = getAudioCtx();
            if (ctx && ctx.state === 'suspended') { ctx.resume(); }
        }, { once: true });
    }

    // ---------------------------------------------------------------
    // Board subscription
    // ---------------------------------------------------------------

    function checkForNewIssue() {
        var log = window.JSQ_Queue.getLog();
        if (!log || log.length === 0) { return; }

        var newestTs = log[0].ts;

        if (lastSeenLogTs === null) {
            lastSeenLogTs = newestTs;
            return;
        }
        if (newestTs === lastSeenLogTs) { return; }

        var sawIssue = false;
        for (var i = 0; i < log.length; i++) {
            if (log[i].ts === lastSeenLogTs) { break; }
            if (log[i].action === 'issue') { sawIssue = true; }
        }
        lastSeenLogTs = newestTs;

        if (sawIssue) { playDing(); }
    }

    function onQueueChange() {
        window.JSQ_UI.renderBoard();
        checkForNewIssue();
    }

    function subscribeBoard() {
        if (unsubscribeQueue) { return; }
        unsubscribeQueue = window.JSQ_Queue.onChange(onQueueChange);
    }

    // ---------------------------------------------------------------
    // Login modal / routing
    // ---------------------------------------------------------------

    function openLoginModal() {
        if (typeof window.bootstrap === 'undefined' ||
            !window.bootstrap.Modal) {
            console.error('display.js: Bootstrap JS is not loaded. Redirecting to encoder.html.');
            window.location.href = 'encoder.html';
            return;
        }

        if (!loginModal) {
            loginModal = ensureModal(el.loginModal);
        }
        el.loginError.textContent = '';
        loginModal.show();
        window.setTimeout(function () {
            el.loginUsername.focus();
        }, 200);
    }

    function handleLoginLinkClick(e) {
        e.preventDefault();

        if (!window.JSQ_Auth) {
            console.error('display.js: JSQ_Auth is not loaded.');
            return;
        }

        if (!window.JSQ_Auth.hasAnyUser()) {
            window.location.href = 'encoder.html';
            return;
        }
        if (window.JSQ_Auth.isLoggedIn()) {
            window.location.href = 'encoder.html';
            return;
        }
        openLoginModal();
    }

    function handleLoginSubmit() {
        el.loginError.textContent = '';

        var username = el.loginUsername.value.trim();
        var password = el.loginPassword.value;

        if (!username || !password) {
            el.loginError.textContent = 'Enter both username and password.';
            return;
        }

        el.loginSubmit.disabled = true;

        window.JSQ_Auth.login(username, password).then(function () {
            el.loginSubmit.disabled = false;
            window.location.href = 'encoder.html';
        }).catch(function (err) {
            el.loginSubmit.disabled = false;
            el.loginError.textContent = err.message || 'Login failed.';
        });
    }

    // ---------------------------------------------------------------
    // Event wiring
    // ---------------------------------------------------------------

    function wireEvents() {
        el.loginLink.addEventListener('click', handleLoginLinkClick);
        el.loginSubmit.addEventListener('click', handleLoginSubmit);

        if (el.loginCloseX) { el.loginCloseX.addEventListener('click', closeLoginModal); }

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
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && el.loginModal &&
                el.loginModal.classList.contains('show')) {
                closeLoginModal();
            }
        });
    }

    // ---------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------

    function boot() {
        cacheElements();
        wireEvents();
        window.JSQ_UI.wireSidebar();
        installAudioUnlock();

        stopClock = window.JSQ_UI.startClock(el.datetime);

        var log = window.JSQ_Queue.getLog();
        if (log && log.length > 0) {
            lastSeenLogTs = log[0].ts;
        }

        window.JSQ_UI.renderBoard();
        subscribeBoard();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.addEventListener('beforeunload', function () {
        if (stopClock) { stopClock(); stopClock = null; }
        if (unsubscribeQueue) {
            unsubscribeQueue();
            unsubscribeQueue = null;
        }
    });

})(window, document);