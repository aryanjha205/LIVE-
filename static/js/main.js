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

let movies = [];
let trendingMovies = [];
let hls = null;
let isLocked = false;
let currentAspectRatio = 'fill';
let rotation = 0;
let controlsTimeout;
let startY = 0;
let isRightSide = false;

// User state
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// --- INITIALIZATION ---



async function fetchMovies() {
    console.log("Fetching movies...");
    try {
        const response = await fetch('/api/movies');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        movies = await response.json();
        console.log(`Loaded ${movies.length} movies.`);
        
        fetchDiscover();
        renderExplore();
        renderFavorites();
        renderRecent();
    } catch (error) {
        console.error('Movie Fetch ERROR:', error);
        showToast('Server Unreachable', 'error');
    }
}

async function fetchDiscover() {
    try {
        const res = await fetch('/api/discover');
        trendingMovies = await res.json();
        renderHome();
    } catch (e) {
        console.error(e);
        renderHome();
    }
}

function renderCategories() {
    const catScroll = document.getElementById('cat-scroll');
    if (!catScroll) return;
    
    const groups = ['All', ...new Set(channels.map(c => c.group))].filter(g => g && g !== 'General').slice(0, 15);
    catScroll.innerHTML = groups.map(g => `
        <div class="chip ${g === 'All' ? 'active' : ''}" onclick="filterByGroup('${g}')">${g}</div>
    `).join('');
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
        
        if (!res.ok) {
            let errorMsg = `Server returned ${res.status}`;
            try {
                const errorData = await res.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                // Not JSON
            }
            throw new Error(errorMsg);
        }
        
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
        
        if (!res.ok) {
            let errorMsg = "Verification failed";
            try {
                const errorData = await res.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        if (data.is_new_user) {
            // Start Step-by-Step Onboarding
            authStep2.classList.add('hidden');
            document.getElementById('auth-step-name').classList.remove('hidden');
            showToast("Welcome! Let's set up your profile.");
        } else {
            // Regular Login
            authOverlay.style.display = 'none';
            switchPage('home');
            updateUIWithUser();
            fetchChannels();
            showToast("Welcome back to Live+!");
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        document.getElementById('verify-otp-btn').innerText = "Verify & Login";
    }
}

function nextSetupStep(step) {
    if (step === 'age') {
        const name = document.getElementById('setup-name').value.trim();
        if (!name) return showToast("Please enter your name");
        currentUser.name = name;
        document.getElementById('auth-step-name').classList.add('hidden');
        document.getElementById('auth-step-age').classList.remove('hidden');
    }
}

async function finishSetup() {
    const age = document.getElementById('setup-age').value;
    if (!age) return showToast("Please enter your age");
    currentUser.age = age;
    
    document.getElementById('verify-otp-btn').innerText = "Finalizing...";
    
    try {
        await fetch('/api/profile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: currentUser.email,
                name: currentUser.name,
                bio: currentUser.bio,
                age: currentUser.age,
                avatar: currentUser.avatar
            })
        });
        
        localStorage.setItem('user', JSON.stringify(currentUser));
        authOverlay.style.display = 'none';
        switchPage('home');
        updateUIWithUser();
        fetchChannels();
        showToast("Profile set up successfully!");
    } catch (e) {
        showToast("Could not save profile");
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
    document.getElementById('user-age-display').innerText = `Age: ${currentUser.age || 'Not set'}`;
    document.getElementById('user-avatar-small').src = currentUser.avatar;
    document.getElementById('user-avatar-large').src = currentUser.avatar;
    document.getElementById('edit-name').value = currentUser.name;
    document.getElementById('edit-bio').value = currentUser.bio || "";
    document.getElementById('edit-age').value = currentUser.age || "";
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
    const age = document.getElementById('edit-age').value;
    
    try {
        const res = await fetch('/api/profile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: currentUser.email,
                name: name,
                bio: bio,
                age: age,
                avatar: currentUser.avatar
            })
        });
        currentUser.name = name;
        currentUser.bio = bio;
        currentUser.age = age;
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
    const grid = document.getElementById('featured-grid');
    const movieGrid = document.getElementById('trending-movies-grid');
    if (!grid || !movieGrid) return;
    
    grid.innerHTML = '';
    movieGrid.innerHTML = '';
    
    const items = trendingMovies.length ? trendingMovies : movies.slice(0, 12);
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'group relative aspect-[2/3] rounded-[32px] overflow-hidden glass hover:scale-[1.02] active:scale-95 transition-all duration-500 cursor-pointer shadow-2xl';
            
        card.innerHTML = `
            <img src="${item.logo}" class="absolute inset-0 w-full h-full object-cover" onerror="this.src='/static/icon-192.png'">
            <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-100 group-hover:via-black/40 transition-all duration-500"></div>
            <div class="absolute bottom-6 left-6 right-6 translate-y-2 group-hover:translate-y-0 transition-all duration-500">
                <p class="text-[10px] text-blue-400 font-bold uppercase tracking-[4px] mb-2">${item.genres[0] || 'Movie'}</p>
                <h4 class="font-black text-xl leading-tight truncate px-0.5">${item.name}</h4>
                <div class="flex items-center space-x-2 mt-2">
                    <span class="px-3 py-1 bg-white/10 backdrop-blur text-[10px] font-black rounded-lg">${item.year} &bull; ${item.rating}</span>
                </div>
            </div>
        `;
        card.onclick = () => openPlayer(item);
        grid.appendChild(card);
    });

    if (movies.length) {
        movies.slice(0, 20).forEach(m => {
            const card = document.createElement('div');
            card.className = 'flex-shrink-0 w-44 rounded-[32px] glass p-1 aspect-[2/3] group relative overflow-hidden active:scale-95 transition-all duration-300 cursor-pointer shadow-xl border border-white/5';
            card.innerHTML = `
                <img src="${m.logo}" class="absolute inset-0 w-full h-full object-cover rounded-[32px]">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                <div class="absolute bottom-4 left-4 right-4">
                    <h4 class="font-bold text-[10px] truncate w-32 uppercase tracking-tighter">${m.name}</h4>
                </div>
            `;
            card.onclick = () => openPlayer(m);
            movieGrid.appendChild(card);
        });
    }
    lucide.createIcons();
}

