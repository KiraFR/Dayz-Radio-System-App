/**
 * Unit tests for HTTP Server module
 */

const http = require("http");
const {
    parseJSONBody,
    findFreePort,
    isValidFrequency,
    isValidFrequenciesArray,
    frequencyToString,
    setCORSHeaders,
    sendJSON,
    getConnectionStatus,
    createRequestHandler
} = require("../lib/httpServer.cjs");

// Mock HTTP response
function createMockResponse() {
    const res = {
        headers: {},
        statusCode: null,
        body: null,
        setHeader: jest.fn((key, value) => {
            res.headers[key] = value;
        }),
        writeHead: jest.fn((code, headers) => {
            res.statusCode = code;
            if (headers) {
                Object.assign(res.headers, headers);
            }
        }),
        end: jest.fn((data) => {
            res.body = data;
        })
    };
    return res;
}

// Mock HTTP request
function createMockRequest(method, url, body = null, headers = {}) {
    const { EventEmitter } = require("events");
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = headers;

    // Simulate body data
    if (body) {
        setTimeout(() => {
            req.emit("data", JSON.stringify(body));
            req.emit("end");
        }, 0);
    } else {
        setTimeout(() => {
            req.emit("end");
        }, 0);
    }

    return req;
}

describe("httpServer module", () => {

    // ==========================================
    // parseJSONBody tests
    // ==========================================
    describe("parseJSONBody", () => {
        test("should parse valid JSON body", async () => {
            const req = createMockRequest("POST", "/test", { key: "value" });
            const result = await parseJSONBody(req);
            expect(result).toEqual({ key: "value" });
        });

        test("should return empty object for empty body", async () => {
            const req = createMockRequest("POST", "/test");
            const result = await parseJSONBody(req);
            expect(result).toEqual({});
        });

        test("should reject invalid JSON", async () => {
            const { EventEmitter } = require("events");
            const req = new EventEmitter();
            req.method = "POST";
            req.url = "/test";
            req.headers = {};

            setTimeout(() => {
                req.emit("data", "invalid json {{{");
                req.emit("end");
            }, 0);

            await expect(parseJSONBody(req)).rejects.toThrow();
        });

        test("should reject on request error", async () => {
            const { EventEmitter } = require("events");
            const req = new EventEmitter();
            req.method = "POST";
            req.url = "/test";
            req.headers = {};

            setTimeout(() => {
                req.emit("error", new Error("Connection reset"));
            }, 0);

            await expect(parseJSONBody(req)).rejects.toThrow("Connection reset");
        });
    });

    // ==========================================
    // findFreePort tests
    // ==========================================
    describe("findFreePort", () => {
        test("should find a free port", async () => {
            const port = await findFreePort(19800);
            expect(typeof port).toBe("number");
            expect(port).toBeGreaterThanOrEqual(19800);
        });

        test("should find next port if first is busy", async () => {
            // Start a server on a port
            const server = http.createServer();
            await new Promise(resolve => server.listen(19850, "127.0.0.1", resolve));

            try {
                const port = await findFreePort(19850);
                expect(port).toBeGreaterThan(19850);
            } finally {
                server.close();
            }
        });
    });

    // ==========================================
    // isValidFrequency tests
    // ==========================================
    describe("isValidFrequency", () => {
        test("should return true for valid frequency object", () => {
            expect(isValidFrequency({ frequency: 45.3, earSide: 0 })).toBe(true);
            expect(isValidFrequency({ frequency: 100.0, earSide: 1 })).toBe(true);
            expect(isValidFrequency({ frequency: 87.5, earSide: 2 })).toBe(true);
        });

        test("should return false for invalid earSide values", () => {
            expect(isValidFrequency({ frequency: 45.3, earSide: 3 })).toBe(false);
            expect(isValidFrequency({ frequency: 45.3, earSide: -1 })).toBe(false);
            expect(isValidFrequency({ frequency: 45.3, earSide: 10 })).toBe(false);
        });

        test("should return false for missing properties", () => {
            expect(isValidFrequency({ frequency: 45.3 })).toBe(false);
            expect(isValidFrequency({ earSide: 0 })).toBe(false);
            expect(isValidFrequency({})).toBe(false);
        });

        test("should return false for wrong types", () => {
            expect(isValidFrequency({ frequency: "45.3", earSide: 0 })).toBe(false);
            expect(isValidFrequency({ frequency: 45.3, earSide: "0" })).toBe(false);
            expect(isValidFrequency(null)).toBe(false);
            expect(isValidFrequency(undefined)).toBe(false);
            expect(isValidFrequency("string")).toBe(false);
            expect(isValidFrequency(123)).toBe(false);
        });
    });

    // ==========================================
    // isValidFrequenciesArray tests
    // ==========================================
    describe("isValidFrequenciesArray", () => {
        test("should return true for valid array", () => {
            expect(isValidFrequenciesArray([
                { frequency: 45.3, earSide: 0 },
                { frequency: 100.0, earSide: 1 }
            ])).toBe(true);
        });

        test("should return true for empty array", () => {
            expect(isValidFrequenciesArray([])).toBe(true);
        });

        test("should return false for non-array", () => {
            expect(isValidFrequenciesArray(null)).toBe(false);
            expect(isValidFrequenciesArray(undefined)).toBe(false);
            expect(isValidFrequenciesArray({})).toBe(false);
            expect(isValidFrequenciesArray("array")).toBe(false);
        });

        test("should return false if any frequency is invalid", () => {
            expect(isValidFrequenciesArray([
                { frequency: 45.3, earSide: 0 },
                { frequency: 100.0, earSide: 5 } // invalid earSide
            ])).toBe(false);
        });
    });

    // ==========================================
    // frequencyToString tests
    // ==========================================
    describe("frequencyToString", () => {
        test("should convert number to string", () => {
            expect(frequencyToString(45.3)).toBe("45.3");
            expect(frequencyToString(100)).toBe("100");
            expect(frequencyToString(0)).toBe("0");
        });

        test("should handle edge cases", () => {
            expect(frequencyToString(NaN)).toBe("NaN");
            expect(frequencyToString(Infinity)).toBe("Infinity");
        });
    });

    // ==========================================
    // setCORSHeaders tests
    // ==========================================
    describe("setCORSHeaders", () => {
        test("should set CORS headers for localhost origin", () => {
            const res = createMockResponse();
            setCORSHeaders(res, "http://localhost:3000");

            expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "http://localhost:3000");
            expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Headers", "Content-Type");
        });

        test("should set CORS headers for 127.0.0.1 origin", () => {
            const res = createMockResponse();
            setCORSHeaders(res, "http://127.0.0.1:5000");

            expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "http://127.0.0.1:5000");
        });

        test("should default to 127.0.0.1 for unknown origin", () => {
            const res = createMockResponse();
            setCORSHeaders(res, "http://example.com");

            expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "http://127.0.0.1");
        });

        test("should default to 127.0.0.1 for null origin", () => {
            const res = createMockResponse();
            setCORSHeaders(res, null);

            expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "http://127.0.0.1");
        });
    });

    // ==========================================
    // sendJSON tests
    // ==========================================
    describe("sendJSON", () => {
        test("should send JSON response with status code", () => {
            const res = createMockResponse();
            sendJSON(res, 200, { success: true });

            expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });
            expect(res.end).toHaveBeenCalledWith('{"success":true}');
        });

        test("should send error response", () => {
            const res = createMockResponse();
            sendJSON(res, 400, { error: "Bad request" });

            expect(res.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json" });
            expect(res.end).toHaveBeenCalledWith('{"error":"Bad request"}');
        });
    });

    // ==========================================
    // getConnectionStatus tests
    // ==========================================
    describe("getConnectionStatus", () => {
        test("should return CONNECTED when serverURL is set", () => {
            expect(getConnectionStatus("http://example.com", {})).toBe("CONNECTED");
        });

        test("should return WAITING_FOR_CONNECTION when only mainWindow exists", () => {
            expect(getConnectionStatus(null, {})).toBe("WAITING_FOR_CONNECTION");
        });

        test("should return DISCONNECTED when both are null", () => {
            expect(getConnectionStatus(null, null)).toBe("DISCONNECTED");
        });
    });

    // ==========================================
    // createRequestHandler tests
    // ==========================================
    describe("createRequestHandler", () => {
        let state;
        let callbacks;
        let handler;

        beforeEach(() => {
            state = {
                mainWindow: {},
                isPTTPressed: false,
                serverURL: null,
                lastHeartbeat: null
            };
            callbacks = {
                onPTTPress: jest.fn(),
                onPTTRelease: jest.fn(),
                onConnect: jest.fn(),
                onDisconnect: jest.fn(),
                onFrequencyChange: jest.fn(),
                onFrequenciesUpdate: jest.fn(),
                onActiveChannelChange: jest.fn(),
                onEarSideChange: jest.fn(),
                onFrequencyDisconnect: jest.fn()
            };
            handler = createRequestHandler(state, callbacks);
        });

        test("should handle OPTIONS request", async () => {
            const req = createMockRequest("OPTIONS", "/any");
            const res = createMockResponse();

            await handler(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(200);
            expect(res.end).toHaveBeenCalled();
        });

        test("should handle /status GET", async () => {
            state.serverURL = "http://voip.server.com";
            state.isPTTPressed = true;

            const req = createMockRequest("GET", "/status");
            const res = createMockResponse();

            await handler(req, res);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.running).toBe(true);
            expect(body.status).toBe("CONNECTED");
            expect(body.pttPressed).toBe(true);
            expect(body.serverURL).toBe("http://voip.server.com");
        });

        test("should handle /ptt/press POST", async () => {
            const req = createMockRequest("POST", "/ptt/press");
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(state.isPTTPressed).toBe(true);
            expect(callbacks.onPTTPress).toHaveBeenCalled();
            expect(res.statusCode).toBe(200);
        });

        test("should not trigger PTT press if already pressed", async () => {
            state.isPTTPressed = true;

            const req = createMockRequest("POST", "/ptt/press");
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks.onPTTPress).not.toHaveBeenCalled();
        });

        test("should handle /ptt/release POST", async () => {
            state.isPTTPressed = true;

            const req = createMockRequest("POST", "/ptt/release");
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(state.isPTTPressed).toBe(false);
            expect(callbacks.onPTTRelease).toHaveBeenCalled();
        });

        test("should handle /connect POST", async () => {
            const req = createMockRequest("POST", "/connect", { url: "http://voip.server.com" });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(state.serverURL).toBe("http://voip.server.com");
            expect(state.lastHeartbeat).not.toBeNull();
            expect(callbacks.onConnect).toHaveBeenCalledWith("http://voip.server.com");
        });

        test("should reject /connect without URL", async () => {
            const req = createMockRequest("POST", "/connect", {});
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error).toBe("Missing url parameter");
        });

        test("should handle /disconnect POST", async () => {
            const req = createMockRequest("POST", "/disconnect");
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks.onDisconnect).toHaveBeenCalledWith("manual");
        });

        test("should handle /heartbeat POST", async () => {
            const req = createMockRequest("POST", "/heartbeat");
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(state.lastHeartbeat).not.toBeNull();
            expect(res.statusCode).toBe(200);
        });

        test("should handle /frequency POST (legacy)", async () => {
            const req = createMockRequest("POST", "/frequency", { frequency: 45.3 });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks.onFrequencyChange).toHaveBeenCalledWith("45.3");
        });

        test("should handle /frequencies POST", async () => {
            const frequencies = [
                { frequency: 45.3, earSide: 0 },
                { frequency: 100.0, earSide: 2 }
            ];
            const req = createMockRequest("POST", "/frequencies", { frequencies });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks.onFrequenciesUpdate).toHaveBeenCalledWith([
                { frequency: "45.3", earSide: 0 },
                { frequency: "100", earSide: 2 }
            ]);
        });

        test("should reject invalid /frequencies format", async () => {
            const req = createMockRequest("POST", "/frequencies", { frequencies: "not-array" });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(res.statusCode).toBe(400);
        });

        test("should handle /active-channel POST", async () => {
            const req = createMockRequest("POST", "/active-channel", { frequency: 45.3 });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks.onActiveChannelChange).toHaveBeenCalledWith("45.3");
        });

        test("should handle /ear-side POST", async () => {
            const req = createMockRequest("POST", "/ear-side", { frequency: 45.3, earSide: 1 });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks.onEarSideChange).toHaveBeenCalledWith({ frequency: "45.3", earSide: 1 });
        });

        test("should reject invalid earSide in /ear-side", async () => {
            const req = createMockRequest("POST", "/ear-side", { frequency: 45.3, earSide: 5 });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(res.statusCode).toBe(400);
        });

        test("should handle /frequency/disconnect POST", async () => {
            const req = createMockRequest("POST", "/frequency/disconnect", { frequency: 45.3 });
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(callbacks.onFrequencyDisconnect).toHaveBeenCalledWith("45.3");
        });

        test("should return 404 for unknown routes", async () => {
            const req = createMockRequest("GET", "/unknown");
            const res = createMockResponse();

            await handler(req, res);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(res.statusCode).toBe(404);
        });
    });
});
