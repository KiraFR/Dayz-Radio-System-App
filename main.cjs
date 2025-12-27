const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

// Charger le fichier .env
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
	const envContent = fs.readFileSync(envPath, "utf-8");
	envContent.split("\n").forEach((line) => {
		const [key, value] = line.split("=").map((s) => s.trim());
		if (key && value && !process.env[key]) {
			process.env[key] = value;
		}
	});
}

// Configuration
let serverURL = null; // Sera défini par DayZ
const SECRET_CODE = process.env.SECRET_CODE || "dayz";
const isDev = !app.isPackaged;

// Config DayZ
const CONFIG_DIR = path.join(process.env.LOCALAPPDATA, "DayZ", "RadioVOIP");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

let mainWindow = null;
let isPTTPressed = false;
let httpServer = null;
let httpPort = null;
let lastHeartbeat = null;
let heartbeatCheckInterval = null;
const HEARTBEAT_TIMEOUT = 30000; // 30 secondes

// Trouver un port libre
function findFreePort(startPort = 19800) {
	return new Promise((resolve, reject) => {
		const server = http.createServer();
		server.listen(startPort, "127.0.0.1", () => {
			const port = server.address().port;
			server.close(() => resolve(port));
		});
		server.on("error", () => {
			// Port occupé, essayer le suivant
			resolve(findFreePort(startPort + 1));
		});
	});
}

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

// Sauvegarder la config pour DayZ
function saveConfig(port) {
	try {
		// Créer le dossier si nécessaire
		if (!fs.existsSync(CONFIG_DIR)) {
			fs.mkdirSync(CONFIG_DIR, { recursive: true });
		}
		
		const config = {
			port: port,
			url: `http://127.0.0.1:${port}`
		};
		
		fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
		console.log(`Config sauvegardée: ${CONFIG_FILE}`);
	} catch (err) {
		console.error("Erreur sauvegarde config:", err);
	}
}

// Helper pour parser le body JSON
function parseJSONBody(req) {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", chunk => { body += chunk; });
		req.on("end", () => {
			try {
				resolve(JSON.parse(body));
			} catch (e) {
				reject(e);
			}
		});
		req.on("error", reject);
	});
}

