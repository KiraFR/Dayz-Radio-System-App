# CLAUDE.md - Project Guidelines for AI Assistants

## Project Overview

**Radio VoIP DayZ** is an Electron application that provides VoIP radio communication for DayZ game servers. It acts as a bridge between the DayZ game (via HTTP API) and a WebRTC-based VoIP server.

## Tech Stack

- **Runtime**: Electron 33.x
- **Language**: JavaScript (CommonJS)
- **Build**: electron-builder (Windows portable)
- **Tests**: Jest

## Project Structure

```
RadioSystemElectronApp/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.cjs          # Entry point + HTTP server
│   │   ├── httpServer.cjs     # HTTP utilities (testable)
│   │   └── config.cjs         # Configuration utilities (testable)
│   ├── preload/               # Preload scripts
│   │   └── index.cjs          # Context bridge & IPC
│   └── renderer/              # UI/Frontend
│       ├── waiting.html       # Waiting page
│       ├── titlebar.js        # Custom titlebar
│       └── titlebar.css       # Titlebar styles
├── tests/                     # Unit & integration tests
│   ├── httpServer.test.js
│   ├── config.test.js
│   ├── preload.test.js
│   └── integration.test.js
├── assets/                    # Static resources
│   └── icon.ico
├── .github/workflows/         # CI/CD
│   └── ci.yml
├── .env                       # Environment variables
├── .env.example
├── package.json
├── README.md
└── CLAUDE.md
```

## Commands

```bash
# Development
npm run dev           # Run Electron in dev mode (connects to localhost:3001)

# Testing
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Build
npm run build         # Build portable Windows executable
npm run pack          # Build unpacked directory (for debugging)
```

## Architecture

```
┌─────────────┐    HTTP API    ┌──────────────────┐    WebSocket    ┌─────────────┐
│    DayZ     │ ◄────────────► │  Electron App    │ ◄─────────────► │ VoIP Server │
│   (Game)    │   localhost    │  (src/main)      │                 │  (WebRTC)   │
└─────────────┘                └──────────────────┘                 └─────────────┘
```

### Communication Flow

1. Electron starts HTTP server on free port (starting at 19800)
2. Port saved to `%LOCALAPPDATA%/DayZ/RadioVOIP/config.json`
3. DayZ mod reads config and sends HTTP commands
4. Electron loads VoIP web client and bridges events via IPC

## Key Modules

### src/main/httpServer.cjs
Testable HTTP utilities:
- `findFreePort(startPort)` - Find available port
- `parseJSONBody(req)` - Parse HTTP request body
- `isValidFrequency(freq)` - Validate frequency object
- `isValidFrequenciesArray(arr)` - Validate frequencies array
- `setCORSHeaders(res, origin)` - Set CORS headers
- `sendJSON(res, status, data)` - Send JSON response
- `getConnectionStatus(serverURL, mainWindow)` - Get app status

### src/main/config.cjs
Configuration utilities:
- `loadEnvFile(path)` - Parse .env file
- `applyEnv(env)` - Apply to process.env
- `saveConfig(path, port)` - Save config for DayZ
- `readConfig(path)` - Read config file
- `getDefaultConfigPath()` - Get default config location

## HTTP API Endpoints

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/status` | GET | - | App status |
| `/connect` | POST | `{url}` | Connect to VoIP server |
| `/disconnect` | POST | - | Disconnect |
| `/heartbeat` | POST | - | Keep-alive (30s timeout) |
| `/ptt/press` | POST | - | PTT press |
| `/ptt/release` | POST | - | PTT release |
| `/frequency` | POST | `{frequency}` | Set frequency (legacy) |
| `/frequencies` | POST | `{frequencies: [{frequency, earSide}]}` | Multi-frequency |
| `/active-channel` | POST | `{frequency}` | Set TX channel |
| `/ear-side` | POST | `{frequency, earSide}` | Change ear (0=L, 1=R, 2=Both) |
| `/frequency/disconnect` | POST | `{frequency}` | Leave frequency |

## IPC Channels

### Main → Renderer
- `ptt:press` / `ptt:release`
- `frequency:change`
- `frequencies:update`
- `active-channel:change`
- `frequency:disconnect`
- `ear-side:change`

### Renderer → Main
- `window-minimize` / `window-maximize` / `window-close`
- `get-server-url` (invoke)
- `get-http-port` (invoke)

## Environment Variables

```env
SECRET_CODE=iamradiovoip  # Konami code for manual connection
```

## Code Conventions

- Use CommonJS (`require`/`module.exports`) for Electron compatibility
- Keep business logic in `src/main/` modules for testability
- All HTTP responses use `sendJSON()` helper
- Frequencies are converted to strings for server compatibility
- earSide values: `0` = Left, `1` = Right, `2` = Both

## Testing Guidelines

- Unit tests in `tests/` directory
- Mock Electron modules when testing preload
- Use `createMockRequest/Response` helpers for HTTP tests
- Integration tests use real HTTP server on random port

## Build Notes

- Output: `dist/RadioVoIP-DayZ.exe` (portable)
- Excluded from build: `tests/`, `coverage/`, `*.test.js`
- DevTools disabled in production (`isDev = !app.isPackaged`)

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
- **test**: Run tests on ubuntu-latest
- **build**: Build on windows-latest (after tests pass)
- **release**: Create draft release with changelog (on push to main)

## Hidden Features

- Type `iamradiovoip` on waiting screen → Manual connection dialog
- Configurable via `SECRET_CODE` in `.env`
