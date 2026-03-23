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
const playerLoader = document.getElementById('player-loader');
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
let currentAspectRatio = 'fill';
let rotation = 0;
let controlsTimeout;
let startY = 0;
let isRightSide = false;

// User state
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// --- INITIALIZATION ---



async function fetchChannels(retryCount = 0) {
    console.log(`Fetching channels (Attempt ${retryCount + 1})...`);
    const loadingElem = document.getElementById('category-rows');
    if (loadingElem && retryCount === 0) loadingElem.innerHTML = '<div class="py-20 text-center opacity-40"><div class="premium-loader mx-auto mb-6"></div><p class="text-[10px] font-bold uppercase tracking-[4px]">Initializing Premium Experience...</p></div>';
    
    try {
        const response = await fetch('/api/channels');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        channels = await response.json();
        console.log(`Loaded ${channels.length} channels.`);
        
        if (!channels || channels.length === 0 || channels[0].name === "Server Maintenance") {
             if (retryCount < 2) {
                 setTimeout(() => fetchChannels(retryCount + 1), 3000);
                 return;
             }
             showToast('Service update in progress. Please refresh.', 'info');
        }
        
        renderHome();
        renderExplore();
        renderFavorites();
        renderRecent();
        
        // Hide auth if already logged in
        if (currentUser) {
            authOverlay.style.display = 'none';
        }
    } catch (error) {
        console.error('Channel Fetch ERROR:', error);
        if (retryCount < 2) {
             setTimeout(() => fetchChannels(retryCount + 1), 5000);
             return;
        }
        showToast('Connection unstable. Retrying...', 'error');
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
    const container = document.getElementById('category-rows');
    if (!container || !channels.length) return;
    container.innerHTML = '';
    
    // 1. Recently Watched
    renderRecent(); // This now updates #recent-section

    // 2. Intelligent Categorization
    const categoryMap = {
        'News': ['News', 'Local News', 'Live News', 'Hindi News', 'English News'],
        'Movies': ['Movies', 'Cinema', 'Hindi Movies', 'English Movies', 'South Movies'],
        'Sports': ['Sports', 'Cricket', 'Live Sports'],
        'Music': ['Music', 'Bollywood Music', 'Classical Music'],
        'Entertainment': ['Entertainment', 'GEC', 'Series', 'General'],
        'Kids': ['Kids', 'Animation', 'Cartoon'],
        'Religious': ['Religious', 'Spiritual', 'Devotional']
    };

    const categories = {};
    channels.forEach(ch => {
        let group = ch.group || 'General';
        // Normalize group
        for (const [key, aliases] of Object.entries(categoryMap)) {
            if (aliases.some(a => group.includes(a))) {
                group = key;
                break;
            }
        }
        if (!categories[group]) categories[group] = [];
        categories[group].push(ch);
    });

    // Priority Order for categories
    const priority = ['News', 'Movies', 'Sports', 'Entertainment', 'Music', 'Kids', 'Religious'];
    
    // Sort & Render
    [...priority, ...Object.keys(categories).filter(k => !priority.includes(k))]
        .filter(cat => categories[cat] && categories[cat].length > 0)
        .slice(0, 10)
        .forEach(catName => {
            container.appendChild(createCategoryRow(catName, categories[catName].slice(0, 30)));
        });
}

function createCategoryRow(title, itemArray) {
    const row = document.createElement('div');
    row.className = 'space-y-6';
    row.innerHTML = `
        <div class="flex items-center justify-between px-1">
            <h3 class="text-xl font-black text-white/90 tracking-tight">${title}</h3>
            <span onclick="switchPage('explore')" class="text-[10px] text-blue-500 font-bold uppercase tracking-[3px] cursor-pointer hover:underline">View All</span>
        </div>
        <div class="flex space-x-6 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory" id="row-${title.replace(/\s+/g, '-')}">
            <!-- Items added via JS for safety -->
        </div>
    `;
    
    const slider = row.querySelector('.no-scrollbar');
    itemArray.forEach(ch => {
        const item = document.createElement('div');
        item.className = 'min-w-[280px] sm:min-w-[340px] snap-start py-4';
        item.onclick = () => openPlayer(ch);
        item.innerHTML = `
            <div class="channel-card glass border-white/[0.03] group p-6 hover:border-indigo-500/30">
                <div class="flex items-center space-x-6 relative z-10">
                    <div class="w-20 h-20 rounded-[28px] bg-white/[0.03] p-4 flex items-center justify-center border border-white/5 group-hover:border-indigo-500/20 group-hover:bg-white/[0.05] transition-all duration-500 shadow-xl">
                        <img src="${ch.logo}" class="w-full h-full object-contain" onerror="this.src='/static/icon-192.png'">
                    </div>
                    <div class="flex-grow min-w-0">
                        <p class="text-[9px] text-indigo-400 font-black uppercase tracking-[3px] mb-1.5">${ch.group}</p>
                        <h4 class="text-white font-black text-lg truncate tracking-tight group-hover:text-indigo-100 transition-colors uppercase italic">${ch.name}</h4>
                    </div>
                </div>
                <div class="absolute right-6 bottom-6 w-12 h-12 rounded-2xl mx-gradient flex items-center justify-center shadow-lg transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                    <i data-lucide="play" class="w-6 h-6 text-white fill-white ml-1"></i>
                </div>
            </div>
        `;
        slider.appendChild(item);
    });
    
    lucide.createIcons({ scope: row });
    return row;
}

function renderExplore(list = channels) {
    const listContainer = document.getElementById('all-channels-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    // Show ALL channels in Explore
    list.forEach(c => {
        const item = document.createElement('div');
        item.className = 'glass p-6 rounded-[32px] flex items-center space-x-5 shadow-lg hover:bg-white/[0.04] transition-all active:scale-[0.98] cursor-pointer border border-white/[0.03] group relative overflow-hidden';
        item.innerHTML = `
            <div class="relative w-14 h-14 flex-shrink-0">
                <img src="${c.logo}" class="w-full h-full rounded-[20px] object-contain bg-white/5 border border-white/5 shadow-inner" onerror="this.src='/static/icon-192.png'">
                <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-black rounded-full shadow-lg"></div>
            </div>
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-black text-md truncate uppercase tracking-tight text-white/90 group-hover:text-indigo-300 transition-colors">${c.name}</span>
                <span class="text-[10px] text-indigo-400/60 font-black uppercase tracking-[3px] mt-1">${c.group}</span>
            </div>
            <div class="flex items-center space-x-3">
                <button onclick="event.stopPropagation(); toggleFavorite(event, '${c.name.replace(/'/g, "\\'")}')" class="p-3 glass rounded-2xl border-white/5 hover:border-red-500/20 transition-all">
                    <i data-lucide="heart" class="w-4 h-4 ${isFavorite(c.name) ? 'fill-red-500 text-red-500' : 'text-white/20'}"></i>
                </button>
                <div class="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500 group-hover:border-transparent transition-all shadow-indigo-500/20 group-hover:shadow-lg">
                    <i data-lucide="play" class="w-5 h-5 text-indigo-400 fill-indigo-400 group-hover:text-white group-hover:fill-white transition-all ml-1"></i>
                </div>
            </div>
        `;
        item.onclick = () => openPlayer(c);
        listContainer.appendChild(item);
    });
    lucide.createIcons();
}

// --- PLAYER LOGIC ---

function openPlayer(channel) {
    if (!channel || !channel.url) {
        showToast("Stream URL not found", "error");
        return;
    }
    
    // Fix: Add a CORS Proxy for public m3u8 links that often block referrers
    const finalUrl = `https://corsproxy.io/?${encodeURIComponent(channel.url)}`;
    
    playerView.style.display = 'block';
    playerLoader.classList.remove('hidden');
    document.getElementById('player-channel-name').textContent = channel.name;
    
    // Feature: Add to Recent
    addToRecent(channel);

    const playStream = () => {
        console.log("Stream successfully parsed and starting playback");
        playerLoader.classList.add('hidden');
        video.play().catch(e => {
            console.warn("Autoplay blocked or failed:", e);
            updatePlayIcon(false);
        });
        updatePlayIcon(true);
    };

    if (Hls.isSupported()) {
        console.log("Initializing HLS for:", finalUrl);
        if (hls) hls.destroy();
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 60
        });
        hls.loadSource(finalUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, playStream);
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                console.error("HLS Fatal Error:", data);
                playerLoader.classList.add('hidden');
                showToast("Stream Error: Verify Connection", "error");
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        break;
                }
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalUrl;
        video.onloadedmetadata = playStream;
        video.onerror = () => {
            playerLoader.classList.add('hidden');
            showToast("Native Player Error", "error");
        };
    } else {
        playerLoader.classList.add('hidden');
        showToast("Your browser does not support HLS", "error");
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
    
    const res = channels.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)).slice(0, 30);
    searchResults.innerHTML = '';
    res.forEach(c => {
        const item = document.createElement('div');
        item.className = 'glass p-5 rounded-[28px] flex items-center space-x-4 active:scale-95 transition';
        item.innerHTML = `
            <img src="${c.logo}" class="w-12 h-12 rounded-2xl object-cover bg-white/5" onerror="this.src='/static/icon-192.png'">
            <div class="flex flex-col min-w-0 flex-grow">
                <span class="font-bold text-base truncate">${c.name}</span>
                <span class="text-[10px] text-blue-500 font-bold uppercase tracking-widest">${c.group}</span>
            </div>
            <div class="p-3"><i data-lucide="play" class="w-5 h-5 text-white/20"></i></div>
        `;
        item.onclick = () => { openPlayer(c); toggleSearch(); };
        searchResults.appendChild(item);
    });
    lucide.createIcons();
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

