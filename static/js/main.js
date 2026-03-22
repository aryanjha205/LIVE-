// Lucide Icons Initialization
lucide.createIcons();

const video = document.getElementById('video');
const playerView = document.getElementById('player-view');
const libHeader = document.getElementById('lib-header');
const bottomNav = document.getElementById('bottom-nav');
const featuredGrid = document.getElementById('featured-grid');
const allChannelsList = document.getElementById('all-channels-list');
const favoritesList = document.getElementById('favorites-list');
const searchResults = document.getElementById('search-results');
const globalSearch = document.getElementById('global-search');
const searchModal = document.getElementById('search-modal');

let channels = [];
let hls = null;
let isLocked = false;
let currentAspectRatio = 'fit';
let rotation = 0;
let controlsTimeout;
let startY = 0;
let isRightSide = false;

// --- INITIALIZATION ---

async function fetchChannels() {
    try {
        const response = await fetch('/api/channels');
        channels = await response.json();
        renderHome();
        renderExplore();
        renderFavorites();
    } catch (error) {
        console.error('Error fetching channels:', error);
        showToast('Error loading channels', 'error');
    }
}

function renderHome() {
    // Featured are just first few for now
    featuredGrid.innerHTML = '';
    channels.slice(0, 10).forEach(channel => {
        const card = document.createElement('div');
        card.className = 'glass p-4 rounded-2xl flex items-center space-x-4 active:scale-95 transition-all';
        card.innerHTML = `
            <img src="${channel.logo}" class="w-12 h-12 rounded-xl object-cover bg-white/5" onerror="this.src='/static/icon-192.png'">
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-bold text-sm truncate">${channel.name}</span>
                <span class="text-[10px] text-blue-500 font-bold uppercase tracking-wider">${channel.group}</span>
            </div>
            <button onclick="toggleFavorite(event, '${channel.name}')" class="p-2 text-white/20 hover:text-red-500 transition">
                <i data-lucide="heart" class="w-5 h-5 ${isFavorite(channel.name) ? 'fill-red-500 text-red-500' : ''}"></i>
            </button>
        `;
        card.onclick = () => openPlayer(channel);
        featuredGrid.appendChild(card);
    });
    lucide.createIcons();
}

function renderExplore(list = channels) {
    allChannelsList.innerHTML = '';
    list.slice(0, 100).forEach(channel => {
        const item = document.createElement('div');
        item.className = 'glass p-4 rounded-2xl flex items-center space-x-4 active:scale-95 transition-all';
        item.innerHTML = `
            <img src="${channel.logo}" class="w-10 h-10 rounded-lg object-cover" onerror="this.src='/static/icon-192.png'">
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-bold text-sm truncate">${channel.name}</span>
                <span class="text-[10px] text-white/30 uppercase">${channel.group}</span>
            </div>
            <i data-lucide="play" class="w-4 h-4 text-blue-500"></i>
        `;
        item.onclick = () => openPlayer(channel);
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
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play();
            updatePlayIcon(true);
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = channel.url;
        video.onloadedmetadata = () => {
            video.play();
            updatePlayIcon(true);
        };
    }
    
    showToast(`Streaming ${channel.name}`);
    resetControlsTimer();
}

function exitPlayer() {
    playerView.style.display = 'none';
    video.pause();
    if (hls) hls.destroy();
    hls = null;
    document.exitFullscreen().catch(() => {});
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
    const icon = document.getElementById('lock-icon');
    icon.setAttribute('data-lucide', isLocked ? 'lock' : 'unlock');
    document.getElementById('lock-overlay').classList.toggle('active', isLocked);
    document.getElementById('controls').style.opacity = isLocked ? '0' : '1';
    lucide.createIcons();
}

function onLockedScreenTouched() {
    const toast = document.getElementById('lock-toast');
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 2000);
}

function toggleAspectRatio() {
    const modes = ['fit', 'fill', 'stretch'];
    const nextIndex = (modes.indexOf(currentAspectRatio) + 1) % modes.length;
    currentAspectRatio = modes[nextIndex];
    video.className = currentAspectRatio;
    showToast(`Mode: ${currentAspectRatio.toUpperCase()}`);
}

function toggleRotate() {
    rotation = (rotation + 90) % 360;
    video.style.transform = `rotate(${rotation}deg)`;
    if (rotation === 90 || rotation === 270) {
        video.style.width = '100vh';
        video.style.height = '100vw';
    } else {
        video.style.width = '100%';
        video.style.height = '100%';
    }
}

// --- GESTURES ---

playerView.addEventListener('touchstart', (e) => {
    if (isLocked) return;
    startY = e.touches[0].clientY;
    const x = e.touches[0].clientX;
    isRightSide = x > window.innerWidth / 2;
    resetControlsTimer();
});

playerView.addEventListener('touchmove', (e) => {
    if (isLocked) return;
    const currentY = e.touches[0].clientY;
    const diff = startY - currentY;
    
    if (isRightSide) {
        updateIndicator('volume', diff / 200);
    } else {
        updateIndicator('brightness', diff / 200);
    }
    startY = currentY;
    e.preventDefault();
}, { passive: false });

