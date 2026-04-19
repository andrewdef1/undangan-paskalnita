/* =====================================================
   script.js — Wedding Invitation
   Real-time Ucapan & Doa powered by Firebase Firestore
   ===================================================== */

'use strict';

/* ─────────────────────────────────────────
   FIREBASE INIT
───────────────────────────────────────── */
let db            = null;
let IS_FIREBASE   = false;    // true setelah Firebase berhasil init
let unsubscribeWishes = null; // untuk detach listener saat perlu

function initFirebase() {
  try {
    /* FIREBASE_CONFIG didefinisikan di firebase-config.js */
    if (
      typeof FIREBASE_CONFIG === 'undefined' ||
      FIREBASE_CONFIG.apiKey.startsWith('GANTI')
    ) {
      showFirebaseNotice();
      return;
    }

    const app = firebase.initializeApp(FIREBASE_CONFIG);
    db         = firebase.firestore(app);
    IS_FIREBASE = true;
    console.log('[Firebase] Connected ✓');

    // Aktifkan offline persistence (data tetap ada walau offline)
    db.enablePersistence({ synchronizeTabs: true })
      .catch(err => console.warn('[Firebase] Persistence:', err.code));

  } catch (err) {
    console.warn('[Firebase] Init failed, fallback to localStorage.', err);
    showFirebaseNotice();
  }
}

function showFirebaseNotice() {
  const el = document.getElementById('firebase-notice');
  if (el) el.classList.remove('hidden');
}

/* ─────────────────────────────────────────
   1. ENVELOPE OPEN
───────────────────────────────────────── */
function openInvitation() {
  const overlay = document.getElementById('envelope-overlay');
  const main    = document.getElementById('main-content');

  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.style.display = 'none';
    main.classList.remove('hidden');

    tryAutoPlay();
    revealOnScroll();
    window.addEventListener('scroll', revealOnScroll, { passive: true });
    updateCountdown();
    setInterval(updateCountdown, 1000);

    // Init Firebase & mulai listen wishes
    initFirebase();
    startWishesListener();

  }, 800);
}

/* ─────────────────────────────────────────
   2. MUSIC PLAYER
───────────────────────────────────────── */
let musicPlaying = false;
const audio      = document.getElementById('bg-music');
const musicBtn   = document.getElementById('music-btn');
const musicIcon  = document.getElementById('music-icon');
const musicWave  = document.getElementById('music-wave');

function tryAutoPlay() {
  if (!audio) return;
  audio.volume = 0.35;
  const p = audio.play();
  if (p !== undefined) {
    p.then(() => setMusicState(true)).catch(() => setMusicState(false));
  }
}

function toggleMusic() {
  if (musicPlaying) {
    audio.pause();
    setMusicState(false);
  } else {
    audio.play().catch(() => {});
    setMusicState(true);
  }
}

function setMusicState(playing) {
  musicPlaying = playing;
  if (playing) {
    musicIcon.className = 'fa-solid fa-pause';
    musicBtn.classList.add('playing');
    musicWave.classList.add('active');
  } else {
    musicIcon.className = 'fa-solid fa-music';
    musicBtn.classList.remove('playing');
    musicWave.classList.remove('active');
  }
}

/* ─────────────────────────────────────────
   3. SCROLL REVEAL
───────────────────────────────────────── */
function revealOnScroll() {
  const reveals = document.querySelectorAll('.reveal:not(.visible)');
  const trigger = window.innerHeight * 0.9;
  reveals.forEach(el => {
    if (el.getBoundingClientRect().top < trigger) el.classList.add('visible');
  });
}

/* ─────────────────────────────────────────
   4. SMOOTH SCROLL
───────────────────────────────────────── */
document.addEventListener('click', e => {
  const link = e.target.closest('.scroll-link');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || !href.startsWith('#')) return;
  e.preventDefault();
  const target = document.querySelector(href);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ─────────────────────────────────────────
   5. COUNTDOWN TIMER
───────────────────────────────────────── */
const WEDDING_DATE = new Date('2026-04-25T10:00:00+09:00');

function updateCountdown() {
  const now  = new Date();
  const diff = WEDDING_DATE - now;
  const el   = id => document.getElementById(id);

  if (!el('cd-days')) return;

  if (diff <= 0) {
    ['cd-days','cd-hours','cd-minutes','cd-seconds'].forEach(i => el(i).textContent = '00');
    return;
  }

  const days    = Math.floor(diff / 86400000);
  const hours   = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000)  / 60000);
  const seconds = Math.floor((diff % 60000)    / 1000);

  const prevS = el('cd-seconds').textContent;
  const newS  = String(seconds).padStart(2, '0');

  el('cd-days').textContent    = String(days).padStart(2, '0');
  el('cd-hours').textContent   = String(hours).padStart(2, '0');
  el('cd-minutes').textContent = String(minutes).padStart(2, '0');
  el('cd-seconds').textContent = newS;

  if (prevS !== newS) {
    el('cd-seconds').classList.add('tick');
    setTimeout(() => el('cd-seconds').classList.remove('tick'), 300);
  }
}

