// Safe storage fallbacks to prevent DOMException when local files block safeStorage/safeSession
const safeStorage = {
    _fallback: {},
    getItem(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return this._fallback[key] || null; }
    },
    setItem(key, val) {
        try { window.localStorage.setItem(key, val); } catch (e) { this._fallback[key] = String(val); }
    },
    removeItem(key) {
        try { window.localStorage.removeItem(key); } catch (e) { delete this._fallback[key]; }
    }
};

const safeSession = {
    _fallback: {},
    getItem(key) {
        try { return window.sessionStorage.getItem(key); } catch (e) { return this._fallback[key] || null; }
    },
    setItem(key, val) {
        try { window.sessionStorage.setItem(key, val); } catch (e) { this._fallback[key] = String(val); }
    },
    removeItem(key) {
        try { window.sessionStorage.removeItem(key); } catch (e) { delete this._fallback[key]; }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // DATABASE INITIALIZATION (LOCAL STORAGE)
    // -------------------------------------------------------------
    let movies = [];
    let users = [];
    let currentUser = null;
    let currentCaptcha = "";
    
    function initDatabase() {
        const stored = safeStorage.getItem("movies_db");
        // One-time clean startup: If old 1TamilBlasters data exists, clear it to start empty
        if (stored && stored.includes("idhayam-murali")) {
            safeStorage.removeItem("movies_db");
            movies = [];
            safeStorage.setItem("movies_db", JSON.stringify(movies));
        } else if (stored) {
            try {
                const rawMovies = JSON.parse(stored);
                // De-duplicate database entries on load
                movies = [];
                const seenIds = new Set();
                rawMovies.forEach(m => {
                    if (m && m.id && !seenIds.has(m.id)) {
                        seenIds.add(m.id);
                        movies.push(m);
                    }
                });
                safeStorage.setItem("movies_db", JSON.stringify(movies));
            } catch (e) {
                console.error("Failed to parse movies_db:", e);
                movies = [];
                safeStorage.setItem("movies_db", JSON.stringify(movies));
            }
        } else {
            movies = INITIAL_MOVIES;
            safeStorage.setItem("movies_db", JSON.stringify(movies));
        }

        // Initialize Users DB (Seed main admin ElamparithiS)
        const storedUsers = safeStorage.getItem("users_db");
        if (storedUsers) {
            try {
                users = JSON.parse(storedUsers) || [];
            } catch (e) {
                console.error("Failed to parse users_db:", e);
                users = [];
            }
            
            // Ensure main admin ElamparithiS always exists with correct credentials
            let adminUser = users.find(u => u.username === "ElamparithiS");
            if (!adminUser) {
                adminUser = {
                    name: "Elamparithi S",
                    username: "ElamparithiS",
                    password: "Elampreethi0515@",
                    email: "smartelam12@gmail.com",
                    status: "approved",
                    role: "admin",
                    membership: "Premium",
                    country: "India",
                    preferredLanguage: "Tamil",
                    genres: "Action, Thriller, Drama",
                    bio: "Cinema enthusiast and the main admin of Movie Time. Curating the best releases for you.",
                    joinDate: "2026-01-01T00:00:00.000Z"
                };
                users.push(adminUser);
                safeStorage.setItem("users_db", JSON.stringify(users));
            } else {
                // Keep admin credentials and email correct/restored
                let updated = false;
                if (adminUser.email !== "smartelam12@gmail.com") {
                    adminUser.email = "smartelam12@gmail.com";
                    updated = true;
                }
                if (adminUser.password !== "Elampreethi0515@") {
                    adminUser.password = "Elampreethi0515@";
                    updated = true;
                }
                if (adminUser.status !== "approved") {
                    adminUser.status = "approved";
                    updated = true;
                }
                if (adminUser.role !== "admin") {
                    adminUser.role = "admin";
                    updated = true;
                }
                if (updated) {
                    safeStorage.setItem("users_db", JSON.stringify(users));
                }
            }
        } else {
            users = [
                {
                    name: "Elamparithi S",
                    username: "ElamparithiS",
                    password: "Elampreethi0515@",
                    email: "smartelam12@gmail.com",
                    status: "approved",
                    role: "admin"
                }
            ];
            safeStorage.setItem("users_db", JSON.stringify(users));
        }

        // Restore logged in user session safely
        const sessionUser = safeSession.getItem("current_user") || safeStorage.getItem("current_user");
        if (sessionUser) {
            try {
                currentUser = JSON.parse(sessionUser);
            } catch (e) {
                console.error("Failed to parse current_user session:", e);
                currentUser = null;
            }
        }
    }
    
    initDatabase();

    // -------------------------------------------------------------
    // DOM ELEMENTS
    // -------------------------------------------------------------
    const movieGrid = document.getElementById("movie-grid-container");
    const resultsCount = document.getElementById("results-count");
    const searchInput = document.getElementById("search-input");
    const sortSelect = document.getElementById("sort-select");
    const languageFilters = document.getElementById("language-filters");
    const qualityFilters = document.getElementById("quality-filters");

    // Modal elements
    const movieDetailsModal = document.getElementById("movie-details-modal");
    // admin-modal removed — admin portal lives at admin.html
    const toast = document.getElementById("copy-toast");
    
    // Video elements
    const playerStartOverlay = document.getElementById("player-start-overlay");
    const playerSpinner = document.getElementById("player-spinner");
    const onlineVideo = document.getElementById("online-video");
    const onlineIframe = document.getElementById("online-iframe");

    // -------------------------------------------------------------
    // STATE VARIABLES
    // -------------------------------------------------------------
    let activeLanguage = "all";
    let activeQuality = "all";
    let searchQuery = "";
    let activeSort = "latest";
    let torrentClient = null;
    let activeMovie = null;
        // -------------------------------------------------------------
    // RENDER CATALOG GRID
    // -------------------------------------------------------------
    function renderCatalog() {
        // Render hero banner dynamically
        renderHero();
        // Apply Search and Filters
        let filtered = movies.filter(movie => {
            // Text Search Match
            const matchesSearch = searchQuery === "" || 
                movie.title.toLowerCase().includes(searchQuery) ||
                movie.cast.toLowerCase().includes(searchQuery) ||
                movie.director.toLowerCase().includes(searchQuery) ||
                movie.genre.toLowerCase().includes(searchQuery);

            // Language Tag Match
            const matchesLang = activeLanguage === "all" || 
                movie.languages.some(lang => lang.toLowerCase() === activeLanguage.toLowerCase());

            // Quality Format Match
            const matchesQual = activeQuality === "all" || 
                movie.type.toLowerCase() === activeQuality.toLowerCase();

            return matchesSearch && matchesLang && matchesQual;
        });

        // Apply Sorting
        if (activeSort === "latest") {
            // Sort by Year descending (newest first)
            filtered.sort((a, b) => b.year - a.year || b.id.localeCompare(a.id));
        } else if (activeSort === "rating") {
            filtered.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
        } else if (activeSort === "title") {
            filtered.sort((a, b) => a.title.localeCompare(b.title));
        }

        // Display results counter
        resultsCount.textContent = `Showing ${filtered.length} movie${filtered.length === 1 ? '' : 's'}`;

        // Clear Grid
        movieGrid.innerHTML = "";

        if (filtered.length === 0) {
            movieGrid.innerHTML = `
                <div class="no-results span-2" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fa-solid fa-face-frown" style="font-size: 3rem; margin-bottom: 1rem; color: var(--accent-cyan);"></i>
                    <h3>No Movies Found</h3>
                    <p>Try adjusting your search filters or add a new movie using the Admin Panel.</p>
                </div>
            `;
            return;
        }

        // Render Cards
        filtered.forEach(movie => {
            const card = document.createElement("div");
            card.classList.add("movie-card");
            card.setAttribute("data-id", movie.id);

            // Map quality tag to badge style
            let badgeClass = "badge-uhd-card";
            if (movie.type === "WEB-HD") badgeClass = "badge-web-card";
            else if (movie.type === "PreDVD") badgeClass = "badge-predvd-card";
            else if (movie.type === "HDTS") badgeClass = "badge-hdts-card";

            card.innerHTML = `
                <div class="movie-poster-box">
                    <img src="${movie.poster}" alt="${movie.title}" loading="lazy">
                    <div class="card-badges">
                        <span class="card-badge ${badgeClass}">${movie.type}</span>
                    </div>
                    <div class="movie-card-overlay">
                        <span class="overlay-rating"><i class="fa-solid fa-star"></i> ${movie.rating}</span>
                        <div class="overlay-genres">${movie.genre}</div>
                        <p class="overlay-synopsis">${movie.description}</p>
                        <button class="overlay-details-btn"><i class="fa-solid fa-circle-info"></i> More Details</button>
                    </div>
                </div>
                <div class="movie-card-info">
                    <h3 class="movie-card-title">${movie.title} (${movie.year})</h3>
                    <div class="movie-card-meta">
                        <span class="card-meta-lang">${movie.languages.join(" + ")}</span>
                        <span>${movie.downloads[0] ? movie.downloads[0].resolution : "HD"}</span>
                    </div>
                </div>
            `;

            // Open Detail Modal
            card.addEventListener("click", () => openMovieDetails(movie));

            movieGrid.appendChild(card);
        });
    }

    // -------------------------------------------------------------
    // SEARCH & FILTER LISTENERS
    // -------------------------------------------------------------
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderCatalog();
    });
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const q = searchInput.value.trim();
            if (q) {
                let searches = [];
                try { searches = JSON.parse(safeStorage.getItem("recent_searches") || "[]"); } catch(e){}
                searches = searches.filter(s => s !== q);
                searches.unshift(q);
                searches = searches.slice(0, 8);
                safeStorage.setItem("recent_searches", JSON.stringify(searches));
            }
        }
    });

    sortSelect.addEventListener("change", (e) => {
        activeSort = e.target.value;
        renderCatalog();
    });

    // Language selector tags
    languageFilters.addEventListener("click", (e) => {
        if (e.target.classList.contains("filter-tag")) {
            // Update Active class
            Array.from(languageFilters.children).forEach(btn => btn.classList.remove("active"));
            e.target.classList.add("active");
            activeLanguage = e.target.getAttribute("data-lang");
            renderCatalog();
        }
    });

    // Quality selector tags
    qualityFilters.addEventListener("click", (e) => {
        if (e.target.classList.contains("filter-tag")) {
            // Update Active class
            Array.from(qualityFilters.children).forEach(btn => btn.classList.remove("active"));
            e.target.classList.add("active");
            activeQuality = e.target.getAttribute("data-qual");
            renderCatalog();
        }
    });

    // Setup shortcuts in footer
    document.querySelectorAll(".filter-shortcut").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetLang = link.getAttribute("data-lang");
            const filterBtn = languageFilters.querySelector(`[data-lang="${targetLang}"]`);
            if (filterBtn) {
                filterBtn.click();
                window.scrollTo({ top: filterBtn.offsetTop - 150, behavior: 'smooth' });
            }
        });
    });

    document.querySelectorAll(".quality-shortcut").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetQual = link.getAttribute("data-qual");
            const filterBtn = qualityFilters.querySelector(`[data-qual="${targetQual}"]`);
            if (filterBtn) {
                filterBtn.click();
                window.scrollTo({ top: filterBtn.offsetTop - 150, behavior: 'smooth' });
            }
        });
    });

    // -------------------------------------------------------------
    // MOVIE DETAILS DIALOG
    // -------------------------------------------------------------
    function getYouTubeId(url) {
        if (!url) return null;
        url = url.trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }
        let match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
        return match ? match[1] : null;
    }

    function openMovieDetails(movie) {
        activeMovie = movie;
        // Reset player & cleanup WebTorrent active processes
        cleanupPlayer();
        onlineVideo.style.display = "none";
        if (onlineIframe) onlineIframe.style.display = "none";
        playerSpinner.style.display = "none";
        playerStartOverlay.style.display = "flex";

        let streamSrc = "";
        let streamLabel = "";
        let isMagnet = "false";
        let isYouTube = "false";
        let youtubeId = "";

        // 1. Prioritize Trailer stream (as requested)
        if (movie.trailer && movie.trailer.trim()) {
            const t = movie.trailer.trim();
            const ytId = getYouTubeId(t);
            if (ytId) {
                isYouTube = "true";
                youtubeId = ytId;
                streamSrc = `https://www.youtube.com/embed/${ytId}?autoplay=1`;
                streamLabel = "Official Trailer (YouTube)";
            } else if (t.includes("http") || t.includes(".mp4") || t.includes(".webm") || t.includes(".mkv")) {
                streamSrc = t;
                streamLabel = "Official Trailer";
            }
        }

        // 2. Fall back to streamable direct link if no trailer
        if (!streamSrc && movie.downloads && movie.downloads.length > 0) {
            const resOrder = ["2160p", "4k", "1080p", "720p", "480p", "360p"];
            let best = null;
            let bestScore = 999;
            movie.downloads.forEach(dl => {
                if (dl.directLink && dl.directLink.trim() && dl.directLink.trim().startsWith("http")) {
                    const res = (dl.resolution || "").toLowerCase();
                    let score = resOrder.findIndex(r => res.includes(r));
                    if (score === -1) score = 50;
                    if (!best || score < bestScore) {
                        best = dl;
                        bestScore = score;
                    }
                }
            });
            if (best) {
                streamSrc = best.directLink.trim();
                streamLabel = `Direct Movie Stream (${best.resolution || "HD"})`;
            }
        }

        // 3. Fall back to magnet torrent stream if no direct link
        if (!streamSrc && movie.downloads && movie.downloads.length > 0) {
            const magnetRow = movie.downloads.find(dl => dl.link && dl.link.trim().startsWith("magnet:"));
            if (magnetRow) {
                streamSrc = magnetRow.link.trim();
                streamLabel = `Torrent Movie Stream (${magnetRow.resolution || "HD"})`;
                isMagnet = "true";
            }
        }

        // Set player overlay state
        playerStartOverlay.dataset.isMagnet = isMagnet;
        playerStartOverlay.dataset.isYouTube = isYouTube;
        playerStartOverlay.dataset.youtubeId = youtubeId;
        playerStartOverlay.dataset.streamSrc = streamSrc;

        if (streamSrc) {
            playerStartOverlay.dataset.canPlay = "true";
            playerStartOverlay.innerHTML = `
                <i class="fa-solid fa-circle-play" style="font-size: 3rem; color: var(--accent-cyan);"></i>
                <span style="font-size: 1.1rem; font-weight: 600; color: #fff; margin-top: 10px;">Play Trailer</span>
                <small style="font-size:0.75rem;color:rgba(255,255,255,.5);margin-top:4px;">${streamLabel}</small>
            `;
            if (isMagnet === "false" && isYouTube === "false") {
                onlineVideo.innerHTML = `<source src="${streamSrc}" type="video/mp4">Your browser does not support HTML5 video.`;
                onlineVideo.load();
            } else {
                onlineVideo.innerHTML = "";
            }
        } else {
            playerStartOverlay.dataset.canPlay = "false";
            playerStartOverlay.innerHTML = `
                <i class="fa-solid fa-circle-exclamation" style="font-size: 2.5rem; color:#f59e0b;"></i>
                <span style="font-size:0.9rem; margin-top: 8px;">No trailer/stream source available</span>
                <small style="font-size:0.7rem;color:rgba(255,255,255,.4);margin-top:4px;">Provide a Trailer Link or Download Link to play</small>
            `;
        }

        // Backdrop & Poster
        document.getElementById("modal-bg-blur").style.backgroundImage = `url('${movie.backdrop}')`;
        document.getElementById("modal-poster").src = movie.poster;
        document.getElementById("modal-poster").alt = `${movie.title} Poster`;
        
        // Metadata fields
        document.getElementById("modal-title-text").textContent = `${movie.title} (${movie.year})`;
        document.getElementById("modal-year").innerHTML = `<i class="fa-solid fa-calendar"></i> ${movie.year}`;
        document.getElementById("modal-duration").innerHTML = `<i class="fa-solid fa-clock"></i> ${movie.duration}`;
        document.getElementById("modal-rating").innerHTML = `<i class="fa-solid fa-star"></i> ${movie.rating}`;

        // Watchlist Bookmark logic removed
        
        // Dynamic info grid
        document.getElementById("modal-genre").textContent = movie.genre;
        document.getElementById("modal-director").textContent = movie.director;
        document.getElementById("modal-cast").textContent = movie.cast;
        document.getElementById("modal-description").textContent = movie.description;

        // Badges mapping
        const badgeContainer = document.getElementById("modal-badge-container");
        badgeContainer.innerHTML = "";
        
        // Dynamic quality type badge
        let typeBadge = document.createElement("span");
        typeBadge.classList.add("badge", "badge-uhd");
        typeBadge.textContent = movie.type;
        badgeContainer.appendChild(typeBadge);
        
        // Language badge
        let langBadge = document.createElement("span");
        langBadge.classList.add("badge", "badge-lang");
        langBadge.textContent = movie.languages.join(" + ");
        badgeContainer.appendChild(langBadge);

        // Quality details label badge
        let qualBadge = document.createElement("span");
        qualBadge.classList.add("badge", "badge-lang");
        qualBadge.textContent = movie.quality;
        badgeContainer.appendChild(qualBadge);

        // Render download rows
        const dlList = document.getElementById("modal-downloads-list");
        dlList.innerHTML = "";

        if (movie.downloads.length === 0) {
            dlList.innerHTML = `<tr><td colspan="5" style="text-align:center;">No downloads available for this release.</td></tr>`;
        } else {
            movie.downloads.forEach(dl => {
                const tr = document.createElement("tr");
                const hasMagnet = dl.link && dl.link.trim();
                const hasDirect = dl.directLink && dl.directLink.trim();
                tr.innerHTML = `
                    <td><strong>${dl.resolution}</strong></td>
                    <td><span class="type-pill">${dl.codec}</span></td>
                    <td><span class="type-pill">${dl.audio || movie.audio || "—"}</span></td>
                    <td><strong>${dl.size}</strong></td>
                    <td style="white-space: nowrap;">
                        ${hasMagnet ? `<button class="dl-btn" data-link="${dl.link}" style="margin-right: 6px;"><i class="fa-solid fa-magnet"></i> Magnet</button>` : ""}
                        ${hasDirect ? `<button class="direct-dl-btn" data-link="${dl.directLink}" style="background: rgba(10,255,235,0.12); color: var(--accent-cyan); border: 1px solid rgba(10,255,235,0.3); padding: 5px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: background 0.2s;"><i class="fa-solid fa-download"></i> Direct</button>` : ""}
                        ${hasMagnet ? `<button class="copy-btn" data-link="${dl.link}" style="margin-left: 4px;"><i class="fa-solid fa-link"></i></button>` : ""}
                    </td>
                `;
                dlList.appendChild(tr);
            });
        }

        // Select "Downloads" tab by default
        document.querySelector('.modal-tab[data-tab="downloads"]').click();

        // Show Modal
        movieDetailsModal.classList.add("show");
        document.body.style.overflow = "hidden"; // Disable background scrolling
    }

    function cleanupPlayer() {
        if (onlineVideo) {
            try {
                onlineVideo.pause();
                onlineVideo.src = "";
                onlineVideo.innerHTML = "";
                onlineVideo.load();
                onlineVideo.style.display = "none";
            } catch(e){}
        }
        if (onlineIframe) {
            try {
                onlineIframe.style.display = "none";
                onlineIframe.src = "";
            } catch(e){}
        }
        const placeholder = document.getElementById("yt-local-placeholder");
        if (placeholder) {
            placeholder.remove();
        }
        if (torrentClient) {
            try {
                torrentClient.destroy();
            } catch(e){}
            torrentClient = null;
        }
        const playerStatusText = document.getElementById("player-status-text");
        if (playerStatusText) {
            playerStatusText.textContent = "Analyzing stream source...";
        }
    }

    // Modal Tabs logic
    const modalTabs = document.querySelectorAll(".modal-tab");
    modalTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            // Remove active classes
            modalTabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
            
            // Add active classes
            tab.classList.add("active");
            const targetTab = tab.getAttribute("data-tab");
            document.getElementById(`tab-${targetTab}`).classList.add("active");

            // Pause video if switching away
            if (targetTab !== "watch-online") {
                cleanupPlayer();
            }
        });
    });

    // Close Modals
    document.querySelectorAll(".modal-close, .modal-overlay").forEach(closeBtn => {
        closeBtn.addEventListener("click", () => {
            movieDetailsModal.classList.remove("show");
            document.body.style.overflow = "auto";
            cleanupPlayer();
        });
    });

    // Handle clicks inside download table (Magnet / Copy)
    document.getElementById("modal-downloads-list").addEventListener("click", (e) => {
        const target = e.target;
        
        // Magnet Button Simulation
        if (target.classList.contains("dl-btn") || target.closest(".dl-btn")) {
            const btn = target.classList.contains("dl-btn") ? target : target.closest(".dl-btn");
            const originalText = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Downloading...`;
            btn.disabled = true;

            if (activeMovie) {
                let dlHistory = [];
                try { dlHistory = JSON.parse(safeStorage.getItem("downloads_history") || "[]"); } catch(e){}
                if (!dlHistory.some(d => d.id === activeMovie.id)) {
                    dlHistory.push({ id: activeMovie.id, title: activeMovie.title, year: activeMovie.year, poster: activeMovie.poster, timestamp: new Date().toISOString() });
                    safeStorage.setItem("downloads_history", JSON.stringify(dlHistory));
                }
            }

            setTimeout(() => {
                btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Torrent Added`;
                btn.style.background = "var(--accent-cyan)";
                btn.style.boxShadow = "0 0 10px var(--accent-cyan-glow)";
                
                // Copy magnet link anyway to clipboard
                const link = btn.getAttribute("data-link");
                navigator.clipboard.writeText(link);
                
                // Show notification toast
                showToast("Torrent added! Magnet link copied to clipboard.");
                
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = "var(--accent-green)";
                    btn.style.boxShadow = "none";
                    btn.disabled = false;
                }, 3000);
            }, 1200);
        }

        // Copy button Link
        if (target.classList.contains("copy-btn") || target.closest(".copy-btn")) {
            const btn = target.classList.contains("copy-btn") ? target : target.closest(".copy-btn");
            const link = btn.getAttribute("data-link");
            
            navigator.clipboard.writeText(link).then(() => {
                showToast("Magnet link copied to clipboard!");
            });
        }

        // Direct Download button — opens URL in new tab
        if (target.classList.contains("direct-dl-btn") || target.closest(".direct-dl-btn")) {
            const btn = target.classList.contains("direct-dl-btn") ? target : target.closest(".direct-dl-btn");
            const link = btn.getAttribute("data-link");
            if (link) {
                if (activeMovie) {
                    let dlHistory = [];
                    try { dlHistory = JSON.parse(safeStorage.getItem("downloads_history") || "[]"); } catch(e){}
                    if (!dlHistory.some(d => d.id === activeMovie.id)) {
                        dlHistory.push({ id: activeMovie.id, title: activeMovie.title, year: activeMovie.year, poster: activeMovie.poster, timestamp: new Date().toISOString() });
                        safeStorage.setItem("downloads_history", JSON.stringify(dlHistory));
                    }
                }
                window.open(link, "_blank", "noopener,noreferrer");
                showToast("Opening direct download link...");
            }
        }
    });

    // Show toast helper
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }

    // Render Hero Section dynamically
    const heroBanner = document.getElementById("hero-banner");

    function renderHero() {
        if (movies.length === 0) {
            heroBanner.style.display = "none";
            return;
        }

        const featured = movies[0]; // Featured is the latest/newly updated movie
        heroBanner.style.display = "flex";
        
        heroBanner.innerHTML = `
            <div class="hero-backdrop" style="background-image: linear-gradient(to right, rgba(10, 15, 29, 0.95) 30%, rgba(10, 15, 29, 0.4) 70%, rgba(10, 15, 29, 0.95) 100%), url('${featured.backdrop}');"></div>
            <div class="hero-content">
                <div class="movie-badges">
                    <span class="badge badge-featured"><i class="fa-solid fa-star"></i> Latest Release</span>
                    <span class="badge badge-lang">${featured.languages.join(" + ")}</span>
                    <span class="badge badge-uhd">${featured.type}</span>
                </div>
                <h1 class="hero-title">${featured.title} (${featured.year})</h1>
                <p class="hero-meta">
                    <span><i class="fa-solid fa-calendar"></i> ${featured.year}</span>
                    <span><i class="fa-solid fa-clock"></i> ${featured.duration}</span>
                    <span><i class="fa-solid fa-video"></i> ${featured.quality}</span>
                    <span><i class="fa-solid fa-volume-high"></i> ${featured.audio}</span>
                </p>
                <p class="hero-description">${featured.description}</p>
                <div class="hero-ctas">
                    <button class="btn btn-primary btn-glowing" id="btn-hero-downloads">
                        <i class="fa-solid fa-download"></i> Get Downloads
                    </button>
                    <button class="btn btn-secondary" id="btn-hero-play">
                        <i class="fa-solid fa-circle-play"></i> Watch Trailer
                    </button>
                </div>
            </div>
            <div class="hero-poster-container">
                <img src="${featured.poster}" alt="${featured.title} Poster" class="hero-poster">
            </div>
        `;
    }

    // Event delegation for Hero Banner action clicks
    heroBanner.addEventListener("click", (e) => {
        const downloadBtn = e.target.closest("#btn-hero-downloads");
        const playBtn = e.target.closest("#btn-hero-play");
        
        if (movies.length === 0) return;
        const latestMovie = movies[0]; // Featured is the latest/newly updated movie
        
        if (downloadBtn) {
            openMovieDetails(latestMovie);
        } else if (playBtn) {
            openMovieDetails(latestMovie);
            setTimeout(() => {
                const watchOnlineTab = document.querySelector('.modal-tab[data-tab="watch-online"]');
                if (watchOnlineTab) watchOnlineTab.click();
                
                // Buffering mock player simulator trigger
                const startOverlay = document.getElementById("player-start-overlay");
                if (startOverlay) startOverlay.click();
            }, 100);
        }
    });

    // Watch Online Player Simulation
    playerStartOverlay.addEventListener("click", () => {
        if (playerStartOverlay.dataset.canPlay !== "true") {
            showToast("No streamable source available.");
            return;
        }
        playerStartOverlay.style.display = "none";
        playerSpinner.style.display = "flex";

        const isMagnet = playerStartOverlay.dataset.isMagnet === "true";
        const streamSrc = playerStartOverlay.dataset.streamSrc;
        const youtubeId = playerStartOverlay.dataset.youtubeId;
        const playerStatusText = document.getElementById("player-status-text");

        if (isMagnet) {
            if (playerStatusText) playerStatusText.textContent = "Initializing WebTorrent client...";
            
            // Check if WebTorrent is loaded
            if (typeof WebTorrent === "undefined") {
                if (playerStatusText) playerStatusText.textContent = "WebTorrent library loading...";
                // Load it dynamically just in case
                const script = document.createElement("script");
                script.src = "https://cdn.jsdelivr.net/npm/webtorrent@1/webtorrent.min.js";
                script.onload = () => startTorrentStream(streamSrc);
                script.onerror = () => fallbackMockStream("Could not load WebTorrent. Proxy streaming instead...");
                document.head.appendChild(script);
            } else {
                startTorrentStream(streamSrc);
            }
        } else if (playerStartOverlay.dataset.isYouTube === "true") {

            if (playerStatusText) playerStatusText.textContent = "Loading YouTube trailer embed...";
            setTimeout(() => {
                playerSpinner.style.display = "none";
                if (onlineIframe) {
                    onlineIframe.src = streamSrc;
                    onlineIframe.style.display = "block";
                }
            }, 800);
        } else {
            if (playerStatusText) playerStatusText.textContent = "Connecting to direct streaming source...";
            setTimeout(() => {
                playerSpinner.style.display = "none";
                onlineVideo.style.display = "block";
                onlineVideo.play().catch(() => {
                    playerSpinner.style.display = "none";
                    onlineVideo.style.display = "block";
                    showToast("Playback started — use the player controls.");
                });
            }, 1200);
        }

        function startTorrentStream(magnetLink) {
            try {
                if (torrentClient) torrentClient.destroy();
                torrentClient = new WebTorrent();

                // Setup fallback timeout in case seed connection takes too long
                const fallbackTimeout = setTimeout(() => {
                    fallbackMockStream("Connecting to fallback proxy cache stream...");
                }, 6000);

                if (playerStatusText) playerStatusText.textContent = "Resolving torrent metadata & WebRTC peers...";

                torrentClient.add(magnetLink, (torrent) => {
                    // Metadata resolved! Clear fallback timeout
                    clearTimeout(fallbackTimeout);

                    if (playerStatusText) playerStatusText.textContent = "Metadata resolved! Finding video file...";

                    // Find largest video file
                    const file = torrent.files.find(f => 
                        f.name.endsWith(".mp4") || 
                        f.name.endsWith(".mkv") || 
                        f.name.endsWith(".webm") ||
                        f.name.endsWith(".avi")
                    ) || torrent.files[0];

                    if (!file) {
                        fallbackMockStream("Torrent empty. Using proxy backup stream...");
                        return;
                    }

                    if (playerStatusText) playerStatusText.textContent = `Streaming: ${file.name} (${Math.round(file.length / (1024*1024))} MB)...`;

                    file.renderTo("video#online-video", { autoplay: true, controls: true }, (err, elem) => {
                        playerSpinner.style.display = "none";
                        onlineVideo.style.display = "block";
                        if (err) {
                            console.error(err);
                            fallbackMockStream("Render error. Switched to backup cache stream.");
                        } else {
                            showToast("WebTorrent streaming started!");
                        }
                    });
                });

                torrentClient.on("error", (err) => {
                    console.error("WebTorrent error:", err);
                    clearTimeout(fallbackTimeout);
                    fallbackMockStream("Torrent engine error. Switching to fallback...");
                });

            } catch (err) {
                console.error("WebTorrent initialization error:", err);
                clearTimeout(fallbackTimeout);
                fallbackMockStream("WebTorrent engine error. Switching to fallback...");
            }
        }

        function fallbackMockStream(msg) {
            if (playerStatusText) playerStatusText.textContent = msg;
            showToast("WebRTC seeds offline. Streaming proxy backup...");
            
            setTimeout(() => {
                playerSpinner.style.display = "none";
                onlineVideo.style.display = "block";
                
                // Load default streamable sample video
                onlineVideo.innerHTML = `<source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" type="video/mp4">Your browser does not support HTML5 video.`;
                onlineVideo.load();
                onlineVideo.play().catch(() => {
                    showToast("Playback started — use player controls.");
                });
            }, 1500);
        }
    });

    // -------------------------------------------------------------
    // ADMIN PANEL LOGIC & MOVIE CREATION
    // -------------------------------------------------------------
    // Toggle Admin Panel modal
    const btnAdminToggle = document.getElementById("btn-admin-toggle");
    const btnAdminToggleMobile = document.getElementById("btn-admin-toggle-mobile");
    const mobileDrawer = document.querySelector(".mobile-drawer");
    const drawerOverlay = document.querySelector(".drawer-overlay");

    // Admin Panel and movie creation has been migrated to upload.html and management.html dedicated pages
    
    // Mobile nav drawers
    const mobileNavBtn = document.querySelector(".mobile-nav-toggle");
    const drawerCloseBtn = document.querySelector(".drawer-close");

    if (mobileNavBtn && mobileDrawer && drawerOverlay) {
        mobileNavBtn.addEventListener("click", () => {
            mobileDrawer.classList.add("open");
            drawerOverlay.classList.add("show");
        });
    }

    if (drawerCloseBtn && mobileDrawer && drawerOverlay) {
        drawerCloseBtn.addEventListener("click", () => {
            mobileDrawer.classList.remove("open");
            drawerOverlay.classList.remove("show");
        });
        drawerOverlay.addEventListener("click", () => {
            mobileDrawer.classList.remove("open");
            drawerOverlay.classList.remove("show");
        });
    }

    // -------------------------------------------------------------
    // USER PORTAL AUTHENTICATION, MANAGEMENT & PROFILES
    // -------------------------------------------------------------
    const authModal = document.getElementById("auth-modal");
    const profileModal = document.getElementById("profile-modal");
    const signinForm = document.getElementById("signin-form");
    const signupForm = document.getElementById("signup-form");

    if (authModal && signinForm) {
    
    // Captcha Generator
    function generateCaptcha() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // clear readable chars
        let code = "";
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        currentCaptcha = code;
        
        const display = document.getElementById("signin-captcha-code-display") || document.getElementById("captcha-code-display");
        if (display) display.textContent = code;
        
        const input = document.getElementById("signin-captcha-input") || document.getElementById("signup-captcha-input");
        if (input) input.value = "";
    }

    // Refresh Captcha click
    const btnCaptchaRefresh = document.getElementById("btn-signin-captcha-refresh") || document.getElementById("btn-captcha-refresh");
    if (btnCaptchaRefresh) {
        btnCaptchaRefresh.addEventListener("click", () => {
            btnCaptchaRefresh.style.transform = `rotate(${parseInt(btnCaptchaRefresh.style.transform || 0) + 360}deg)`;
            generateCaptcha();
        });
    }

    // Auth Tabs switcher
    const authTabs = document.querySelectorAll(".auth-tab");
    authTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            authTabs.forEach(t => {
                t.classList.remove("active");
                t.style.color = "var(--text-muted)";
                t.style.borderBottomColor = "transparent";
            });
            tab.classList.add("active");
            tab.style.color = "#fff";
            tab.style.borderBottomColor = "var(--accent-cyan)";
            
            const target = tab.getAttribute("data-auth-tab");
            document.getElementById("auth-signin-content").style.display = target === "signin" ? "block" : "none";
            document.getElementById("auth-signup-content").style.display = target === "signup" ? "block" : "none";
            
            if (target === "signup") {
                generateCaptcha();
            }
        });
    });

    // Close Modals Helper
    document.querySelectorAll(".modal-close, .modal-overlay").forEach(el => {
        el.addEventListener("click", (e) => {
            const modal = el.closest(".modal");
            if (modal) {
                // If details modal video is playing, pause it
                if (modal.id === "movie-details-modal") {
                    onlineVideo.pause();
                }
                modal.classList.remove("show");
                document.body.style.overflow = "auto";
            }
        });
    });

    // Open Sign In Modals
    const openSigninModal = (e) => {
        if (e) e.preventDefault();
        mobileDrawer.classList.remove("open");
        drawerOverlay.classList.remove("show");
        
        authModal.classList.add("show");
        document.body.style.overflow = "hidden";
        // Reset tabs to signin by default
        if (authTabs[0]) authTabs[0].click();
        
        // Generate captcha on modal open
        generateCaptcha();
    };

    // Open Sign Up Modals
    const openSignupModal = (e) => {
        if (e) e.preventDefault();
        mobileDrawer.classList.remove("open");
        drawerOverlay.classList.remove("show");
        
        authModal.classList.add("show");
        document.body.style.overflow = "hidden";
        // Reset tabs to signup
        authTabs[1].click();
    };

    // Admin Login links now navigate to admin.html via href — no JS click handlers needed here.

    // Switch links inside modal
    const lnkGoToSignup = document.getElementById("link-go-to-signup");
    if (lnkGoToSignup) {
        lnkGoToSignup.addEventListener("click", (e) => {
            e.preventDefault();
            if (authTabs[1]) authTabs[1].click();
        });
    }
    const lnkGoToSignin = document.getElementById("link-go-to-signin");
    if (lnkGoToSignin) {
        lnkGoToSignin.addEventListener("click", (e) => {
            e.preventDefault();
            if (authTabs[0]) authTabs[0].click();
        });
    }

    // Sign Up Submission
    signupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("signup-name").value.trim();
        const username = document.getElementById("signup-username").value.trim();
        const email = document.getElementById("signup-email").value.trim();
        const password = document.getElementById("signup-password").value.trim();
        const captchaInput = document.getElementById("signup-captcha-input").value.trim().toUpperCase();
        
        if (password.length < 6) {
            alert("Password must be at least 6 characters.");
            return;
        }

        if (captchaInput !== currentCaptcha) {
            alert("Invalid security captcha code. Please try again.");
            generateCaptcha();
            return;
        }

        // Check if username exists
        const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
        if (exists) {
            alert("Username already exists. Please choose a different username.");
            return;
        }

        // Create Member Object
        const newMember = {
            name,
            username,
            password,
            email,
            status: "pending",
            role: "member"
        };

        users.push(newMember);
        safeStorage.setItem("users_db", JSON.stringify(users));

        // Sync registration to GDrive
        if (window.GDriveSync && GDriveSync.isAuthorized) {
            GDriveSync.uploadFile("users_db.json", JSON.stringify(users)).catch(console.error);
        }

        signupForm.reset();
        alert("Registration successful! Your account is pending approval by the admin. You can log in once approved.");
        
        // Switch back to Sign In tab
        authTabs[0].click();
    });

    // Sign In Submission
    signinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("signin-username").value.trim();
        const password = document.getElementById("signin-password").value.trim();

        // Verify Captcha
        const captchaInputEl = document.getElementById("signin-captcha-input") || document.getElementById("signup-captcha-input");
        const captchaInput = captchaInputEl ? captchaInputEl.value.trim().toUpperCase() : "";
        if (captchaInput !== currentCaptcha) {
            alert("Invalid security captcha code. Please try again.");
            generateCaptcha();
            return;
        }

        // Check Credentials
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user || user.password !== password) {
            alert("Invalid username or password.");
            generateCaptcha(); // refresh captcha on failed attempt
            return;
        }

        if (user.status !== "approved") {
            alert("Your account is pending approval by the admin. Please try again later.");
            return;
        }

        // Login Success
        currentUser = user;
        safeSession.setItem("current_user", JSON.stringify(user));
        safeStorage.setItem("current_user", JSON.stringify(user));
        
        if (signinForm) signinForm.reset();
        if (authModal) authModal.classList.remove("show");
        document.body.style.overflow = "auto";
        
        updateAuthUI();
        renderCatalog();
        alert(`Welcome back, ${user.name}!`);
    });
    } // End of authModal && signinForm safeguard block

    // User Menu dropdown toggle
    const userMenuTrigger = document.getElementById("user-menu-trigger");
    const userDropdownMenu = document.getElementById("user-dropdown-menu");
    userMenuTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        userDropdownMenu.classList.toggle("show");
    });

    document.addEventListener("click", () => {
        userDropdownMenu.classList.remove("show");
    });

    // Sign Out trigger
    const signout = (e) => {
        e.preventDefault();
        currentUser = null;
        safeSession.removeItem("current_user");
        safeStorage.removeItem("current_user");
                updateAuthUI();
        renderCatalog();
        alert("You have successfully signed out.");
    };

    document.getElementById("dropdown-btn-signout").addEventListener("click", signout);
    document.getElementById("dropdown-btn-signout-mobile").addEventListener("click", signout);

    // Home Page Links click (resets all filter tags)
    const resetFiltersToHome = (e) => {
        e.preventDefault();
        activeLanguage = "all";
        activeQuality = "all";
        searchQuery = "";
        searchInput.value = "";
        
        // Reset active filter buttons classes in UI
        Array.from(languageFilters.children).forEach(btn => btn.classList.remove("active"));
        languageFilters.children[0].classList.add("active");
        Array.from(qualityFilters.children).forEach(btn => btn.classList.remove("active"));
        qualityFilters.children[0].classList.add("active");
        
        renderCatalog();
        
        // Close mobile drawer
        mobileDrawer.classList.remove("open");
        drawerOverlay.classList.remove("show");
    };

    document.getElementById("nav-btn-home").addEventListener("click", resetFiltersToHome);
    document.getElementById("nav-btn-home-mobile").addEventListener("click", resetFiltersToHome);

    // Upload Movie and Management Panel now navigate via href to upload.html / management.html — no JS click overrides needed.
    // Ensure mobile drawer closes when these links are clicked
    const btnUploadLink = document.getElementById("btn-upload-toggle");
    const btnUploadLinkMobile = document.getElementById("btn-upload-toggle-mobile");
    const btnAdminLink = document.getElementById("btn-admin-toggle");
    const btnAdminLinkMobile = document.getElementById("btn-admin-toggle-mobile");

    [btnUploadLink, btnUploadLinkMobile, btnAdminLink, btnAdminLinkMobile].forEach(el => {
        if (el) {
            el.addEventListener("click", () => {
                mobileDrawer.classList.remove("open");
                drawerOverlay.classList.remove("show");
            });
        }
    });

    // Member management is now handled in management.html — renderMembersList removed from index.js

    // Helper: render genre tag pills
    function renderGenreTags(genreArr) {
        const container = document.getElementById("profile-genre-tags");
        if (!container) return;
        container.innerHTML = "";
        if (!genreArr || genreArr.length === 0) {
            container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.82rem; font-style: italic;">No genres set</span>`;
            return;
        }
        genreArr.forEach(g => {
            const tag = document.createElement("span");
            tag.className = "profile-genre-tag";
            tag.innerHTML = `<i class="fa-solid fa-tag" style="font-size: 0.65rem;"></i>${g}`;
            container.appendChild(tag);
        });
    }

    // Helper: apply membership badge style
    function applyMembershipBadge(membership) {
        const badge = document.getElementById("profile-membership-badge");
        if (!badge) return;
        const isPremium = (membership || "Basic").toLowerCase() === "premium";
        badge.className = isPremium ? "membership-premium" : "membership-basic";
        badge.style.display = "inline-flex";
        badge.style.alignItems = "center";
        badge.style.gap = "5px";
        badge.style.padding = "2px 10px";
        badge.style.borderRadius = "20px";
        badge.style.fontSize = "0.7rem";
        badge.style.fontWeight = "800";
        badge.style.textTransform = "uppercase";
        badge.style.letterSpacing = "0.5px";
        badge.innerHTML = isPremium
            ? `<i class="fa-solid fa-crown"></i> Premium`
            : `<i class="fa-solid fa-circle-user"></i> Basic`;
    }

    // Helper: format join date
    function formatJoinDate(isoDate) {
        if (!isoDate) return "Joined recently";
        try {
            const d = new Date(isoDate);
            return "Joined " + d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } catch(e) {
            return "Joined recently";
        }
    }





    // Dynamic Auth UI syncing function
    function updateAuthUI() {
        const btnNavSignin = document.getElementById("btn-nav-signin");
        const btnNavSignup = document.getElementById("btn-nav-signup");
        const userMenuContainer = document.getElementById("user-menu-container");
        const userDisplayName = document.getElementById("user-display-name");
        
        const btnNavSigninMobile = document.getElementById("btn-nav-signin-mobile");
        const btnNavSignupMobile = document.getElementById("btn-nav-signup-mobile");
        const mobileUserInfo = document.getElementById("mobile-user-info");
        const mobileUserDisplayName = document.getElementById("mobile-user-display-name");
        
                const btnUploadToggle = document.getElementById("btn-upload-toggle");
        const btnUploadToggleMobile = document.getElementById("btn-upload-toggle-mobile");
        const btnAdminToggle = document.getElementById("btn-admin-toggle");
        const btnAdminToggleMobile = document.getElementById("btn-admin-toggle-mobile");
        const btnAdminClear = null; // Removed — Clear Catalog now lives in management.html

        if (currentUser) {
            const username = currentUser.username;
            const isAdmin = currentUser.role === "admin";
            
            // Desktop Navbar
            btnNavSignin.style.display = "none";
            if (btnNavSignup) btnNavSignup.style.display = "none";
            userMenuContainer.style.display = "inline-block";
            userDisplayName.textContent = currentUser.name || username;
            
            // Mobile Drawer
            btnNavSigninMobile.style.display = "none";
            if (btnNavSignupMobile) btnNavSignupMobile.style.display = "none";
            mobileUserInfo.style.display = "block";
            mobileUserDisplayName.textContent = currentUser.name || username;
            
            // Upload button privileges (Admin ONLY!)
            if (isAdmin) {
                if (btnUploadToggle) btnUploadToggle.style.display = "inline-block";
                if (btnUploadToggleMobile) btnUploadToggleMobile.style.display = "block";
            } else {
                if (btnUploadToggle) btnUploadToggle.style.display = "none";
                if (btnUploadToggleMobile) btnUploadToggleMobile.style.display = "none";
            }
            
            // Management panel trigger (only for ElamparithiS admin to manage, or members to open upload)
            if (isAdmin) {
                if (btnAdminToggle) btnAdminToggle.style.display = "inline-block";
                if (btnAdminToggleMobile) btnAdminToggleMobile.style.display = "block";
            } else {
                if (btnAdminToggle) btnAdminToggle.style.display = "none";
                if (btnAdminToggleMobile) btnAdminToggleMobile.style.display = "none";
            }

            // Management panel and upload page are now dedicated pages — no in-page tab bars needed
        } else {
            // Guest mode - hide all member controls
            btnNavSignin.style.display = "inline-block";
            if (btnNavSignup) btnNavSignup.style.display = "inline-block";
            userMenuContainer.style.display = "none";
            
            btnNavSigninMobile.style.display = "block";
            if (btnNavSignupMobile) btnNavSignupMobile.style.display = "block";
            mobileUserInfo.style.display = "none";
            
            if (btnUploadToggle) btnUploadToggle.style.display = "none";
            if (btnUploadToggleMobile) btnUploadToggleMobile.style.display = "none";
            if (btnAdminToggle) btnAdminToggle.style.display = "none";
            if (btnAdminToggleMobile) btnAdminToggleMobile.style.display = "none";
            if (btnAdminClear) btnAdminClear.style.display = "none";
        }
    }

    // Initial Auth State sync
    updateAuthUI();

    // -------------------------------------------------------------
    // INITIAL PAGE LOAD RENDERING
    // -------------------------------------------------------------
    renderCatalog();

    // -------------------------------------------------------------
    // GITHUB CLOUD SYNC — auto-load for ALL visitors (no login)
    // -------------------------------------------------------------
    async function loadFromGitHub() {
        if (typeof GitHubSync === "undefined") return;

        // If admin just uploaded a movie, skip overwrite for this session
        // so the newly uploaded movie shows immediately
        const justUploaded = safeStorage.getItem("gh_just_uploaded");
        if (justUploaded) {
            safeStorage.removeItem("gh_just_uploaded");
            console.log("[GitHub] Skipping cloud overwrite — fresh local upload detected.");
            return;
        }

        try {
            const cloudMovies = await GitHubSync.loadMovies();
            if (!cloudMovies) return;

            // Get current local movies
            let localMovies = [];
            try { localMovies = JSON.parse(safeStorage.getItem("movies_db") || "[]"); } catch(_) {}

            // Merge: use whichever has MORE movies to avoid overwriting new uploads
            // that haven't reached GitHub yet
            if (cloudMovies.length >= localMovies.length && cloudMovies.length > 0) {
                safeStorage.setItem("movies_db", JSON.stringify(cloudMovies));
                movies.length = 0;
                movies.push(...cloudMovies);
                renderCatalog();
                console.log("[GitHub] Catalog loaded from cloud — " + cloudMovies.length + " movies.");
            } else if (localMovies.length > cloudMovies.length) {
                // Local has more — keep local, push it to cloud to sync
                console.log("[GitHub] Local has more movies (" + localMovies.length + " vs " + cloudMovies.length + "). Keeping local.");
                if (typeof GitHubSync !== "undefined" && GitHubSync.hasToken) {
                    GitHubSync.saveMovies(localMovies).catch(e => console.warn("[GitHub] Auto-push failed:", e.message));
                }
            }
        } catch(e) {
            console.warn("[GitHub] Could not load cloud catalog:", e.message);
        }
    }

    // Run immediately — works for every visitor without any login
    loadFromGitHub();
});

