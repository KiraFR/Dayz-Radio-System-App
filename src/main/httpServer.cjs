/**
 * HTTP Server module for Radio VoIP DayZ
 * Handles communication between DayZ and the Electron app
 */

const http = require("http");

/**
 * Parse JSON body from HTTP request
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
function parseJSONBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on("error", reject);
    });
}

/**
 * Find a free port starting from startPort
 * @param {number} startPort
 * @returns {Promise<number>}
 */
function findFreePort(startPort = 19800) {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(startPort, "127.0.0.1", () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on("error", () => {
            resolve(findFreePort(startPort + 1));
        });
    });
}

/**
 * Validate frequency object
 * @param {object} freq - Frequency object with frequency and earSide
 * @returns {boolean}
 */
function isValidFrequency(freq) {
    return (
        typeof freq === "object" &&
        freq !== null &&
        typeof freq.frequency === "number" &&
        typeof freq.earSide === "number" &&
        [0, 1, 2].includes(freq.earSide)
    );
}

/**
 * Validate array of frequencies
 * @param {Array} frequencies
 * @returns {boolean}
 */
function isValidFrequenciesArray(frequencies) {
    if (!Array.isArray(frequencies)) return false;
    return frequencies.every(isValidFrequency);
}

/**
 * Convert frequency number to string
 * @param {number} frequency
 * @returns {string}
 */
function frequencyToString(frequency) {
    return String(frequency);
}

/**
 * Set CORS headers on response
 * @param {http.ServerResponse} res
 * @param {string} origin
 */
function setCORSHeaders(res, origin) {
    if (origin && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
        res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Send JSON response
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {object} data
 */
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

/**
 * Determine connection status
 * @param {string|null} serverURL
 * @param {object|null} mainWindow
 * @returns {string}
 */
function getConnectionStatus(serverURL, mainWindow) {
    if (serverURL) {
        return "CONNECTED";
    } else if (mainWindow) {
        return "WAITING_FOR_CONNECTION";
    }
    return "DISCONNECTED";
}

/**
 * Create HTTP request handler
 * @param {object} state - Application state
 * @param {object} callbacks - Callback functions
 * @returns {function}
 */
function createRequestHandler(state, callbacks) {
    return async (req, res) => {
        const origin = req.headers.origin;
        setCORSHeaders(res, origin);

        if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
            return;
        }

        const url = req.url;

        try {
            // PTT Endpoints
            if (url === "/ptt/press" && req.method === "POST") {
                if (state.mainWindow && !state.isPTTPressed) {
                    state.isPTTPressed = true;
                    callbacks.onPTTPress?.();
                }
                sendJSON(res, 200, { success: true });
            }
            else if (url === "/ptt/release" && req.method === "POST") {
                if (state.mainWindow && state.isPTTPressed) {
                    state.isPTTPressed = false;
                    callbacks.onPTTRelease?.();
                }
                sendJSON(res, 200, { success: true });
            }
            // Status Endpoint
            else if (url === "/status" && req.method === "GET") {
                const status = getConnectionStatus(state.serverURL, state.mainWindow);
                sendJSON(res, 200, {
                    running: true,
                    status: status,
                    pttPressed: state.isPTTPressed,
                    connected: state.serverURL !== null,
                    serverURL: state.serverURL
                });
            }
            // Connection Endpoints
            else if (url === "/connect" && req.method === "POST") {
                const data = await parseJSONBody(req);
                if (data.url) {
                    state.serverURL = data.url;
                    state.lastHeartbeat = Date.now();
                    callbacks.onConnect?.(data.url);
                    sendJSON(res, 200, { success: true, url: state.serverURL });
                } else {
                    sendJSON(res, 400, { error: "Missing url parameter" });
                }
            }
            else if (url === "/disconnect" && req.method === "POST") {
                callbacks.onDisconnect?.("manual");
                sendJSON(res, 200, { success: true });
            }
            else if (url === "/heartbeat" && req.method === "POST") {
                state.lastHeartbeat = Date.now();
                sendJSON(res, 200, { success: true });
            }
            // Legacy Single Frequency Endpoint
            else if (url === "/frequency" && req.method === "POST") {
                const data = await parseJSONBody(req);
                if (data.frequency !== undefined) {
                    const frequency = frequencyToString(data.frequency);
                    callbacks.onFrequencyChange?.(frequency);
                    sendJSON(res, 200, { success: true, frequency: frequency });
                } else {
                    sendJSON(res, 400, { error: "Missing frequency parameter" });
                }
            }
            // Multi-Frequency Endpoints
            else if (url === "/frequencies" && req.method === "POST") {
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

                callbacks.onFrequenciesUpdate?.(frequenciesWithStrings);
                sendJSON(res, 200, { success: true, count: frequenciesWithStrings.length });
            }
            else if (url === "/active-channel" && req.method === "POST") {
                const data = await parseJSONBody(req);

                if (typeof data.frequency !== "number") {
                    sendJSON(res, 400, { error: "frequency must be a number" });
                    return;
                }

                const frequencyStr = frequencyToString(data.frequency);
                callbacks.onActiveChannelChange?.(frequencyStr);
                sendJSON(res, 200, { success: true, frequency: frequencyStr });
            }
            else if (url === "/ear-side" && req.method === "POST") {
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
                callbacks.onEarSideChange?.({ frequency: frequencyStr, earSide: data.earSide });
                sendJSON(res, 200, { success: true, frequency: frequencyStr, earSide: data.earSide });
            }
            else if (url === "/frequency/disconnect" && req.method === "POST") {
                const data = await parseJSONBody(req);

                if (typeof data.frequency !== "number") {
                    sendJSON(res, 400, { error: "frequency must be a number" });
                    return;
                }

                const frequencyStr = frequencyToString(data.frequency);
                callbacks.onFrequencyDisconnect?.(frequencyStr);
                sendJSON(res, 200, { success: true, frequency: frequencyStr });
            }
            // 404 Not Found
            else {
                sendJSON(res, 404, { error: "Not found" });
            }
        } catch (e) {
            sendJSON(res, 400, { error: "Invalid JSON" });
        }
    };
}

module.exports = {
    parseJSONBody,
    findFreePort,
    isValidFrequency,
    isValidFrequenciesArray,
    frequencyToString,
    setCORSHeaders,
    sendJSON,
    getConnectionStatus,
    createRequestHandler
};
