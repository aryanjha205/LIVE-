// Lucide Icons Initialization
lucide.createIcons();

const video = document.getElementById('video');
const playerView = document.getElementById('player-view');
const libHeader = document.getElementById('lib-header');
const featuredGrid = document.getElementById('featured-grid');
const allChannelsList = document.getElementById('all-channels-list');
const favoritesList = document.getElementById('favorites-list');
const searchResults = document.getElementById('search-results');
const globalSearch = document.getElementById('global-search');
const searchModal = document.getElementById('search-modal');

// Auth elements
const authOverlay = document.getElementById('auth-overlay');
const authEmail = document.getElementById('auth-email');
const otpInput = document.getElementById('otp-input');
const authStep1 = document.getElementById('auth-step-1');
const authStep2 = document.getElementById('auth-step-2');

let channels = [];
let hls = null;
let isLocked = false;
let currentAspectRatio = 'fit';
let rotation = 0;
let controlsTimeout;
let startY = 0;
let isRightSide = false;

// User state
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// --- INITIALIZATION ---

async function init() {
    if (currentUser) {
        authOverlay.classList.add('hidden');
        updateUIWithUser();
        fetchChannels();
    }
}

async function fetchChannels() {
    try {
        const response = await fetch('/api/channels');
        channels = await response.json();
        renderHome();
        renderExplore();
        renderFavorites();
    } catch (error) {
        console.error('Error fetching channels:', error);
        showToast('Error loading streams', 'error');
    }
}

// --- AUTH LOGIC ---

async function sendOTP() {
    const email = authEmail.value;
    if (!email || !email.includes('@')) return showToast("Enter a valid email");
    
    document.getElementById('send-otp-btn').innerText = "Sending...";
    try {
        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        authStep1.classList.add('hidden');
        authStep2.classList.remove('hidden');
        showToast("OTP sent to your email");
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        document.getElementById('send-otp-btn').innerText = "Continue";
    }
}

async function verifyOTP() {
    const email = authEmail.value;
    const otp = otpInput.value;
    if (otp.length !== 6) return showToast("Enter 6-digit OTP");
    
    document.getElementById('verify-otp-btn').innerText = "Verifying...";
    try {
        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        authOverlay.classList.add('hidden');
        updateUIWithUser();
        fetchChannels();
        showToast("Welcome to Live+!");
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        document.getElementById('verify-otp-btn').innerText = "Verify & Login";
    }
}

function backToEmail() {
    authStep2.classList.add('hidden');
    authStep1.classList.remove('hidden');
}

function updateUIWithUser() {
    if (!currentUser) return;
    document.getElementById('welcome-text').innerText = `Welcome back, ${currentUser.name}`;
    document.getElementById('user-name-display').innerText = currentUser.name;
    document.getElementById('user-bio-display').innerText = currentUser.bio || "TV Enthusiast";
    document.getElementById('user-avatar-small').src = currentUser.avatar;
    document.getElementById('user-avatar-large').src = currentUser.avatar;
    document.getElementById('edit-name').value = currentUser.name;
    document.getElementById('edit-bio').value = currentUser.bio || "";
}

function logout() {
    localStorage.removeItem('user');
    location.reload();
}

// --- PROFILE LOGIC ---

function toggleEditProfile() {
    document.getElementById('edit-profile-form').classList.toggle('hidden');
}

async function saveProfile() {
    const name = document.getElementById('edit-name').value;
    const bio = document.getElementById('edit-bio').value;
    
    try {
        const res = await fetch('/api/profile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: currentUser.email,
                name: name,
                bio: bio,
                avatar: currentUser.avatar
            })
        });
        currentUser.name = name;
        currentUser.bio = bio;
        localStorage.setItem('user', JSON.stringify(currentUser));
        updateUIWithUser();
        toggleEditProfile();
        showToast("Profile Updated!");
    } catch (err) {
        showToast("Update failed");
    }
}

