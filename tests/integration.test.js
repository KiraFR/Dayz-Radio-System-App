/**
 * Integration tests for HTTP API
 * Tests the full request/response cycle
 */

const http = require("http");
const { createRequestHandler, findFreePort } = require("../src/main/httpServer.cjs");

// Helper to make HTTP requests
function makeRequest(port, method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "127.0.0.1",
            port: port,
            path: path,
            method: method,
            headers: {
                "Content-Type": "application/json"
            }
        };

        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", chunk => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data ? JSON.parse(data) : null
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        });

        req.on("error", reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

describe("HTTP API Integration Tests", () => {
    let server;
    let port;
    let state;
    let callbacks;

    beforeAll(async () => {
        port = await findFreePort(29000);

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

        const handler = createRequestHandler(state, callbacks);
        server = http.createServer(handler);

        await new Promise(resolve => {
            server.listen(port, "127.0.0.1", resolve);
        });
    });

    afterAll(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    beforeEach(() => {
        // Reset state
        state.isPTTPressed = false;
        state.serverURL = null;
        state.lastHeartbeat = null;

        // Clear mocks
        Object.values(callbacks).forEach(cb => cb.mockClear());
    });

    // ==========================================
    // Status Endpoint
    // ==========================================
    describe("GET /status", () => {
        test("should return waiting status when not connected", async () => {
            const response = await makeRequest(port, "GET", "/status");

            expect(response.statusCode).toBe(200);
            expect(response.body.running).toBe(true);
            expect(response.body.status).toBe("WAITING_FOR_CONNECTION");
            expect(response.body.connected).toBe(false);
            expect(response.body.pttPressed).toBe(false);
        });

        test("should return connected status when connected", async () => {
            state.serverURL = "http://voip.example.com";

            const response = await makeRequest(port, "GET", "/status");

            expect(response.body.status).toBe("CONNECTED");
            expect(response.body.connected).toBe(true);
            expect(response.body.serverURL).toBe("http://voip.example.com");
        });

        test("should return PTT state", async () => {
            state.isPTTPressed = true;

            const response = await makeRequest(port, "GET", "/status");

            expect(response.body.pttPressed).toBe(true);
        });
    });

    // ==========================================
    // PTT Endpoints
    // ==========================================
    describe("POST /ptt/press", () => {
        test("should activate PTT", async () => {
            const response = await makeRequest(port, "POST", "/ptt/press");

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(state.isPTTPressed).toBe(true);
            expect(callbacks.onPTTPress).toHaveBeenCalled();
        });

        test("should not trigger callback if already pressed", async () => {
            state.isPTTPressed = true;

            const response = await makeRequest(port, "POST", "/ptt/press");

            expect(response.body.success).toBe(true);
            expect(callbacks.onPTTPress).not.toHaveBeenCalled();
        });
    });

    describe("POST /ptt/release", () => {
        test("should release PTT", async () => {
            state.isPTTPressed = true;

            const response = await makeRequest(port, "POST", "/ptt/release");

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(state.isPTTPressed).toBe(false);
            expect(callbacks.onPTTRelease).toHaveBeenCalled();
        });

        test("should not trigger callback if not pressed", async () => {
            state.isPTTPressed = false;

            const response = await makeRequest(port, "POST", "/ptt/release");

            expect(response.body.success).toBe(true);
            expect(callbacks.onPTTRelease).not.toHaveBeenCalled();
        });
    });

    // ==========================================
    // Connection Endpoints
    // ==========================================
    describe("POST /connect", () => {
        test("should connect with valid URL", async () => {
            const response = await makeRequest(port, "POST", "/connect", {
                url: "http://voip.example.com"
            });

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.url).toBe("http://voip.example.com");
            expect(state.serverURL).toBe("http://voip.example.com");
            expect(state.lastHeartbeat).not.toBeNull();
            expect(callbacks.onConnect).toHaveBeenCalledWith("http://voip.example.com");
        });

        test("should reject without URL", async () => {
            const response = await makeRequest(port, "POST", "/connect", {});

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe("Missing url parameter");
        });
    });

    describe("POST /disconnect", () => {
        test("should trigger disconnect callback", async () => {
            const response = await makeRequest(port, "POST", "/disconnect");

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(callbacks.onDisconnect).toHaveBeenCalledWith("manual");
        });
    });

    describe("POST /heartbeat", () => {
        test("should update heartbeat timestamp", async () => {
            const before = Date.now();

            const response = await makeRequest(port, "POST", "/heartbeat");

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(state.lastHeartbeat).toBeGreaterThanOrEqual(before);
        });
    });

    // ==========================================
    // Frequency Endpoints
    // ==========================================
    describe("POST /frequency (legacy)", () => {
        test("should change frequency", async () => {
            const response = await makeRequest(port, "POST", "/frequency", {
                frequency: 45.3
            });

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.frequency).toBe("45.3");
            expect(callbacks.onFrequencyChange).toHaveBeenCalledWith("45.3");
        });

        test("should reject without frequency", async () => {
            const response = await makeRequest(port, "POST", "/frequency", {});

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe("Missing frequency parameter");
        });
    });

    describe("POST /frequencies", () => {
        test("should update multiple frequencies", async () => {
            const frequencies = [
                { frequency: 45.3, earSide: 0 },
                { frequency: 100.0, earSide: 2 }
            ];

            const response = await makeRequest(port, "POST", "/frequencies", { frequencies });

            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.count).toBe(2);
            expect(callbacks.onFrequenciesUpdate).toHaveBeenCalledWith([
                { frequency: "45.3", earSide: 0 },
                { frequency: "100", earSide: 2 }
            ]);
        });

        test("should accept empty array", async () => {
            const response = await makeRequest(port, "POST", "/frequencies", { frequencies: [] });

            expect(response.statusCode).toBe(200);
            expect(response.body.count).toBe(0);
        });

        test("should reject non-array", async () => {
            const response = await makeRequest(port, "POST", "/frequencies", {
                frequencies: "not-array"
            });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toBe("frequencies must be an array");
        });

        test("should reject invalid frequency format", async () => {
            const response = await makeRequest(port, "POST", "/frequencies", {
                frequencies: [{ frequency: "string", earSide: 0 }]
            });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toContain("Invalid frequency format");
        });

        test("should reject invalid earSide", async () => {
            const response = await makeRequest(port, "POST", "/frequencies", {
                frequencies: [{ frequency: 45.3, earSide: 5 }]
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /active-channel", () => {
        test("should set active channel", async () => {
            const response = await makeRequest(port, "POST", "/active-channel", {
                frequency: 45.3
            });

            expect(response.statusCode).toBe(200);
            expect(response.body.frequency).toBe("45.3");
            expect(callbacks.onActiveChannelChange).toHaveBeenCalledWith("45.3");
        });

        test("should reject non-number frequency", async () => {
            const response = await makeRequest(port, "POST", "/active-channel", {
                frequency: "45.3"
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /ear-side", () => {
        test("should change ear side", async () => {
            const response = await makeRequest(port, "POST", "/ear-side", {
                frequency: 45.3,
                earSide: 1
            });

            expect(response.statusCode).toBe(200);
            expect(response.body.frequency).toBe("45.3");
            expect(response.body.earSide).toBe(1);
            expect(callbacks.onEarSideChange).toHaveBeenCalledWith({
                frequency: "45.3",
                earSide: 1
            });
        });

        test("should accept all valid earSide values", async () => {
            for (const earSide of [0, 1, 2]) {
                const response = await makeRequest(port, "POST", "/ear-side", {
                    frequency: 45.3,
                    earSide
                });
                expect(response.statusCode).toBe(200);
                expect(response.body.earSide).toBe(earSide);
            }
        });

        test("should reject invalid earSide", async () => {
            const response = await makeRequest(port, "POST", "/ear-side", {
                frequency: 45.3,
                earSide: 3
            });

            expect(response.statusCode).toBe(400);
            expect(response.body.error).toContain("earSide must be 0");
        });
    });

    describe("POST /frequency/disconnect", () => {
        test("should disconnect from frequency", async () => {
            const response = await makeRequest(port, "POST", "/frequency/disconnect", {
                frequency: 45.3
            });

            expect(response.statusCode).toBe(200);
            expect(response.body.frequency).toBe("45.3");
            expect(callbacks.onFrequencyDisconnect).toHaveBeenCalledWith("45.3");
        });

        test("should reject non-number frequency", async () => {
            const response = await makeRequest(port, "POST", "/frequency/disconnect", {
                frequency: "45.3"
            });

            expect(response.statusCode).toBe(400);
        });
    });

    // ==========================================
    // Error Handling
    // ==========================================
    describe("Error handling", () => {
        test("should return 404 for unknown routes", async () => {
            const response = await makeRequest(port, "GET", "/unknown");

            expect(response.statusCode).toBe(404);
            expect(response.body.error).toBe("Not found");
        });

        test("should return 404 for wrong method", async () => {
            const response = await makeRequest(port, "GET", "/connect");

            expect(response.statusCode).toBe(404);
        });
    });

    // ==========================================
    // CORS Headers
    // ==========================================
    describe("CORS headers", () => {
        test("should handle OPTIONS preflight", async () => {
            const response = await makeRequest(port, "OPTIONS", "/status");

            expect(response.statusCode).toBe(200);
        });
    });
});