function renderExplore(list = movies) {
    const listContainer = document.getElementById('all-channels-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    list.forEach(m => {
        const item = document.createElement('div');
        item.className = 'glass p-2 rounded-[32px] flex items-center space-x-4 shadow hover:bg-white/5 transition active:scale-95 cursor-pointer border border-white/5 relative group';
        item.innerHTML = `
            <div class="relative w-20 h-28 flex-shrink-0">
                <img src="${m.logo}" class="w-full h-full rounded-2xl object-cover bg-white/5 shadow-lg" onerror="this.src='/static/icon-192.png'">
            </div>
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-black text-lg truncate uppercase tracking-tight text-white/90">${m.name}</span>
                <span class="text-[10px] text-white/40 font-bold uppercase tracking-[2px] mt-0.5">${m.genres.join(', ')}</span>
                <span class="text-blue-500 font-bold text-xs mt-2 italic">${m.year} &bull; Rating: ${m.rating}</span>
            </div>
            <div class="pr-6">
                <button onclick="event.stopPropagation(); toggleFavorite(event, '${m.name.replace(/'/g, "\\'")}')" class="p-3 glass rounded-full">
                    <i data-lucide="heart" class="w-5 h-5 ${isFavorite(m.name) ? 'fill-red-500 text-red-500' : ''}"></i>
                </button>
            </div>
        `;
        item.onclick = () => openPlayer(m);
        listContainer.appendChild(item);
    });
    lucide.createIcons();
}

