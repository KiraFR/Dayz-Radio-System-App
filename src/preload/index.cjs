const { contextBridge, ipcRenderer } = require("electron");

// CSS de la barre de titre
const TITLEBAR_CSS = `
.electron-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    background: #0d0d1a;
    -webkit-app-region: drag;
    user-select: none;
    padding: 0 10px;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 99999;
}
.electron-titlebar-title {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 12px;
    color: #888;
}
.electron-titlebar-buttons {
    display: flex;
    -webkit-app-region: no-drag;
}
.electron-titlebar-btn {
    width: 46px;
    height: 32px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: #888;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}
.electron-titlebar-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}
.electron-titlebar-btn.close:hover {
    background: #e94560;
    color: #fff;
}
body {
    padding-top: 32px !important;
    overflow: hidden !important;
}
`;

// Injecter la barre de titre au chargement de la page
function injectTitlebar() {
	// Ne pas injecter si déjà présente
	if (document.querySelector('.electron-titlebar')) return;

	// Injecter le CSS
	const style = document.createElement("style");
	style.textContent = TITLEBAR_CSS;
	document.head.appendChild(style);

	// Créer la barre de titre
	const titlebar = document.createElement('div');
	titlebar.className = 'electron-titlebar';
	titlebar.innerHTML = `
		<div class="electron-titlebar-title">Radio VoIP DayZ</div>
		<div class="electron-titlebar-buttons">
			<button class="electron-titlebar-btn" id="electron-btn-minimize">&#8211;</button>
			<button class="electron-titlebar-btn" id="electron-btn-maximize">&#9633;</button>
			<button class="electron-titlebar-btn close" id="electron-btn-close">&#10005;</button>
		</div>
	`;
	document.body.insertBefore(titlebar, document.body.firstChild);

	// Event listeners
	document.getElementById('electron-btn-minimize').addEventListener('click', () => {
		ipcRenderer.send('window-minimize');
	});
	document.getElementById('electron-btn-maximize').addEventListener('click', () => {
		ipcRenderer.send('window-maximize');
	});
	document.getElementById('electron-btn-close').addEventListener('click', () => {
		ipcRenderer.send('window-close');
	});
}

// Attendre que le DOM soit prêt
window.addEventListener("DOMContentLoaded", () => {
	injectTitlebar();
});

// Expose protected methods to the renderer process
// Use removeAllListeners before adding new ones to prevent duplicates
contextBridge.exposeInMainWorld("electronAPI", {
	// PTT events from DayZ via main process
	onPTTPress: (callback) => {
		ipcRenderer.removeAllListeners("ptt:press");
		ipcRenderer.on("ptt:press", () => callback());
	},
	onPTTRelease: (callback) => {
		ipcRenderer.removeAllListeners("ptt:release");
		ipcRenderer.on("ptt:release", () => callback());
	},
	
	// Frequency change from DayZ (legacy single frequency)
	onFrequencyChange: (callback) => {
		ipcRenderer.removeAllListeners("frequency:change");
		ipcRenderer.on("frequency:change", (event, frequency) => callback(frequency));
	},

	// Multi-frequency support
	onFrequenciesUpdate: (callback) => {
		ipcRenderer.removeAllListeners("frequencies:update");
		ipcRenderer.on("frequencies:update", (event, frequencies) => callback(frequencies));
	},
	onActiveChannelChange: (callback) => {
		ipcRenderer.removeAllListeners("active-channel:change");
		ipcRenderer.on("active-channel:change", (event, frequency) => callback(frequency));
	},
	onFrequencyDisconnect: (callback) => {
		ipcRenderer.removeAllListeners("frequency:disconnect");
		ipcRenderer.on("frequency:disconnect", (event, frequency) => callback(frequency));
	},
	onEarSideChange: (callback) => {
		ipcRenderer.removeAllListeners("ear-side:change");
		ipcRenderer.on("ear-side:change", (event, data) => callback(data));
	},

	// Get configuration
	getServerURL: () => ipcRenderer.invoke("get-server-url"),

	// Window controls
	minimize: () => ipcRenderer.send("window-minimize"),
	maximize: () => ipcRenderer.send("window-maximize"),
	close: () => ipcRenderer.send("window-close"),

	// Check if running in Electron
	isElectron: true,
});
