# Radio VoIP DayZ

A standalone Electron application that provides VoIP (Voice over IP) radio communication for DayZ servers. This app runs alongside DayZ and enables in-game radio functionality with Push-to-Talk (PTT) support and multi-frequency channels.

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
├── main.cjs          # Electron main process + HTTP server
├── preload.cjs       # Context bridge & titlebar injection
├── waiting.html      # Waiting page (shown before connection)
├── titlebar.js       # Custom titlebar component
├── titlebar.css      # Titlebar styles
├── icon.ico          # Application icon
└── package.json      # Dependencies & build config
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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
