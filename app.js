// Ensure CONFIG is loaded
if (!CONFIG || CONFIG.TMDB_TOKEN === "YOUR_TMDB_READ_ACCESS_TOKEN") {
    document.body.innerHTML = `<div style="text-align:center; padding:100px;"><h1>Setup Required</h1><p>Please add your TMDB API token in config.js</p></div>`;
    throw new Error("TMDB Token missing.");
}

// Global State
let currentItem = null; 
let watchlist = JSON.parse(localStorage.getItem('streamforge_watchlist')) || [];
let progress = JSON.parse(localStorage.getItem('streamforge_progress')) || {};

// API Helper
async function fetchTMDB(endpoint) {
    try {
        // Properly construct URL with parameters
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${CONFIG.API_BASE}${endpoint}${separator}language=en-US&page=1`;
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${CONFIG.TMDB_TOKEN}`,
                accept: "application/json"
            }
        });
        if (!res.ok) {
            console.error(`API Error: ${res.status} ${res.statusText}`);
            throw new Error('API Error');
        }
        return await res.json();
    } catch (err) {
        console.error("fetchTMDB error:", err);
        return null;
    }
}

// App Initialization
document.addEventListener("DOMContentLoaded", () => {
    initHome();
    setupEventListeners();
    setupScrollEffect();
});

function setupScrollEffect() {
    window.addEventListener('scroll', () => {
        const header = document.getElementById('site-header');
        if (window.scrollY > 50) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    });
}

// --- Views Rendering ---

async function initHome() {
    const main = document.getElementById('sections-container');
    main.innerHTML = ''; // Clear
    
    // Load Hero
    const trending = await fetchTMDB('/trending/all/day');
    if (trending && trending.results) {
        renderHero(trending.results[Math.floor(Math.random() * 5)]);
    }

    // Load Sections
    renderSection('Continue Watching', getContinueWatching(), true);
    await loadApiSection('Trending Now', '/trending/all/week');
    await loadApiSection('Popular Movies', '/movie/popular');
    await loadApiSection('Top Rated TV Shows', '/tv/top_rated');
}

async function loadApiSection(title, endpoint) {
    const data = await fetchTMDB(endpoint);
    if (data && data.results) {
        renderSection(title, data.results);
    }
}

function renderHero(item) {
    const hero = document.getElementById('hero');
    hero.classList.remove('skeleton-hero');
    const title = item.title || item.name;
    const type = item.media_type || (item.title ? 'movie' : 'tv');
    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    const bgUrl = `${CONFIG.IMG_BASE_ORIGINAL}${item.backdrop_path}`;
    
    hero.style.backgroundImage = `url(${bgUrl})`;
    hero.innerHTML = `
        <div class="hero-content">
            <div class="hero-meta">
                <span class="type">${type.toUpperCase()}</span>
                <span>${year}</span>
                <span><i class="ph-fill ph-star"></i> ${item.vote_average.toFixed(1)}</span>
            </div>
            <h1>${title}</h1>
            <p class="hero-desc">${item.overview}</p>
            <div class="hero-actions">
                <button class="btn primary" onclick="openDetails(${item.id}, '${type}')"><i class="ph-fill ph-info"></i> More Info</button>
            </div>
        </div>
    `;
}

