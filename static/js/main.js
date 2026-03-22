// Lucide Icons Initialization
lucide.createIcons();

const video = document.getElementById('video');
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('main-play-icon');
const controls = document.getElementById('controls');
const menuBtn = document.getElementById('menu-btn');
const closeBtn = document.getElementById('close-menu');
const sidebar = document.getElementById('sidebar');
const channelsContainer = document.getElementById('channels-container');
const playerContainer = document.getElementById('player-container');
const searchInput = document.getElementById('search-input');
const loading = document.getElementById('loading');
const currentChannelName = document.getElementById('current-channel-name');

let channels = [];
let filteredChannels = [];
let hls = null;
let controlsTimeout;
let startY = 0;
let isRightSide = false;
let currentVolume = 1;

// --- INITIALIZATION ---

async function fetchChannels() {
    try {
        const response = await fetch('/api/channels');
        channels = await response.json();
        filteredChannels = [...channels];
        renderChannels();
        loading.classList.add('hidden');
    } catch (error) {
        console.error('Error fetching channels:', error);
        showToast('Error loading channels', 'error');
    }
}

function renderChannels(list = filteredChannels) {
    channelsContainer.innerHTML = '';
    list.forEach((channel, index) => {
        const item = document.createElement('div');
        item.className = 'group relative flex items-center space-x-4 p-3 rounded-2xl hover:bg-white/10 cursor-pointer transition-all active:scale-95';
        item.innerHTML = `
            <div class="relative w-12 h-12 flex-shrink-0">
                <img src="${channel.logo}" class="w-full h-full object-cover rounded-xl border border-white/5" alt="${channel.name}" onerror="this.src='https://via.placeholder.com/150?text=TV'">
                <div class="absolute inset-0 bg-blue-600/20 rounded-xl group-hover:opacity-100 opacity-0 transition"></div>
            </div>
            <div class="flex flex-col min-w-0">
                <span class="text-sm font-semibold truncate leading-tight">${channel.name}</span>
                <span class="text-[10px] text-white/40 font-medium uppercase tracking-wider">${channel.group}</span>
            </div>
        `;
        item.onclick = () => {
            loadChannel(channel);
            closeSidebar();
        };
        channelsContainer.appendChild(item);
    });
}

function loadChannel(channel) {
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
    
    currentChannelName.textContent = channel.name;
    showToast(`Playing ${channel.name}`);
}

// --- CONTROLS LOGIC ---

function togglePlay() {
    if (video.paused) {
        video.play();
        updatePlayIcon(true);
    } else {
        video.pause();
        updatePlayIcon(false);
    }
    resetControlsTimer();
}

function updatePlayIcon(isPlaying) {
    playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide.createIcons();
}

function resetControlsTimer() {
    controls.classList.remove('hidden');
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (!video.paused) {
            controls.classList.add('hidden');
        }
    }, 4000);
}

// --- SIDEBAR ---

function openSidebar() { sidebar.classList.remove('closed'); }
function closeSidebar() { sidebar.classList.add('closed'); }

// --- GESTURES (Volume & Brightness) ---

playerContainer.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    const x = e.touches[0].clientX;
    isRightSide = x > window.innerWidth / 2;
    resetControlsTimer();
});

playerContainer.addEventListener('touchmove', (e) => {
    const currentY = e.touches[0].clientY;
    const diff = startY - currentY;
    
    if (isRightSide) {
        // Volume logic
        const change = diff / 200;
        video.volume = Math.max(0, Math.min(1, video.volume + change));
        showIndicator('volume', video.volume * 100);
    } else {
        // Mock Brightness logic (using CSS filter on container)
        const change = diff / 200;
        let brightness = parseFloat(getComputedStyle(video).filter.replace('brightness(', '').replace(')', '')) || 1;
        brightness = Math.max(0.2, Math.min(1.5, brightness + change));
        video.style.filter = `brightness(${brightness})`;
        showIndicator('brightness', (brightness / 1.5) * 100);
    }
    startY = currentY;
    e.preventDefault();
}, { passive: false });

function showIndicator(type, value) {
    const indicator = document.getElementById(`${type}-indicator`);
    const bar = document.getElementById(`${type}-bar`);
    bar.style.height = `${value}%`;
    indicator.style.opacity = '1';
    clearTimeout(indicator.timeout);
    indicator.timeout = setTimeout(() => {
        indicator.style.opacity = '0';
    }, 1000);
}

// --- UTILITIES ---

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        playerContainer.requestFullscreen().catch(err => {
            alert(`Error attempting to enable full-screen mode: ${err.message}`);
        });
        document.getElementById('fs-icon').setAttribute('data-lucide', 'minimize');
    } else {
        document.exitFullscreen();
        document.getElementById('fs-icon').setAttribute('data-lucide', 'maximize');
    }
    lucide.createIcons();
}

async function togglePiP() {
    try {
        if (video !== document.pictureInPictureElement) {
            await video.requestPictureInPicture();
        } else {
            await document.exitPictureInPicture();
        }
    } catch (error) {
        console.error(error);
    }
}

let rotation = 0;
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
    showToast(`Rotated ${rotation}°`);
}

function skip(seconds) {
    video.currentTime += seconds;
    showToast(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('bg-blue-600/90', 'bg-red-500/90');
    toast.classList.add(type === 'error' ? 'bg-red-500/90' : 'bg-blue-600/90');
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, -20px)';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 0)';
    }, 2000);
}

// --- EVENTS ---

playPauseBtn.onclick = togglePlay;
menuBtn.onclick = openSidebar;
closeBtn.onclick = closeSidebar;
video.onclick = resetControlsTimer;

searchInput.oninput = (e) => {
    const query = e.target.value.toLowerCase();
    filteredChannels = channels.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.group.toLowerCase().includes(query)
    );
    renderChannels();
};

// --- SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/service-worker.js');
    });
}

// Initial Fetch
fetchChannels();
resetControlsTimer();