// Démarrer le serveur HTTP local pour DayZ
async function startLocalServer() {
	httpPort = await findFreePort();
	
	httpServer = http.createServer(async (req, res) => {
		// CORS headers - autoriser localhost et 127.0.0.1
		const origin = req.headers.origin;
		if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
			res.setHeader("Access-Control-Allow-Origin", origin);
		} else {
			res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1");
		}
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		
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
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
				
			} else if (url === "/ptt/release" && req.method === "POST") {
				console.log("[HTTP] PTT Release from DayZ - isPTTPressed:", isPTTPressed, "mainWindow:", !!mainWindow);
				if (mainWindow && isPTTPressed) {
					isPTTPressed = false;
					console.log("[HTTP] Sending ptt:release to renderer");
					mainWindow.webContents.send("ptt:release");
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
				
			// ========================================
			// Status Endpoint
			// ========================================
			} else if (url === "/status" && req.method === "GET") {
				// Determine connection status
				// WAITING_FOR_CONNECTION: App is running but no server URL configured
				// CONNECTED: App is connected to a VoIP server
				// DISCONNECTED: App was connected but lost connection
				let status = "DISCONNECTED";
				if (serverURL) {
					status = "CONNECTED";
				} else if (mainWindow) {
					status = "WAITING_FOR_CONNECTION";
				}
				
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ 
					running: true,
					status: status,
					pttPressed: isPTTPressed,
					connected: serverURL !== null,
					serverURL: serverURL
				}));
				
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
					
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ success: true, url: serverURL }));
				} else {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Missing url parameter" }));
				}
				
			} else if (url === "/disconnect" && req.method === "POST") {
				disconnect("manual");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
				
			} else if (url === "/heartbeat" && req.method === "POST") {
				lastHeartbeat = Date.now();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
				
			// ========================================
			// Legacy Single Frequency Endpoint
			// ========================================
			} else if (url === "/frequency" && req.method === "POST") {
				const data = await parseJSONBody(req);
				if (data.frequency !== undefined) {
					const frequency = String(data.frequency);
					console.log("[HTTP] Frequency change from DayZ:", frequency);
					
					if (mainWindow) {
						mainWindow.webContents.send("frequency:change", frequency);
					}
					
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ success: true, frequency: frequency }));
				} else {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Missing frequency parameter" }));
				}
				
			// ========================================
			// NEW: Multi-Frequency Endpoints
			// ========================================
			} else if (url === "/frequencies" && req.method === "POST") {
				// Receive array of frequencies with ear side
				// Body: {"frequencies": [{"frequency": 45.3, "earSide": 0}, ...]}
				const data = await parseJSONBody(req);
				
				if (!Array.isArray(data.frequencies)) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "frequencies must be an array" }));
					return;
				}
				
				// Validate frequency objects
				const isValid = data.frequencies.every(f => 
					typeof f === "object" &&
					typeof f.frequency === "number" &&
					typeof f.earSide === "number" &&
					[0, 1, 2].includes(f.earSide)
				);
				
				if (!isValid) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ 
						error: "Invalid frequency format. Expected: [{frequency: number, earSide: 0|1|2}]" 
					}));
					return;
				}
				
				// Convert frequencies to strings for server compatibility
				const frequenciesWithStrings = data.frequencies.map(f => ({
					frequency: String(f.frequency),
					earSide: f.earSide
				}));
				
				console.log("[HTTP] Frequencies update from DayZ:", frequenciesWithStrings.length, "frequencies");
				
				if (mainWindow) {
					mainWindow.webContents.send("frequencies:update", frequenciesWithStrings);
				}
				
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true, count: frequenciesWithStrings.length }));
				
			} else if (url === "/active-channel" && req.method === "POST") {
				// Set which frequency is active for transmission
				// Body: {"frequency": 45.3}
				const data = await parseJSONBody(req);
				
				if (typeof data.frequency !== "number") {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "frequency must be a number" }));
					return;
				}
				
				const frequencyStr = String(data.frequency);
				console.log("[HTTP] Active channel change from DayZ:", frequencyStr);
				
				if (mainWindow) {
					mainWindow.webContents.send("active-channel:change", frequencyStr);
				}
				
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true, frequency: frequencyStr }));
				
			} else if (url === "/ear-side" && req.method === "POST") {
				// Change ear side for a specific frequency
				// Body: {"frequency": 45.3, "earSide": 0|1|2}
				const data = await parseJSONBody(req);
				
				if (typeof data.frequency !== "number" || typeof data.earSide !== "number") {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "frequency and earSide must be numbers" }));
					return;
				}
				
				if (![0, 1, 2].includes(data.earSide)) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "earSide must be 0 (left), 1 (right), or 2 (both)" }));
					return;
				}
				
				const frequencyStr = String(data.frequency);
				console.log("[HTTP] Ear side change from DayZ:", frequencyStr, "earSide:", data.earSide);
				
				if (mainWindow) {
					mainWindow.webContents.send("ear-side:change", { frequency: frequencyStr, earSide: data.earSide });
				}
				
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true, frequency: frequencyStr, earSide: data.earSide }));
				
			} else if (url === "/frequency/disconnect" && req.method === "POST") {
				// Disconnect from a single frequency
				// Body: {"frequency": 45.3}
				const data = await parseJSONBody(req);
				
				if (typeof data.frequency !== "number") {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "frequency must be a number" }));
					return;
				}
				
				const frequencyStr = String(data.frequency);
				console.log("[HTTP] Frequency disconnect from DayZ:", frequencyStr);
				
				if (mainWindow) {
					mainWindow.webContents.send("frequency:disconnect", frequencyStr);
				}
				
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true, frequency: frequencyStr }));
				
			// ========================================
			// 404 Not Found
			// ========================================
			} else {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Not found" }));
			}
		} catch (e) {
			console.error("[HTTP] Error:", e);
			res.writeHead(400, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Invalid JSON" }));
		}
	});
	
	httpServer.listen(httpPort, "127.0.0.1", () => {
		console.log(`Serveur HTTP local démarré sur http://127.0.0.1:${httpPort}`);
		saveConfig(httpPort);
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
			devTools: isDev, // Disable DevTools in production
		},
		autoHideMenuBar: true,
		backgroundColor: "#0d0d1a",
	});

	// In dev, load local Vite server
	// In prod, wait for DayZ to send URL via /connect
	if (isDev) {
		mainWindow.loadURL("http://localhost:3001");
		mainWindow.webContents.openDevTools();
	} else if (serverURL) {
		mainWindow.loadURL(serverURL);
	} else {
		// Show waiting page
		mainWindow.loadFile(path.join(__dirname, "waiting.html"));
	}

	// Injecter le code secret dans la page waiting
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