// --- NEW FEATURES ---

function addToRecent(channel) {
    let recents = JSON.parse(localStorage.getItem('recent_channels') || '[]');
    recents = [channel, ...recents.filter(c => c.url !== channel.url)].slice(0, 8);
    localStorage.setItem('recent_channels', JSON.stringify(recents));
    renderRecent();
    // Also re-render home to keep it synced
    renderHome();
}

function renderRecent() {
    const section = document.getElementById('recent-section');
    const scroll = document.getElementById('recent-scroll');
    if (!section || !scroll) return;
    
    // Use 'recent_channels' consistently with renderHome
    const recents = JSON.parse(localStorage.getItem('recent_channels') || '[]');
    
    if (recents.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    scroll.innerHTML = '';
    
    recents.forEach((c, idx) => {
        const item = document.createElement('div');
        item.className = 'flex-shrink-0 w-24 text-center space-y-3 cursor-pointer group';
        item.innerHTML = `
            <div class="w-20 h-20 rounded-[28px] glass p-1 mx-auto overflow-hidden relative border-white/5 group-hover:border-indigo-500/40 group-hover:scale-105 transition-all duration-500 active:scale-95 shadow-xl">
                <img src="${c.logo}" class="w-full h-full object-contain rounded-[24px] bg-white/[0.02]" onerror="this.src='/static/icon-192.png'">
                <div class="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <p class="text-[10px] font-black uppercase italic tracking-tighter text-white/40 group-hover:text-white transition-colors px-1 truncate">${c.name}</p>
        `;
        item.onclick = () => openPlayer(c);
        scroll.appendChild(item);
    });
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
    t.style.top = '12%';
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.top = '10%';
        t.style.transform = 'translateX(-50%) translateY(-10px)';
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
        fetchChannels();
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