/* ─────────────────────────────────────────
   6. RSVP FORM — Submit ke Firebase / localStorage
───────────────────────────────────────── */
function submitRSVP(e) {
  e.preventDefault();

  const name       = document.getElementById('rsvp-name').value.trim();
  const phone      = document.getElementById('rsvp-phone').value.trim();
  const guests     = document.getElementById('rsvp-guests').value;
  const attendance = document.querySelector('input[name="attendance"]:checked').value;
  const message    = document.getElementById('rsvp-message').value.trim();

  if (!name) { alert('Mohon isi nama lengkap Anda.'); return; }

  const btn = document.getElementById('rsvp-submit');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim…';

  const payload = {
    name,
    phone,
    guests,
    attendance,
    message: message || '',
    ts: IS_FIREBASE ? firebase.firestore.FieldValue.serverTimestamp() : Date.now(),
    tsClient: Date.now()
  };

  if (IS_FIREBASE) {
    db.collection('wishes')
      .add(payload)
      .then(() => onRSVPSuccess())
      .catch(err => {
        console.error('[Firebase] Write failed:', err);
        saveToLocalFallback(payload);
        onRSVPSuccess();
      });
  } else {
    // Simpan ke localStorage sebagai fallback
    setTimeout(() => {
      saveToLocalFallback({ ...payload, ts: Date.now() });
      onRSVPSuccess();
      renderLocalWishes();
    }, 900);
  }
}

