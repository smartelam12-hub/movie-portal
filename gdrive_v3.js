function getStoredCred(key, defaultVal) {
    const val = localStorage.getItem(key);
    if (!val || val === "undefined" || val === "null" || val.trim() === "") {
        return defaultVal;
    }
    return val;
}

const GDriveSync = {
    // Config states (Seeded default user credentials)
    clientId: getStoredCred("gdrive_client_id", "310423231919-qpt7gohvek9p8oefam1vqla12tvnje15.apps.googleusercontent.com"),
    apiKey: getStoredCred("gdrive_api_key", "AIzaSyDEUE5tkLrdKhFYDm50Yfgaz9t8I_vlwn8"),
    accessToken: sessionStorage.getItem("gdrive_access_token") || "",
    isAuthorized: false,
    gapiLoaded: false,
    gisLoaded: false,
    tokenClient: null,
    
    // Subscriptions
    listeners: [],
    
    log(msg) {
        console.log("[GDriveSync] " + msg);
        const container = document.getElementById("sync-debug-log");
        if (container) {
            container.style.display = "block";
            const time = new Date().toLocaleTimeString();
            container.innerHTML += `[${time}] ${msg}\n`;
            container.scrollTop = container.scrollHeight;
        }
    },
    
    subscribe(callback) {
        GDriveSync.listeners.push(callback);
        try {
            callback(GDriveSync.getStatus());
        } catch(e) {
            GDriveSync.log("Instant sub error: " + e.message);
        }
    },
    
    notify() {
        GDriveSync.log(`Notifying listeners. Authorized = ${GDriveSync.isAuthorized}`);
        const status = GDriveSync.getStatus();
        GDriveSync.listeners.forEach(cb => {
            try { 
                cb(status); 
            } catch(e){
                GDriveSync.log("Notification error: " + e.message);
            }
        });
    },
    
    getStatus() {
        return {
            clientId: GDriveSync.clientId,
            apiKey: GDriveSync.apiKey,
            isAuthorized: GDriveSync.isAuthorized,
            accessToken: GDriveSync.accessToken,
            hasCredentials: !!(GDriveSync.clientId && GDriveSync.apiKey)
        };
    },

    setCredentials(clientId, apiKey) {
        GDriveSync.clientId = clientId.trim();
        GDriveSync.apiKey = apiKey.trim();
        localStorage.setItem("gdrive_client_id", GDriveSync.clientId);
        localStorage.setItem("gdrive_api_key", GDriveSync.apiKey);
        GDriveSync.log("Credentials updated. Reinitializing GAPI...");
        GDriveSync.notify();
        GDriveSync.initGapi();
    },

    clearCredentials() {
        GDriveSync.clientId = "310423231919-qpt7gohvek9p8oefam1vqla12tvnje15.apps.googleusercontent.com";
        GDriveSync.apiKey = "AIzaSyDEUE5tkLrdKhFYDm50Yfgaz9t8I_vlwn8";
        GDriveSync.accessToken = "";
        GDriveSync.isAuthorized = false;
        localStorage.removeItem("gdrive_client_id");
        localStorage.removeItem("gdrive_api_key");
        sessionStorage.removeItem("gdrive_access_token");
        GDriveSync.log("Credentials cleared. Restored defaults.");
        GDriveSync.notify();
        GDriveSync.initGapi();
    },

    // -------------------------------------------------------------
    // INITIALIZATION RITUALS
    // -------------------------------------------------------------
    init() {
        GDriveSync.log("Initializing sync engine scripts...");
        
        if (!document.getElementById("gis-client-script")) {
            const gisScript = document.createElement("script");
            gisScript.id = "gis-client-script";
            gisScript.src = "https://accounts.google.com/gsi/client";
            gisScript.onload = () => {
                GDriveSync.gisLoaded = true;
                GDriveSync.log("Google Identity Services script loaded.");
                GDriveSync.initGis();
            };
            document.head.appendChild(gisScript);
        } else {
            GDriveSync.gisLoaded = true;
            GDriveSync.initGis();
        }

        if (!document.getElementById("gapi-client-script")) {
            const gapiScript = document.createElement("script");
            gapiScript.id = "gapi-client-script";
            gapiScript.src = "https://apis.google.com/js/api.js";
            gapiScript.onload = () => {
                GDriveSync.gapiLoaded = true;
                GDriveSync.log("Google API script loaded.");
                GDriveSync.initGapi();
            };
            document.head.appendChild(gapiScript);
        } else {
            GDriveSync.gapiLoaded = true;
            GDriveSync.initGapi();
        }
    },

    initGis() {
        if (!GDriveSync.clientId) return;
        try {
            GDriveSync.log("Initializing GIS Token Client...");
            GDriveSync.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GDriveSync.clientId,
                scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
                callback: (tokenResponse) => {
                    GDriveSync.log("Auth callback triggered by Google.");
                    if (tokenResponse.error !== undefined) {
                        GDriveSync.log("Auth error response: " + tokenResponse.error);
                        throw tokenResponse;
                    }
                    GDriveSync.log("Access token received.");
                    GDriveSync.accessToken = tokenResponse.access_token;
                    sessionStorage.setItem("gdrive_access_token", GDriveSync.accessToken);
                    GDriveSync.isAuthorized = true;
                    GDriveSync.notify();
                    
                    if (window.gapi && gapi.client) {
                        gapi.client.setToken({ access_token: GDriveSync.accessToken });
                    }
                },
            });
            GDriveSync.log("GIS Token Client initialized.");
        } catch(e) {
            GDriveSync.log("GIS init exception: " + e.message);
        }
    },

    initGapi() {
        if (!GDriveSync.apiKey) return;
        GDriveSync.log("Loading GAPI Client library...");
        gapi.load("client", async () => {
            try {
                await gapi.client.init({
                    apiKey: GDriveSync.apiKey,
                    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
                });
                GDriveSync.log("GAPI Client library initialized.");
                if (GDriveSync.accessToken) {
                    GDriveSync.log("Restoring access token to GAPI...");
                    gapi.client.setToken({ access_token: GDriveSync.accessToken });
                    GDriveSync.isAuthorized = true;
                }
                GDriveSync.notify();
            } catch (e) {
                GDriveSync.log("GAPI init error: " + e.message);
            }
        });
    },

    // -------------------------------------------------------------
    // AUTH ACTIONS
    // -------------------------------------------------------------
    login() {
        GDriveSync.log("Initiating account sign-in prompt...");
        if (!GDriveSync.tokenClient) {
            GDriveSync.initGis();
        }
        if (GDriveSync.tokenClient) {
            GDriveSync.tokenClient.requestAccessToken({ 
                prompt: "select_account consent"
            });
        } else {
            GDriveSync.log("Token client is not initialized.");
            alert("OAuth Client ID is not configured yet. Set credentials in Settings.");
        }
    },

    logout() {
        GDriveSync.log("Logging out and revoking session...");
        if (GDriveSync.accessToken) {
            try {
                google.accounts.oauth2.revoke(GDriveSync.accessToken, () => {
                    GDriveSync.log("Session revoked on Google servers.");
                });
            } catch(e){}
        }
        GDriveSync.accessToken = "";
        GDriveSync.isAuthorized = false;
        sessionStorage.removeItem("gdrive_access_token");
        GDriveSync.log("Offline.");
        GDriveSync.notify();
    },

    // -------------------------------------------------------------
    // DRIVE DATA CRUD TRANSACTIONS
    // -------------------------------------------------------------
    
    async uploadFile(fileName, contentString) {
        GDriveSync.log(`Uploading file ${fileName}...`);
        if (!GDriveSync.isAuthorized) {
            throw new Error("GDrive API not authenticated.");
        }
        
        try {
            let fileId = await GDriveSync.findFileId(fileName);
            
            const boundary = "3d566aa5-7eab-4826-9d7c-39e131a7403e";
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";
            const contentType = "application/json";
            
            let metadata = {
                name: fileName,
                mimeType: contentType
            };
            
            let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
            let method = "POST";
            
            if (fileId) {
                url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
                method = "PATCH";
                delete metadata.mimeType;
            }
            
            const multipartRequestBody =
                delimiter +
                "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
                JSON.stringify(metadata) +
                delimiter +
                "Content-Type: " + contentType + "\r\n\r\n" +
                contentString +
                close_delim;
            
            const response = await fetch(url, {
                method: method,
                headers: new Headers({
                    "Authorization": "Bearer " + GDriveSync.accessToken,
                    "Content-Type": 'multipart/related; boundary="' + boundary + '"'
                }),
                body: multipartRequestBody
            });
            
            if (!response.ok) {
                throw new Error("Upload failed with status " + response.status);
            }
            
            const result = await response.json();
            GDriveSync.log(`Uploaded completed. ID = ${result.id}`);
            
            await GDriveSync.makeFilePublic(result.id);
            return result.id;
        } catch (error) {
            GDriveSync.log(`Upload exception for ${fileName}: ` + error.message);
            throw error;
        }
    },

    async downloadFile(fileName) {
        GDriveSync.log(`Downloading file ${fileName}...`);
        if (!GDriveSync.isAuthorized) {
            throw new Error("GDrive API not authenticated.");
        }
        
        try {
            const fileId = await GDriveSync.findFileId(fileName);
            if (!fileId) {
                GDriveSync.log(`Cloud file ${fileName} not found.`);
                return null;
            }
            
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: {
                    "Authorization": "Bearer " + GDriveSync.accessToken
                }
            });
            
            if (!response.ok) {
                throw new Error("Download failed with status " + response.status);
            }
            
            GDriveSync.log(`Download completed for ${fileName}.`);
            return await response.text();
        } catch (error) {
            GDriveSync.log(`Download exception for ${fileName}: ` + error.message);
            throw error;
        }
    },

    async findFileId(fileName) {
        try {
            const query = encodeURIComponent(`name='${fileName}' and trashed=false`);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
                headers: {
                    "Authorization": "Bearer " + GDriveSync.accessToken
                }
            });
            
            if (!response.ok) {
                throw new Error("Search query failed with status " + response.status);
            }
            
            const result = await response.json();
            if (result.files && result.files.length > 0) {
                GDriveSync.log(`Found ID: ${result.files[0].id}`);
                return result.files[0].id;
            }
            GDriveSync.log("File not found in Drive search.");
            return null;
        } catch (e) {
            GDriveSync.log("findFileId query error: " + e.message);
            return null;
        }
    },

    // -------------------------------------------------------------
    // PUBLIC ANONYMOUS VIEWER SUPPORT APIS
    // -------------------------------------------------------------
    
    async makeFilePublic(fileId) {
        if (!GDriveSync.accessToken) return;
        try {
            GDriveSync.log(`Sharing file ${fileId} with public...`);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + GDriveSync.accessToken,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    role: "reader",
                    type: "anyone"
                })
            });
            if (response.ok) {
                GDriveSync.log(`File ${fileId} is now publicly shared.`);
            } else {
                GDriveSync.log(`Failed to share file: status ${response.status}`);
            }
        } catch (e) {
            GDriveSync.log("makeFilePublic permissions failed: " + e.message);
        }
    },

    async findFileIdPublic(fileName) {
        if (!GDriveSync.apiKey) return null;
        try {
            const query = encodeURIComponent(`name='${fileName}' and visibility='anyoneWithLink' and trashed=false`);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&key=${GDriveSync.apiKey}`);
            if (!response.ok) return null;
            const result = await response.json();
            if (result.files && result.files.length > 0) {
                return result.files[0].id;
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    async downloadFilePublic(fileId) {
        if (!GDriveSync.apiKey || !fileId) return null;
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GDriveSync.apiKey}`);
            if (!response.ok) return null;
            return await response.text();
        } catch (e) {
            return null;
        }
    }
};

// Auto boot GDrive sync on load
GDriveSync.init();
window.GDriveSync = GDriveSync;
