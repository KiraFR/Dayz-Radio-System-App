const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");

// Import modules
const { loadEnvFile, applyEnv, saveConfig, getDefaultConfigPath } = require("./lib/config.cjs");
const {
	findFreePort,
	parseJSONBody,
	isValidFrequenciesArray,
	frequencyToString,
	setCORSHeaders,
	sendJSON,
	getConnectionStatus
} = require("./lib/httpServer.cjs");

// Charger le fichier .env
const envPath = path.join(__dirname, ".env");
const envVars = loadEnvFile(envPath);
applyEnv(envVars);

// Configuration
let serverURL = null; // Sera défini par DayZ
const SECRET_CODE = process.env.SECRET_CODE || "dayz";
const isDev = !app.isPackaged;

// Config DayZ
const CONFIG_FILE = getDefaultConfigPath();

let mainWindow = null;
let isPTTPressed = false;
let httpServer = null;
let httpPort = null;
let lastHeartbeat = null;
let heartbeatCheckInterval = null;
const HEARTBEAT_TIMEOUT = 30000; // 30 secondes

// Déconnecter (release PTT si actif + vider la webview)
function disconnect(reason) {
	console.log("[HTTP] Disconnect:", reason);
	
	// Release PTT si actif
	if (isPTTPressed && mainWindow) {
		isPTTPressed = false;
		mainWindow.webContents.send("ptt:release");
	}
	
	// Reset état
	serverURL = null;
	lastHeartbeat = null;
	
	// Revenir à la page d'attente
	if (mainWindow) {
		mainWindow.loadFile(path.join(__dirname, "waiting.html"));
	}
}

// Vérifier le heartbeat
function startHeartbeatCheck() {
	heartbeatCheckInterval = setInterval(() => {
		if (lastHeartbeat && serverURL) {
			const elapsed = Date.now() - lastHeartbeat;
			if (elapsed > HEARTBEAT_TIMEOUT) {
				console.log("[Heartbeat] Timeout - pas de heartbeat depuis", elapsed, "ms");
				disconnect("heartbeat_timeout");
			}
		}
	}, 5000); // Vérifier toutes les 5 secondes
}