function onRSVPSuccess() {
  document.getElementById('rsvp-form').classList.add('hidden');
  document.getElementById('rsvp-success').classList.remove('hidden');
  // Scroll ke wishes wall
  setTimeout(() => {
    const wall = document.getElementById('wishes-wall');
    if (wall) wall.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 600);
}

/* ─────────────────────────────────────────
   7. FIREBASE REAL-TIME LISTENER
───────────────────────────────────────── */
let allWishes      = [];   // semua wishes dari Firestore
let currentFilter  = 'all';

function startWishesListener() {
  if (!IS_FIREBASE) {
    // Fallback: load dari localStorage dan tampilkan
    allWishes = getLocalWishes();
    hideSkeleton();
    renderVisibleWishes();
    return;
  }

  const query = db.collection('wishes')
    .orderBy('ts', 'desc')
    .limit(100);

  unsubscribeWishes = query.onSnapshot(snapshot => {
    allWishes = [];
    snapshot.forEach(doc => {
      allWishes.push({ id: doc.id, ...doc.data() });
    });

    // Tambahkan demo wishes hanya jika masih kosong
    if (allWishes.length === 0) {
      allWishes = [...DEMO_WISHES];
    }

    hideSkeleton();
    renderVisibleWishes();
    updateCountBadge(allWishes.length);

  }, err => {
    console.warn('[Firebase] Snapshot error:', err);
    allWishes = getLocalWishes();
    hideSkeleton();
    renderVisibleWishes();
    showFirebaseNotice();
  });
}

function hideSkeleton() {
  const sk   = document.getElementById('wishes-skeleton');
  const list = document.getElementById('wishes-list');
  if (sk)   sk.style.display   = 'none';
  if (list) list.style.display = 'flex';
}

/* ─────────────────────────────────────────
   8. RENDER WISHES
───────────────────────────────────────── */
function renderVisibleWishes() {
  const list = document.getElementById('wishes-list');
  if (!list) return;

  const filtered = currentFilter === 'all'
    ? allWishes
    : allWishes.filter(w => w.attendance === currentFilter);

  updateCountBadge(allWishes.length);

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="wishes-empty">
        <i class="fa-regular fa-comment-dots"></i>
        <p>${currentFilter === 'all'
          ? 'Jadilah yang pertama mengucapkan doa! 💌'
          : 'Belum ada ucapan di kategori ini.'}</p>
      </div>`;
    return;
  }

  // Render kartu — simpan posisi scroll agar tidak jump
  const prevScrollY = window.scrollY;
  list.innerHTML = filtered.map((w, i) => buildWishCard(w, i)).join('');
  window.scrollTo({ top: prevScrollY, behavior: 'instant' });
}

function buildWishCard(w, i) {
  const isHadir    = w.attendance === 'hadir';
  const badgeClass = isHadir ? '' : 'wish-badge-tidak';
  const badgeText  = isHadir ? '✓ Hadir' : '✗ Berhalangan';
  const color      = avatarColor(w.name);
  const initial    = (w.name || '?')[0].toUpperCase();
  const time       = formatRelativeTime(w.ts || w.tsClient);
  const guests     = w.guests ? ` · ${w.guests} orang` : '';
  const delay      = Math.min(i * 60, 600);

  return `
    <div class="wish-item" style="animation-delay:${delay}ms">
      <div class="wish-avatar" style="background:${color}">${initial}</div>
      <div class="wish-body">
        <div class="wish-meta">
          <span class="wish-name">${escHtml(w.name)}</span>
          <span class="badge-hadir ${badgeClass}">${badgeText}${guests}</span>
        </div>
        ${w.message ? `<div class="wish-msg">${escHtml(w.message)}</div>` : ''}
        <div class="wish-time">${time}</div>
      </div>
    </div>`;
}

/* ─────────────────────────────────────────
   9. FILTER
───────────────────────────────────────── */
function filterWishes(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderVisibleWishes();
}

/* ─────────────────────────────────────────
   10. COUNT BADGE
───────────────────────────────────────── */
function updateCountBadge(count) {
  const badge = document.getElementById('wishes-count');
  if (badge) {
    badge.textContent = count;
    badge.classList.add('bump');
    setTimeout(() => badge.classList.remove('bump'), 400);
  }
}

/* ─────────────────────────────────────────
   11. localStorage FALLBACK
───────────────────────────────────────── */
const LS_KEY = 'wedding_wishes_v2';

function getLocalWishes() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY)) || [];
    return [...stored, ...DEMO_WISHES];
  } catch { return [...DEMO_WISHES]; }
}

function saveToLocalFallback(wish) {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY)) || [];
    stored.unshift(wish);
    localStorage.setItem(LS_KEY, JSON.stringify(stored.slice(0, 50)));
  } catch {}
}

function renderLocalWishes() {
  allWishes = getLocalWishes();
  renderVisibleWishes();
}

/* ─────────────────────────────────────────
   12. DEMO WISHES (Seed data)
───────────────────────────────────────── */
const DEMO_WISHES = [
  {
    name: 'Keluarga Besar Merahabia',
    attendance: 'hadir', guests: '5+',
    message: 'Selamat & bahagia selalu untuk Paskal dan Nita. Kiranya Tuhan memberkati pernikahan kalian selamanya. Amin 🙏',
    tsClient: Date.now() - 3600000
  },
  {
    name: 'Teman-teman Universitas',
    attendance: 'hadir', guests: '3',
    message: 'Congratulations Paskal & Nita! Bahagia selalu ya! Semoga rumah tangga kalian penuh cinta dan tawa 🎊💕',
    tsClient: Date.now() - 10800000
  },
];

/* ─────────────────────────────────────────
   13. HELPERS
───────────────────────────────────────── */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  // Firestore Timestamp vs plain number
  const ms = ts?.toMillis?.() ?? ts?.seconds * 1000 ?? ts;
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60000)   return 'Baru saja';
  if (diff < 3600000) return `${Math.floor(diff/60000)} menit lalu`;
  if (diff < 86400000)return `${Math.floor(diff/3600000)} jam lalu`;
  const d = new Date(ms);
  return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

const AVATAR_COLORS = [
  '#c9a84c','#b05070','#6b8cba','#7b9e7b',
  '#a0784c','#8b6cbf','#c07060','#5b8a8a',
];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name||'').length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/* ─────────────────────────────────────────
   14. COPY REKENING
───────────────────────────────────────── */
function copyRek() {
  const num = document.getElementById('rek-number')?.textContent?.trim();
  const btn = document.getElementById('copy-rek-btn');
  if (!num || !btn) return;

  const copy = text => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopied(btn);
  };

  navigator.clipboard
    ? navigator.clipboard.writeText(num).then(() => showCopied(btn)).catch(() => copy(num))
    : copy(num);
}

function showCopied(btn) {
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
  btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2500);
}

/* ─────────────────────────────────────────
   15. SHARE INVITATION
───────────────────────────────────────── */
function shareInvitation() {
  const data = {
    title: 'Undangan Pernikahan Paskal & Nita',
    text : '✨ Kami mengundang Anda ke pernikahan kami — Sabtu, 25 April 2026 💍',
    url  : window.location.href,
  };
  const btn = document.getElementById('share-btn');

  if (navigator.share) {
    navigator.share(data).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Link Disalin!';
      setTimeout(() => btn.innerHTML = orig, 2500);
    });
  } else {
    alert('Salin link berikut:\n\n' + window.location.href);
  }
}

/* ─────────────────────────────────────────
   16. PARALLAX HERO BG
───────────────────────────────────────── */
window.addEventListener('scroll', () => {
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg && window.scrollY < window.innerHeight) {
    heroBg.style.transform = `scale(1.08) translateY(${window.scrollY * 0.25}px)`;
  }
}, { passive: true });
/* ─────────────────────────────────────────
   17. DYNAMIC GUEST NAME
───────────────────────────────────────── */
function updateGuestName() {
  const urlParams = new URLSearchParams(window.location.search);
  const guestName = urlParams.get('to');
  const guestEl = document.getElementById('guest-name');
  if (guestEl && guestName) {
    guestEl.textContent = guestName;
  }
}

// Kerjakan saat script load
updateGuestName();