function updateIndicator(type, delta) {
    const indicator = document.getElementById(`${type}-v`);
    const bar = document.getElementById(type === 'volume' ? 'vol-bar' : 'br-bar');
    
    if (type === 'volume') {
        video.volume = Math.max(0, Math.min(1, video.volume + delta));
        bar.style.height = `${video.volume * 100}%`;
    } else {
        // Brightness simulation
        let br = parseFloat(video.style.filter.replace('brightness(', '').replace(')', '')) || 1;
        br = Math.max(0.2, Math.min(1.5, br + delta));
        video.style.filter = `brightness(${br})`;
        bar.style.height = `${(br / 1.5) * 100}%`;
    }
    
    indicator.style.opacity = '1';
    clearTimeout(indicator.to);
    indicator.to = setTimeout(() => indicator.style.opacity = '0', 1000);
}

// --- PAGE NAVIGATION ---

function switchPage(pageId) {
    const pages = ['home', 'explore', 'favorites', 'settings'];
    pages.forEach(p => {
        const pageEl = document.getElementById(`page-${p}`);
        const navEl = document.getElementById(`nav-${p}`);
        
        if (p === pageId) {
            pageEl.classList.remove('hidden-left', 'hidden-right');
            pageEl.style.display = 'block'; // Ensure visibility
            navEl.classList.add('active');
        } else {
            pageEl.classList.add(pages.indexOf(p) < pages.indexOf(pageId) ? 'hidden-left' : 'hidden-right');
            navEl.classList.remove('active');
        }
    });
}

// --- CHANNEL UTILS ---

function filterByGroup(group) {
    // UI update for chips
    document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.textContent.includes(group));
    });

    switchPage('explore'); // Switch to search/library view

    if (group === 'All') {
        renderExplore(channels);
    } else {
        const filtered = channels.filter(c => 
            c.group.toLowerCase().includes(group.toLowerCase()) || 
            c.name.toLowerCase().includes(group.toLowerCase())
        );
        renderExplore(filtered);
    }
}

// --- FAVORITES ---

function toggleFavorite(e, name) {
    e.stopPropagation();
    let favs = JSON.parse(localStorage.getItem('favs') || '[]');
    if (favs.includes(name)) {
        favs = favs.filter(f => f !== name);
    } else {
        favs.push(name);
    }
    localStorage.setItem('favs', JSON.stringify(favs));
    renderHome();
    renderFavorites();
}

function isFavorite(name) {
    const favs = JSON.parse(localStorage.getItem('favs') || '[]');
    return favs.includes(name);
}

function renderFavorites() {
    const favs = JSON.parse(localStorage.getItem('favs') || '[]');
    const favChannels = channels.filter(c => favs.includes(c.name));
    
    if (favChannels.length === 0) {
        favoritesList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-white/30 space-y-4">
                <i data-lucide="heart" class="w-16 h-16 opacity-10"></i>
                <p>No favorites yet</p>
            </div>
        `;
    } else {
        favoritesList.innerHTML = '';
        favChannels.forEach(channel => {
            const item = document.createElement('div');
            item.className = 'glass p-4 rounded-2xl flex items-center space-x-4';
            item.innerHTML = `
                <img src="${channel.logo}" class="w-10 h-10 rounded-lg object-cover" onerror="this.src='/static/icon-192.png'">
                <div class="flex flex-col flex-grow">
                    <span class="font-bold text-sm">${channel.name}</span>
                </div>
                <button onclick="toggleFavorite(event, '${channel.name}')" class="text-red-500"><i data-lucide="heart" class="fill-red-500 w-5 h-5"></i></button>
            `;
            item.onclick = () => openPlayer(channel);
            favoritesList.appendChild(item);
        });
    }
    lucide.createIcons();
}

// --- SEARCH ---

function toggleSearch() {
    searchModal.classList.toggle('hidden');
    searchModal.classList.toggle('flex');
    if (!searchModal.classList.contains('hidden')) globalSearch.focus();
}

globalSearch.oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const results = channels.filter(c => c.name.toLowerCase().includes(q)).slice(0, 20);
    searchResults.innerHTML = '';
    results.forEach(c => {
        const item = document.createElement('div');
        item.className = 'glass p-4 rounded-2xl flex items-center space-x-4';
        item.innerHTML = `
            <img src="${c.logo}" class="w-10 h-10 rounded-lg object-cover" onerror="this.src='/static/icon-192.png'">
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-bold text-sm truncate">${c.name}</span>
            </div>
        `;
        item.onclick = () => { openPlayer(c); toggleSearch(); };
        searchResults.appendChild(item);
    });
};

// --- MISC ---

function resetControlsTimer() {
    const ctrl = document.getElementById('controls');
    ctrl.style.opacity = '1';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (!video.paused && !isLocked) ctrl.style.opacity = '0';
    }, 4000);
}

function showToast(msg) {
    const t = document.getElementById('global-toast');
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translate(-50%, 20px)';
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translate(-50%, 0)'; }, 2000);
}

// Aspect Ratio Helper
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        playerView.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function skip(s) {
    video.currentTime += s;
    showToast(`${s > 0 ? '+' : ''}${s}s`);
}

// Bindings
document.getElementById('play-pause-btn').onclick = togglePlay;
video.onclick = resetControlsTimer;

// Init
fetchChannels();
switchPage('home');

// --- PWA INSTALLATION ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-banner').classList.remove('hidden');
});

document.getElementById('install-btn').onclick = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('install-banner').classList.add('hidden');
        }
        deferredPrompt = null;
    }
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
}