function openPlayer(movie) {
    // For a YTS site, we show details since direct streaming is complex
    showToast(`Streaming ${movie.name}...`, 'info');
    playerView.style.display = 'block';
    document.getElementById('player-channel-name').textContent = movie.name;
    
    // We could potentially use a peer-to-peer or third party player here
    // But for this GUI task, we just show a backdrop and info
    video.poster = movie.image;
    video.src = '';
    
    const controls = document.getElementById('controls');
    // Hide seeker for now as it's a showcase
    showToast("Press Play to watch Trailer (Simulated)", "info");
    
    addToRecent(movie);
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

// Add these listeners at end of file after DOM elements are defined
video.onclick = togglePlay;
document.getElementById('play-pause-btn').onclick = togglePlay;

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

playerView.addEventListener('mousemove', () => {
    if (isLocked) return;
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
    if (!q) { searchResults.innerHTML = ''; return; }
    
    const res = movies.filter(m => m.name.toLowerCase().includes(q) || m.genres.some(g => g.toLowerCase().includes(q))).slice(0, 30);
    searchResults.innerHTML = '';
    res.forEach(m => {
        const item = document.createElement('div');
        item.className = 'glass p-5 rounded-[28px] flex items-center space-x-4 active:scale-95 transition';
        item.innerHTML = `
            <img src="${m.logo}" class="w-12 h-16 rounded-lg object-cover bg-white/5" onerror="this.src='/static/icon-192.png'">
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-bold text-base truncate">${m.name}</span>
                <span class="text-[10px] text-blue-500 font-bold uppercase tracking-widest">${m.year}</span>
            </div>
            <div class="p-3"><i data-lucide="play" class="w-5 h-5 text-white/20"></i></div>
        `;
        item.onclick = () => { openPlayer(m); toggleSearch(); };
        searchResults.appendChild(item);
    });
    lucide.createIcons();
};

function filterByGroup(genre) {
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.textContent.includes(genre)));
    switchPage('explore');
    renderExplore(genre === 'All' ? movies : movies.filter(m => m.genres.includes(genre)));
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
    const list = movies.filter(m => favs.includes(m.name));
    favoritesList.innerHTML = list.length === 0 ? '<p class="text-center py-20 opacity-20">Empty Movies Library</p>' : '';
    list.forEach(m => {
        const item = document.createElement('div');
        item.className = 'glass p-5 rounded-[28px] flex items-center space-x-4';
        item.innerHTML = `<img src="${m.logo}" class="w-12 h-16 rounded-lg object-cover"><div class="flex-grow font-bold">${m.name}</div><i data-lucide="heart" class="fill-red-500 text-red-500 w-5 h-5"></i>`;
        item.onclick = () => openPlayer(m);
        favoritesList.appendChild(item);
    });
    lucide.createIcons();
}

// --- NEW FEATURES ---

function addToRecent(channel) {
    let recents = JSON.parse(localStorage.getItem('recents') || '[]');
    recents = [channel, ...recents.filter(c => c.url !== channel.url)].slice(0, 5);
    localStorage.setItem('recents', JSON.stringify(recents));
    renderRecent();
}

function renderRecent() {
    const section = document.getElementById('recent-section');
    const scroll = document.getElementById('recent-scroll');
    const recents = JSON.parse(localStorage.getItem('recents') || '[]');
    
    if (recents.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    scroll.innerHTML = recents.map(c => `
        <div onclick='openPlayer(${JSON.stringify(c)})' class="flex-shrink-0 w-20 text-center space-y-2">
            <div class="w-16 h-16 rounded-2xl glass p-1 mx-auto overflow-hidden">
                <img src="${c.logo}" class="w-full h-full object-cover rounded-xl" onerror="this.src='/static/icon-192.png'">
            </div>
            <p class="text-[10px] font-bold truncate opacity-60">${c.name}</p>
        </div>
    `).join('');
}

function copyShareLink() {
    const channelName = document.getElementById('player-channel-name').innerText;
    const dummyLink = `https://liveplus.app/watch?channel=${encodeURIComponent(channelName)}`;
    navigator.clipboard.writeText(dummyLink).then(() => {
        showToast("Share Link Copied!");
    });
}

let sleepTimer = null;
function toggleSleepTimer() {
    if (sleepTimer) {
        clearTimeout(sleepTimer);
        sleepTimer = null;
        showToast("Sleep Timer Off");
    } else {
        sleepTimer = setTimeout(() => {
            exitPlayer();
            showToast("Sleep Timer: Stream Stopped");
        }, 30 * 60 * 1000); // 30 mins
        showToast("Sleep Timer: 30 Minutes Set");
    }
}

function showToast(msg, type='info') {
    const t = document.getElementById('global-toast');
    t.innerText = msg;
    t.style.opacity = '1';
    t.style.top = '10%';
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.top = '8%';
    }, 3000);
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
async function init() {
    if (currentUser) {
        authOverlay.style.display = 'none';
        switchPage('home');
        updateUIWithUser();
        fetchMovies();
    }
    
    // Add keyboard support for forms
    authEmail.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendOTP(); });
    otpInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') verifyOTP(); });

    // PC Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (playerView.style.display === 'block') {
            if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
            if (e.code === 'ArrowLeft') skip(-10);
            if (e.code === 'ArrowRight') skip(10);
            if (e.code === 'Escape') exitPlayer();
            if (e.code === 'ArrowUp') { video.volume = Math.min(1, video.volume + 0.1); showToast(`Volume: ${Math.round(video.volume * 100)}%`); }
            if (e.code === 'ArrowDown') { video.volume = Math.max(0, video.volume - 0.1); showToast(`Volume: ${Math.round(video.volume * 100)}%`); }
        }
    });
}

init();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(e => console.log("SW Register Error:", e));
}