function changeAvatar() {
    const newAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`;
    currentUser.avatar = newAvatar;
    saveProfile();
}

// --- RENDERING ---

function renderHome() {
    featuredGrid.innerHTML = '';
    channels.slice(0, 12).forEach(c => {
        const card = document.createElement('div');
        card.className = 'glass p-5 rounded-[25px] flex items-center space-x-4 active:scale-95 transition-all shadow-lg hover:bg-white/5';
        card.innerHTML = `
            <img src="${c.logo}" class="w-14 h-14 rounded-2xl object-cover bg-white/5" onerror="this.src='/static/icon-192.png'">
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-black text-sm truncate uppercase tracking-tight">${c.name}</span>
                <span class="text-[10px] text-blue-500 font-bold uppercase tracking-[2px]">${c.group}</span>
            </div>
            <button onclick="toggleFavorite(event, '${c.name}')" class="p-3 text-white/20">
                <i data-lucide="heart" class="w-5 h-5 ${isFavorite(c.name) ? 'fill-red-500 text-red-500' : ''}"></i>
            </button>
        `;
        card.onclick = () => openPlayer(c);
        featuredGrid.appendChild(card);
    });
    lucide.createIcons();
}

function renderExplore(list = channels) {
    allChannelsList.innerHTML = '';
    list.slice(0, 50).forEach(c => {
        const item = document.createElement('div');
        item.className = 'glass p-5 rounded-[28px] flex items-center space-x-4 shadow hover:bg-white/5 transition';
        item.innerHTML = `
            <img src="${c.logo}" class="w-12 h-12 rounded-2xl object-cover" onerror="this.src='/static/icon-192.png'">
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-bold text-base truncate">${c.name}</span>
                <span class="text-[10px] text-white/20 uppercase font-black tracking-widest">${c.group}</span>
            </div>
            <div class="w-10 h-10 rounded-full bg-blue-600/10 flex items-center justify-center"><i data-lucide="play" class="w-4 h-4 text-blue-500 fill-blue-500"></i></div>
        `;
        item.onclick = () => openPlayer(c);
        allChannelsList.appendChild(item);
    });
    lucide.createIcons();
}

// --- PLAYER LOGIC ---

function openPlayer(channel) {
    playerView.style.display = 'block';
    document.getElementById('player-channel-name').textContent = channel.name;
    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls();
        hls.loadSource(channel.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play(); updatePlayIcon(true); });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = channel.url;
        video.onloadedmetadata = () => { video.play(); updatePlayIcon(true); };
    }
    resetControlsTimer();
}

function exitPlayer() {
    playerView.style.display = 'none';
    video.pause();
    if (hls) hls.destroy();
}

function togglePlay() {
    if (video.paused) { video.play(); updatePlayIcon(true); } 
    else { video.pause(); updatePlayIcon(false); }
    resetControlsTimer();
}

function updatePlayIcon(isPlaying) {
    document.getElementById('p-icon').setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide.createIcons();
}

function toggleLock() {
    isLocked = !isLocked;
    document.getElementById('lock-icon').setAttribute('data-lucide', isLocked ? 'lock' : 'unlock');
    document.getElementById('lock-overlay').classList.toggle('active', isLocked);
    document.getElementById('controls').style.opacity = isLocked ? '0' : '1';
    lucide.createIcons();
}

function onLockedScreenTouched() {
    showToast("Screen Locked. Unlock to control.");
}

function toggleAspectRatio() {
    const modes = ['fit', 'fill', 'stretch'];
    currentAspectRatio = modes[(modes.indexOf(currentAspectRatio) + 1) % modes.length];
    video.className = currentAspectRatio;
}

function toggleRotate() { rotation = (rotation + 90) % 360; video.style.transform = `rotate(${rotation}deg)`; }

// --- GESTURES ---

playerView.addEventListener('touchstart', (e) => {
    if (isLocked) return;
    startY = e.touches[0].clientY;
    isRightSide = e.touches[0].clientX > window.innerWidth / 2;
    resetControlsTimer();
});

playerView.addEventListener('touchmove', (e) => {
    if (isLocked) return;
    const dy = (startY - e.touches[0].clientY) / 200;
    if (isRightSide) {
        video.volume = Math.max(0, Math.min(1, video.volume + dy));
        document.getElementById('vol-bar').style.height = `${video.volume * 100}%`;
        document.getElementById('volume-v').style.opacity = '1';
    } else {
        let br = parseFloat(video.style.filter.replace('brightness(', '').replace(')', '')) || 1;
        br = Math.max(0.2, Math.min(1.5, br + dy));
        video.style.filter = `brightness(${br})`;
        document.getElementById('br-bar').style.height = `${(br / 1.5) * 100}%`;
        document.getElementById('brightness-v').style.opacity = '1';
    }
    startY = e.touches[0].clientY;
    e.preventDefault();
}, { passive: false });

playerView.addEventListener('touchend', () => {
    setTimeout(() => {
        document.getElementById('volume-v').style.opacity = '0';
        document.getElementById('brightness-v').style.opacity = '0';
    }, 800);
});

// --- NAVIGATION ---

function switchPage(pageId) {
    const pages = ['home', 'explore', 'favorites', 'settings'];
    pages.forEach(p => {
        const el = document.getElementById(`page-${p}`);
        const nav = document.getElementById(`nav-${p}`);
        if (p === pageId) {
            el.classList.remove('hidden-left', 'hidden-right');
            el.style.display = 'block';
            nav.classList.add('active');
        } else {
            el.classList.add(pages.indexOf(p) < pages.indexOf(pageId) ? 'hidden-left' : 'hidden-right');
            nav.classList.remove('active');
        }
    });
}

function toggleSearch() {
    searchModal.classList.toggle('hidden');
    searchModal.classList.toggle('flex');
    if (!searchModal.classList.contains('hidden')) globalSearch.focus();
}

globalSearch.oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const res = channels.filter(c => c.name.toLowerCase().includes(q)).slice(0, 30);
    searchResults.innerHTML = '';
    res.forEach(c => {
        const item = document.createElement('div');
        item.className = 'glass p-5 rounded-3xl flex items-center space-x-4 active:scale-95 transition';
        item.innerHTML = `<img src="${c.logo}" class="w-12 h-12 rounded-2xl object-cover"><span class="font-bold">${c.name}</span>`;
        item.onclick = () => { openPlayer(c); toggleSearch(); };
        searchResults.appendChild(item);
    });
};

function filterByGroup(group) {
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.textContent.includes(group)));
    switchPage('explore');
    renderExplore(group === 'All' ? channels : channels.filter(c => c.group.includes(group) || c.name.includes(group)));
}

// --- FAVORITES ---

function toggleFavorite(e, name) {
    e.stopPropagation();
    let favs = JSON.parse(localStorage.getItem('favs') || '[]');
    favs = favs.includes(name) ? favs.filter(f => f !== name) : [...favs, name];
    localStorage.setItem('favs', JSON.stringify(favs));
    renderHome();
    renderFavorites();
}

function isFavorite(name) { return (JSON.parse(localStorage.getItem('favs') || '[]')).includes(name); }

function renderFavorites() {
    const favs = JSON.parse(localStorage.getItem('favs') || '[]');
    const list = channels.filter(c => favs.includes(c.name));
    favoritesList.innerHTML = list.length === 0 ? '<p class="text-center py-20 opacity-20">Empty Library</p>' : '';
    list.forEach(c => {
        const item = document.createElement('div');
        item.className = 'glass p-5 rounded-[28px] flex items-center space-x-4';
        item.innerHTML = `<img src="${c.logo}" class="w-12 h-12 rounded-2xl object-cover"><div class="flex-grow font-bold">${c.name}</div><i data-lucide="heart" class="fill-red-500 text-red-500 w-5 h-5"></i>`;
        item.onclick = () => openPlayer(c);
        favoritesList.appendChild(item);
    });
    lucide.createIcons();
}

function showToast(msg, type='info') {
    const t = document.getElementById('global-toast');
    t.innerText = msg;
    t.style.opacity = '1';
    setTimeout(() => t.style.opacity = '0', 3000);
}

function resetControlsTimer() {
    const c = document.getElementById('controls');
    c.style.opacity = '1';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => { if (!video.paused && !isLocked) c.style.opacity = '0'; }, 4000);
}

function skip(s) { video.currentTime += s; showToast(`Skipped ${s}s`); }
function toggleFullScreen() { document.fullscreenElement ? document.exitFullscreen() : playerView.requestFullscreen(); }

// --- AUTO ROTATION FULLSCREEN ---
function handleRotation() {
    if (playerView.style.display === 'block') {
        const isLandscape = window.innerWidth > window.innerHeight;
        if (isLandscape && !document.fullscreenElement) {
            playerView.requestFullscreen().catch(err => console.log("Fullscreen blocked"));
        }
    }
}

window.addEventListener('resize', handleRotation);
if (screen.orientation) {
    screen.orientation.addEventListener('change', handleRotation);
}

// Init
init();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
}
