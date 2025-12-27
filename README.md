# Radio VoIP DayZ

[![CI/CD](https://github.com/KiraFR/Dayz-Radio-System-App/actions/workflows/ci.yml/badge.svg)](https://github.com/KiraFR/Dayz-Radio-System-App/actions/workflows/ci.yml)
[![VirusTotal](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/KiraFR/90562d429a3526fd4a110a29cf064bbe/raw/virustotal-badge.json&logo=virustotal)](https://github.com/KiraFR/Dayz-Radio-System-App/actions/workflows/ci.yml)

A standalone Electron application that provides VoIP (Voice over IP) radio communication for DayZ servers. This app runs alongside DayZ and enables in-game radio functionality with Push-to-Talk (PTT) support and multi-frequency channels.

## Security

Every release is automatically scanned with [VirusTotal](https://www.virustotal.com/) before publication. The CI/CD pipeline waits for the full analysis to complete and displays the results directly in the workflow logs.

**Note:** This application is not code-signed, which may trigger false positives from some antivirus engines. The build will fail if more than 5 engines flag the executable as malicious.

Check the [CI/CD workflow](https://github.com/KiraFR/Dayz-Radio-System-App/actions/workflows/ci.yml) → "Virus Scan" job for detailed analysis results.

---

## For Users

### What is this?

Radio VoIP DayZ is a companion app that adds realistic radio communication to your DayZ gameplay. When you use a radio item in-game, this app handles the actual voice transmission to other players on the same frequency.

### Features

- **Push-to-Talk (PTT)**: Controlled directly from DayZ
- **Multiple frequencies**: Listen to several channels simultaneously
- **Stereo audio**: Choose left ear, right ear, or both for each frequency
- **Automatic connection**: Connects automatically when you join a compatible server

### Installation

1. Download the latest `RadioVoIP-DayZ.exe` from the [Releases](../../releases) page
2. Run the executable (no installation required - it's portable)
3. Join a DayZ server that supports Radio VoIP
4. The app will connect automatically when you use a radio in-game

### How to Use

1. Launch `RadioVoIP-DayZ.exe` before or after starting DayZ
2. The app shows "Waiting for connection..." until you join a compatible server
3. Once connected, use your radio in DayZ - PTT is handled by the game
4. The app window shows your current frequency and connection status

### Troubleshooting

| Issue | Solution |
|-------|----------|
| App stuck on "Waiting..." | Make sure the DayZ server supports Radio VoIP |
| No audio | Check your microphone permissions and audio settings |
| Connection lost | The app will automatically return to waiting mode - rejoin the server |

---

## For Developers

### Tech Stack

- **Electron** 33.x
- **Node.js** (CommonJS modules)
- **Local HTTP server** for DayZ ↔ Electron communication

### Project Structure

```
RadioSystemElectronApp/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.cjs      # Entry point + HTTP server
│   │   ├── httpServer.cjs # HTTP utilities
│   │   └── config.cjs     # Configuration utilities
│   ├── preload/           # Preload scripts
│   │   └── index.cjs      # Context bridge & IPC
│   └── renderer/          # UI/Frontend
│       ├── waiting.html   # Waiting page
│       ├── titlebar.js    # Custom titlebar
│       └── titlebar.css   # Titlebar styles
├── tests/                 # Unit & integration tests
├── assets/                # Static resources
│   └── icon.ico
├── .github/workflows/     # CI/CD
└── package.json
```

### Architecture

```
┌─────────────┐    HTTP API    ┌──────────────────┐    WebSocket    ┌─────────────┐
│    DayZ     │ ◄────────────► │  Electron App    │ ◄─────────────► │ VoIP Server │
│   (Game)    │   localhost    │  (main.cjs)      │                 │  (WebRTC)   │
└─────────────┘                └──────────────────┘                 └─────────────┘
```

**Communication Flow:**
1. Electron starts a local HTTP server on a free port (starting at 19800)
2. Port is saved to `%LOCALAPPDATA%/DayZ/RadioVOIP/config.json`
3. DayZ mod reads this config and sends commands via HTTP
4. Electron loads the VoIP web client and bridges PTT/frequency events

### HTTP API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Get app status (running, connected, PTT state) |
| `/connect` | POST | Connect to VoIP server `{url: "http://..."}` |
| `/disconnect` | POST | Disconnect and return to waiting page |
| `/heartbeat` | POST | Keep-alive signal (30s timeout) |
| `/ptt/press` | POST | Trigger PTT press |
| `/ptt/release` | POST | Trigger PTT release |
| `/frequency` | POST | Set frequency (legacy) `{frequency: 45.3}` |
| `/frequencies` | POST | Set multiple frequencies `{frequencies: [{frequency: 45.3, earSide: 0}, ...]}` |
| `/active-channel` | POST | Set active TX channel `{frequency: 45.3}` |
| `/ear-side` | POST | Change ear side `{frequency: 45.3, earSide: 0\|1\|2}` |
| `/frequency/disconnect` | POST | Leave a frequency `{frequency: 45.3}` |

**Ear Side Values:** `0` = Left, `1` = Right, `2` = Both

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-repo/RadioSystemElectronApp.git
cd RadioSystemElectronApp

# Install dependencies
npm install

# Run in development mode (connects to localhost:3001)
npm run dev

# Build portable executable
npm run build
```

### Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
SECRET_CODE=iamradiovoip  # Konami code to open manual connection modal
```

### GitHub Secrets (for CI/CD)

Configure these secrets in your repository settings (`Settings → Secrets and variables → Actions`):

| Secret | Required | Description |
|--------|----------|-------------|
| `SECRET_CODE` | Yes | Konami code for manual connection modal (e.g., `iamradiovoip`) |
| `VIRUSTOTAL_API_KEY` | Yes | API key from [VirusTotal](https://www.virustotal.com/) for malware scanning |
| `GIST_TOKEN` | Yes | GitHub PAT with `gist` scope for updating the VirusTotal badge |
| `RELEASE_TOKEN` | No | GitHub PAT for creating releases (falls back to `GITHUB_TOKEN`) |

**Repository Variables** (`Settings → Secrets and variables → Actions → Variables`):

| Variable | Required | Description |
|----------|----------|-------------|
| `VIRUSTOTAL_GIST_ID` | Yes | ID of the gist used for the dynamic VirusTotal badge |

> **Setup for VirusTotal badge:**
> 1. Create a new [GitHub Gist](https://gist.github.com/) (can be empty, name it `virustotal-badge.json`)
> 2. Copy the Gist ID from the URL (e.g., `https://gist.github.com/KiraFR/abc123` → `abc123`)
> 3. Add it as repository variable `VIRUSTOTAL_GIST_ID`
> 4. Create a PAT with `gist` scope and add it as secret `GIST_TOKEN`
> 5. Update the badge URL in README.md with your Gist ID

### IPC Events (Renderer ↔ Main)

**From Main to Renderer:**
- `ptt:press` / `ptt:release` - PTT state changes
- `frequency:change` - Single frequency update
- `frequencies:update` - Multi-frequency update
- `active-channel:change` - Active TX channel changed
- `frequency:disconnect` - Frequency removed
- `ear-side:change` - Ear side changed for a frequency

**Exposed via `window.electronAPI`:**
```javascript
electronAPI.onPTTPress(callback)
electronAPI.onPTTRelease(callback)
electronAPI.onFrequencyChange(callback)
electronAPI.onFrequenciesUpdate(callback)
electronAPI.onActiveChannelChange(callback)
electronAPI.onFrequencyDisconnect(callback)
electronAPI.onEarSideChange(callback)
electronAPI.getServerURL()
electronAPI.minimize()
electronAPI.maximize()
electronAPI.close()
electronAPI.isElectron  // true
```

### Build Output

- **Target:** Windows portable executable
- **Output:** `dist/RadioVoIP-DayZ.exe`
- **App ID:** `com.dayz.radio-voip`

---

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributors

<a href="https://github.com/KiraFR">
  <img src="https://github.com/KiraFR.png" width="50" height="50" alt="KiraFR" style="border-radius: 50%;" />
</a>

**[KiraFR](https://github.com/KiraFR)** - Creator & Maintainer

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