function renderSection(title, items, isProgress = false) {
    if (!items || items.length === 0) return;
    
    const container = document.getElementById('sections-container');
    const section = document.createElement('div');
    section.className = 'section';
    
    let html = `<h2 class="section-title">${title}</h2><div class="grid-container">`;
    
    items.slice(0, 14).forEach(item => {
        const name = item.title || item.name;
        const type = item.media_type || (item.title ? 'movie' : 'tv');
        const poster = item.poster_path ? `${CONFIG.IMG_BASE_W500}${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
        const year = (item.release_date || item.first_air_date || '').split('-')[0];
        
        let progressHtml = '';
        if (isProgress && item.percent) {
            progressHtml = `<div class="progress-container"><div class="progress-bar" style="width: ${item.percent}%"></div></div>`;
        }

        html += `
            <div class="card" onclick="openDetails(${item.id}, '${type}')">
                <img src="${poster}" alt="${name}" loading="lazy">
                ${progressHtml}
                <div class="card-overlay">
                    <i class="ph-fill ph-play-circle"></i>
                </div>
                <div class="card-info">
                    <h3>${name}</h3>
                    <span>${year} • ${type.toUpperCase()}</span>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    section.innerHTML = html;
    container.appendChild(section);
}

// --- Modals & Details ---

async function openDetails(id, type) {
    const modal = document.getElementById('details-modal');
    modal.classList.remove('hidden');
    
    // Fetch full details
    const data = await fetchTMDB(`/${type}/${id}`);
    if (!data) return;
    currentItem = { ...data, media_type: type };

    const title = data.title || data.name;
    const year = (data.release_date || data.first_air_date || '').split('-')[0];
    const bgUrl = data.backdrop_path ? `${CONFIG.IMG_BASE_ORIGINAL}${data.backdrop_path}` : '';
    
    document.getElementById('details-hero').style.backgroundImage = `url(${bgUrl})`;
    document.getElementById('details-title').textContent = title;
    document.getElementById('details-year').textContent = year;
    document.getElementById('rating-val').textContent = data.vote_average.toFixed(1);
    document.getElementById('details-runtime').textContent = type === 'movie' ? `${data.runtime}m` : `${data.number_of_seasons} Seasons`;
    document.getElementById('details-genres').textContent = data.genres.map(g => g.name).join(', ');
    document.getElementById('details-overview').textContent = data.overview;
    
    // Watchlist Btn State
    const addBtn = document.getElementById('add-list-btn');
    const inList = watchlist.some(i => i.id === id);
    addBtn.innerHTML = inList ? `<i class="ph ph-check"></i> In List` : `<i class="ph ph-plus"></i> My List`;

    // TV Controls
    const tvControls = document.getElementById('tv-controls');
    if (type === 'tv') {
        tvControls.classList.remove('hidden');
        const sSelect = document.getElementById('season-selector');
        sSelect.innerHTML = data.seasons.filter(s => s.season_number > 0).map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`).join('');
        
        sSelect.onchange = () => loadEpisodes(id, sSelect.value);
        if (data.seasons.length > 0) loadEpisodes(id, sSelect.value || 1);
    } else {
        tvControls.classList.add('hidden');
    }
}

async function loadEpisodes(tvId, seasonNum) {
    const data = await fetchTMDB(`/tv/${tvId}/season/${seasonNum}`);
    const eSelect = document.getElementById('episode-selector');
    if (data && data.episodes) {
        eSelect.innerHTML = data.episodes.map(e => `<option value="${e.episode_number}">Ep ${e.episode_number}: ${e.name}</option>`).join('');
    }
}

// --- Player (Vidking) ---

document.getElementById('watch-btn').addEventListener('click', () => {
    if (!currentItem) return;
    
    const playerModal = document.getElementById('player-modal');
    const iframe = document.getElementById('vidking-player');
    const title = currentItem.title || currentItem.name;
    
    let url = "";
    if (currentItem.media_type === 'movie') {
        url = `https://www.vidking.net/embed/movie/${currentItem.id}?color=${CONFIG.VIDKING_COLOR}`;
        document.getElementById('player-title').textContent = `Playing: ${title}`;
    } else {
        const s = document.getElementById('season-selector').value || 1;
        const e = document.getElementById('episode-selector').value || 1;
        url = `https://www.vidking.net/embed/tv/${currentItem.id}/${s}/${e}?color=${CONFIG.VIDKING_COLOR}&nextEpisode=true&episodeSelector=true`;
        document.getElementById('player-title').textContent = `Playing: ${title} (S${s} E${e})`;
    }

    iframe.src = url;
    playerModal.classList.remove('hidden');
    document.getElementById('details-modal').classList.add('hidden'); // Close details
});

document.getElementById('close-player').addEventListener('click', () => {
    document.getElementById('player-modal').classList.add('hidden');
    document.getElementById('vidking-player').src = ""; // Stop video
});

// --- Watch Progress Tracking ---
window.addEventListener("message", function(event) {
    if (typeof event.data !== "string") return;
    try {
        const msg = JSON.parse(event.data);
        if (msg.type === "PLAYER_EVENT" && msg.data.event === "timeupdate") {
            if(!currentItem) return;
            const percent = (msg.data.currentTime / msg.data.duration) * 100;
            
            progress[currentItem.id] = {
                ...currentItem,
                percent: percent.toFixed(1),
                timestamp: Date.now()
            };
            localStorage.setItem('streamforge_progress', JSON.stringify(progress));
        }
    } catch (e) {}
});

function getContinueWatching() {
    return Object.values(progress).sort((a,b) => b.timestamp - a.timestamp).filter(i => i.percent > 2 && i.percent < 95);
}

// --- Watchlist (My List) ---

document.getElementById('add-list-btn').addEventListener('click', () => {
    if (!currentItem) return;
    const exists = watchlist.findIndex(i => i.id === currentItem.id);
    if (exists >= 0) {
        watchlist.splice(exists, 1);
        document.getElementById('add-list-btn').innerHTML = `<i class="ph ph-plus"></i> My List`;
    } else {
        watchlist.push(currentItem);
        document.getElementById('add-list-btn').innerHTML = `<i class="ph ph-check"></i> In List`;
    }
    localStorage.setItem('streamforge_watchlist', JSON.stringify(watchlist));
});

function renderMyList() {
    document.getElementById('hero').style.display = 'none';
    const main = document.getElementById('sections-container');
    main.innerHTML = '';
    
    if (watchlist.length === 0) {
        main.innerHTML = `<div style="text-align:center; padding:100px; color:var(--muted);"><h2>Your list is empty.</h2><p>Add shows and movies to watch them later.</p></div>`;
    } else {
        renderSection('My List', watchlist.reverse());
    }
}

// --- Search ---

document.getElementById('search-btn').addEventListener('click', () => {
    document.getElementById('search-overlay').classList.remove('hidden');
    document.getElementById('search-input').focus();
});
document.getElementById('close-search').addEventListener('click', () => {
    document.getElementById('search-overlay').classList.add('hidden');
});

let searchTimeout;
document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;
    if (query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    searchTimeout = setTimeout(async () => {
        const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
        if (data && data.results) {
            const container = document.getElementById('search-results');
            container.innerHTML = '';
            
            const validResults = data.results.filter(i => i.media_type !== 'person' && i.poster_path);
            if (validResults.length === 0) {
                container.innerHTML = '<p style="color:var(--muted); padding:20px;">No results found.</p>';
                return;
            }

            validResults.forEach(item => {
                const name = item.title || item.name;
                const poster = `${CONFIG.IMG_BASE_W500}${item.poster_path}`;
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `<img src="${poster}"><div class="card-info"><h3>${name}</h3></div>`;
                card.onclick = () => {
                    document.getElementById('search-overlay').classList.add('hidden');
                    openDetails(item.id, item.media_type);
                };
                container.appendChild(card);
            });
        }
    }, 500);
});

// --- Navigation ---
function setupEventListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
            
            const view = e.target.getAttribute('data-view');
            if (view === 'home') {
                document.getElementById('hero').style.display = 'flex';
                initHome();
            } else if (view === 'mylist') {
                renderMyList();
            } else if (view === 'movies') {
                document.getElementById('hero').style.display = 'none';
                document.getElementById('sections-container').innerHTML = '';
                loadApiSection('Popular Movies', '/movie/popular');
                loadApiSection('Top Rated Movies', '/movie/top_rated');
                loadApiSection('Upcoming', '/movie/upcoming');
            } else if (view === 'tv') {
                document.getElementById('hero').style.display = 'none';
                document.getElementById('sections-container').innerHTML = '';
                loadApiSection('Popular TV Shows', '/tv/popular');
                loadApiSection('Airing Today', '/tv/airing_today');
            }
        });
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });
}