// Démarrer le serveur HTTP local pour DayZ
async function startLocalServer() {
	httpPort = await findFreePort();
	
	httpServer = http.createServer(async (req, res) => {
		// CORS headers
		setCORSHeaders(res, req.headers.origin);
		
		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		const url = req.url;
		
		try {
			// ========================================
			// PTT Endpoints
			// ========================================
			if (url === "/ptt/press" && req.method === "POST") {
				console.log("[HTTP] PTT Press from DayZ - isPTTPressed:", isPTTPressed, "mainWindow:", !!mainWindow);
				if (mainWindow && !isPTTPressed) {
					isPTTPressed = true;
					console.log("[HTTP] Sending ptt:press to renderer");
					mainWindow.webContents.send("ptt:press");
				}
				sendJSON(res, 200, { success: true });
				
			} else if (url === "/ptt/release" && req.method === "POST") {
				console.log("[HTTP] PTT Release from DayZ - isPTTPressed:", isPTTPressed, "mainWindow:", !!mainWindow);
				if (mainWindow && isPTTPressed) {
					isPTTPressed = false;
					console.log("[HTTP] Sending ptt:release to renderer");
					mainWindow.webContents.send("ptt:release");
				}
				sendJSON(res, 200, { success: true });
				
			// ========================================
			// Status Endpoint
			// ========================================
			} else if (url === "/status" && req.method === "GET") {
				const status = getConnectionStatus(serverURL, mainWindow);
				sendJSON(res, 200, { 
					running: true,
					status: status,
					pttPressed: isPTTPressed,
					connected: serverURL !== null,
					serverURL: serverURL
				});
				
			// ========================================
			// Connection Endpoints
			// ========================================
			} else if (url === "/connect" && req.method === "POST") {
				const data = await parseJSONBody(req);
				if (data.url) {
					serverURL = data.url;
					lastHeartbeat = Date.now();
					console.log("[HTTP] Connect to:", serverURL);
					
					if (mainWindow) {
						mainWindow.loadURL(serverURL);
					}
					
					sendJSON(res, 200, { success: true, url: serverURL });
				} else {
					sendJSON(res, 400, { error: "Missing url parameter" });
				}
				
			} else if (url === "/disconnect" && req.method === "POST") {
				disconnect("manual");
				sendJSON(res, 200, { success: true });
				
			} else if (url === "/heartbeat" && req.method === "POST") {
				lastHeartbeat = Date.now();
				sendJSON(res, 200, { success: true });
				
			// ========================================
			// Legacy Single Frequency Endpoint
			// ========================================
			} else if (url === "/frequency" && req.method === "POST") {
				const data = await parseJSONBody(req);
				if (data.frequency !== undefined) {
					const frequency = frequencyToString(data.frequency);
					console.log("[HTTP] Frequency change from DayZ:", frequency);
					
					if (mainWindow) {
						mainWindow.webContents.send("frequency:change", frequency);
					}
					
					sendJSON(res, 200, { success: true, frequency: frequency });
				} else {
					sendJSON(res, 400, { error: "Missing frequency parameter" });
				}
				
			// ========================================
			// Multi-Frequency Endpoints
			// ========================================
			} else if (url === "/frequencies" && req.method === "POST") {
				const data = await parseJSONBody(req);
				
				if (!Array.isArray(data.frequencies)) {
					sendJSON(res, 400, { error: "frequencies must be an array" });
					return;
				}
				
				if (!isValidFrequenciesArray(data.frequencies)) {
					sendJSON(res, 400, { 
						error: "Invalid frequency format. Expected: [{frequency: number, earSide: 0|1|2}]" 
					});
					return;
				}
				
				const frequenciesWithStrings = data.frequencies.map(f => ({
					frequency: frequencyToString(f.frequency),
					earSide: f.earSide
				}));
				
				console.log("[HTTP] Frequencies update from DayZ:", frequenciesWithStrings.length, "frequencies");
				
				if (mainWindow) {
					mainWindow.webContents.send("frequencies:update", frequenciesWithStrings);
				}
				
				sendJSON(res, 200, { success: true, count: frequenciesWithStrings.length });
				
			} else if (url === "/active-channel" && req.method === "POST") {
				const data = await parseJSONBody(req);
				
				if (typeof data.frequency !== "number") {
					sendJSON(res, 400, { error: "frequency must be a number" });
					return;
				}
				
				const frequencyStr = frequencyToString(data.frequency);
				console.log("[HTTP] Active channel change from DayZ:", frequencyStr);
				
				if (mainWindow) {
					mainWindow.webContents.send("active-channel:change", frequencyStr);
				}
				
				sendJSON(res, 200, { success: true, frequency: frequencyStr });
				
			} else if (url === "/ear-side" && req.method === "POST") {
				const data = await parseJSONBody(req);
				
				if (typeof data.frequency !== "number" || typeof data.earSide !== "number") {
					sendJSON(res, 400, { error: "frequency and earSide must be numbers" });
					return;
				}
				
				if (![0, 1, 2].includes(data.earSide)) {
					sendJSON(res, 400, { error: "earSide must be 0 (left), 1 (right), or 2 (both)" });
					return;
				}
				
				const frequencyStr = frequencyToString(data.frequency);
				console.log("[HTTP] Ear side change from DayZ:", frequencyStr, "earSide:", data.earSide);
				
				if (mainWindow) {
					mainWindow.webContents.send("ear-side:change", { frequency: frequencyStr, earSide: data.earSide });
				}
				
				sendJSON(res, 200, { success: true, frequency: frequencyStr, earSide: data.earSide });
				
			} else if (url === "/frequency/disconnect" && req.method === "POST") {
				const data = await parseJSONBody(req);
				
				if (typeof data.frequency !== "number") {
					sendJSON(res, 400, { error: "frequency must be a number" });
					return;
				}
				
				const frequencyStr = frequencyToString(data.frequency);
				console.log("[HTTP] Frequency disconnect from DayZ:", frequencyStr);
				
				if (mainWindow) {
					mainWindow.webContents.send("frequency:disconnect", frequencyStr);
				}
				
				sendJSON(res, 200, { success: true, frequency: frequencyStr });
				
			// ========================================
			// 404 Not Found
			// ========================================
			} else {
				sendJSON(res, 404, { error: "Not found" });
			}
		} catch (e) {
			console.error("[HTTP] Error:", e);
			sendJSON(res, 400, { error: "Invalid JSON" });
		}
	});
	
	httpServer.listen(httpPort, "127.0.0.1", () => {
		console.log(`Serveur HTTP local démarré sur http://127.0.0.1:${httpPort}`);
		if (saveConfig(CONFIG_FILE, httpPort)) {
			console.log(`Config sauvegardée: ${CONFIG_FILE}`);
		}
	});
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		minWidth: 400,
		minHeight: 400,
		title: "Radio VoIP DayZ",
		frame: false,
		titleBarStyle: "hidden",
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			devTools: isDev,
		},
		autoHideMenuBar: true,
		backgroundColor: "#0d0d1a",
	});

	if (isDev) {
		mainWindow.loadURL("http://localhost:3001");
		mainWindow.webContents.openDevTools();
	} else if (serverURL) {
		mainWindow.loadURL(serverURL);
	} else {
		mainWindow.loadFile(path.join(__dirname, "waiting.html"));
	}

	mainWindow.webContents.on("did-finish-load", () => {
		mainWindow.webContents.executeJavaScript(`window.SECRET_CODE = "${SECRET_CODE}";`);
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(async () => {
	await startLocalServer();
	createWindow();
	startHeartbeatCheck();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("will-quit", () => {
	if (httpServer) {
		httpServer.close();
	}
	if (heartbeatCheckInterval) {
		clearInterval(heartbeatCheckInterval);
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// IPC handlers
ipcMain.handle("get-server-url", () => serverURL);
ipcMain.handle("get-http-port", () => httpPort);

// Window controls
ipcMain.on("window-minimize", () => {
	if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
	if (mainWindow) {
		if (mainWindow.isMaximized()) {
			mainWindow.unmaximize();
		} else {
			mainWindow.maximize();
		}
	}
});

ipcMain.on("window-close", () => {
	if (mainWindow) mainWindow.close();
});
