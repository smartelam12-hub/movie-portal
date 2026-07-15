/**
 * Movie Time - GitHub Cloud Sync Engine
 * ──────────────────────────────────────────────────────────────────
 * PUBLIC READ:  All viewers fetch movies from raw.githubusercontent.com
 *               No login, no OAuth, works on every device instantly.
 *
 * ADMIN WRITE:  Admin sets a GitHub Personal Access Token once.
 *               Every upload auto-commits movies_db.json to the repo.
 * ──────────────────────────────────────────────────────────────────
 */

const GitHubSync = {
    // ── CONFIG ──────────────────────────────────────────────────────
    // Fill these with your GitHub details once:
    owner:  localStorage.getItem("gh_owner")  || "smartelam12-hub",
    repo:   localStorage.getItem("gh_repo")   || "movie-portal",
    branch: localStorage.getItem("gh_branch") || "main",
    token:  localStorage.getItem("gh_token")  || "",

    // Path inside the repo where the database will be stored
    dbPath: "data/movies_db.json",

    // ── PUBLIC RAW URL (no auth, works for ALL visitors) ────────────
    get rawUrl() {
        return `https://raw.githubusercontent.com/${GitHubSync.owner}/${GitHubSync.repo}/${GitHubSync.branch}/${GitHubSync.dbPath}`;
    },

    // ── GITHUB API URL ───────────────────────────────────────────────
    get apiUrl() {
        return `https://api.github.com/repos/${GitHubSync.owner}/${GitHubSync.repo}/contents/${GitHubSync.dbPath}`;
    },

    // ── SAVE ADMIN CONFIG ────────────────────────────────────────────
    setConfig({ owner, repo, branch, token }) {
        if (owner)  { GitHubSync.owner  = owner.trim();  localStorage.setItem("gh_owner",  owner.trim());  }
        if (repo)   { GitHubSync.repo   = repo.trim();   localStorage.setItem("gh_repo",   repo.trim());   }
        if (branch) { GitHubSync.branch = branch.trim(); localStorage.setItem("gh_branch", branch.trim()); }
        if (token)  { GitHubSync.token  = token.trim();  localStorage.setItem("gh_token",  token.trim());  }
    },

    clearToken() {
        GitHubSync.token = "";
        localStorage.removeItem("gh_token");
    },

    // ── PUBLIC LOAD (all viewers, no auth needed) ────────────────────
    async loadMovies() {
        try {
            const res = await fetch(GitHubSync.rawUrl + "?t=" + Date.now(), { cache: "no-store" });
            if (!res.ok) return null;
            const text = await res.text();
            const arr  = JSON.parse(text);
            if (Array.isArray(arr)) return arr;
            return null;
        } catch (e) {
            console.warn("[GitHubSync] loadMovies failed:", e.message);
            return null;
        }
    },

    // ── ADMIN SAVE (needs GitHub token) ─────────────────────────────
    async saveMovies(moviesArray) {
        if (!GitHubSync.token) throw new Error("GitHub token not configured. Open Settings on the Management Panel.");

        const content = btoa(unescape(encodeURIComponent(JSON.stringify(moviesArray, null, 2))));

        // Get current file SHA (needed for updates)
        let sha = null;
        try {
            const info = await fetch(GitHubSync.apiUrl, {
                headers: { Authorization: `token ${GitHubSync.token}` }
            });
            if (info.ok) {
                const data = await info.json();
                sha = data.sha;
            }
        } catch (_) {}

        const body = {
            message: `chore: update movie catalog [${new Date().toISOString()}]`,
            content,
            branch: GitHubSync.branch
        };
        if (sha) body.sha = sha;

        const res = await fetch(GitHubSync.apiUrl, {
            method: "PUT",
            headers: {
                Authorization: `token ${GitHubSync.token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `GitHub API error ${res.status}`);
        }

        return true;
    },

    get hasToken() {
        return !!(GitHubSync.token && GitHubSync.token.trim().length > 0);
    }
};
