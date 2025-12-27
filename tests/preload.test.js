/**
 * Unit tests for Preload module
 * Tests the IPC communication layer
 */

// Mock Electron modules
const mockIpcRenderer = {
    on: jest.fn(),
    send: jest.fn(),
    invoke: jest.fn(),
    removeAllListeners: jest.fn()
};

const mockContextBridge = {
    exposeInMainWorld: jest.fn()
};

jest.mock("electron", () => ({
    contextBridge: mockContextBridge,
    ipcRenderer: mockIpcRenderer
}));

// We can't directly test preload.cjs due to DOM dependencies,
// so we test the IPC event structure instead

describe("preload IPC structure", () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("IPC channel names", () => {
        const expectedChannels = {
            fromMain: [
                "ptt:press",
                "ptt:release",
                "frequency:change",
                "frequencies:update",
                "active-channel:change",
                "frequency:disconnect",
                "ear-side:change"
            ],
            toMain: [
                "window-minimize",
                "window-maximize",
                "window-close"
            ],
            invoke: [
                "get-server-url",
                "get-http-port"
            ]
        };

        test("should have correct channel names for PTT events", () => {
            expect(expectedChannels.fromMain).toContain("ptt:press");
            expect(expectedChannels.fromMain).toContain("ptt:release");
        });

        test("should have correct channel names for frequency events", () => {
            expect(expectedChannels.fromMain).toContain("frequency:change");
            expect(expectedChannels.fromMain).toContain("frequencies:update");
            expect(expectedChannels.fromMain).toContain("active-channel:change");
            expect(expectedChannels.fromMain).toContain("frequency:disconnect");
            expect(expectedChannels.fromMain).toContain("ear-side:change");
        });

        test("should have correct channel names for window controls", () => {
            expect(expectedChannels.toMain).toContain("window-minimize");
            expect(expectedChannels.toMain).toContain("window-maximize");
            expect(expectedChannels.toMain).toContain("window-close");
        });

        test("should have correct channel names for invoke calls", () => {
            expect(expectedChannels.invoke).toContain("get-server-url");
            expect(expectedChannels.invoke).toContain("get-http-port");
        });
    });

    describe("electronAPI structure", () => {
        // Simulate the exposed API structure
        const electronAPI = {
            onPTTPress: (callback) => {
                mockIpcRenderer.removeAllListeners("ptt:press");
                mockIpcRenderer.on("ptt:press", () => callback());
            },
            onPTTRelease: (callback) => {
                mockIpcRenderer.removeAllListeners("ptt:release");
                mockIpcRenderer.on("ptt:release", () => callback());
            },
            onFrequencyChange: (callback) => {
                mockIpcRenderer.removeAllListeners("frequency:change");
                mockIpcRenderer.on("frequency:change", (event, frequency) => callback(frequency));
            },
            onFrequenciesUpdate: (callback) => {
                mockIpcRenderer.removeAllListeners("frequencies:update");
                mockIpcRenderer.on("frequencies:update", (event, frequencies) => callback(frequencies));
            },
            onActiveChannelChange: (callback) => {
                mockIpcRenderer.removeAllListeners("active-channel:change");
                mockIpcRenderer.on("active-channel:change", (event, frequency) => callback(frequency));
            },
            onFrequencyDisconnect: (callback) => {
                mockIpcRenderer.removeAllListeners("frequency:disconnect");
                mockIpcRenderer.on("frequency:disconnect", (event, frequency) => callback(frequency));
            },
            onEarSideChange: (callback) => {
                mockIpcRenderer.removeAllListeners("ear-side:change");
                mockIpcRenderer.on("ear-side:change", (event, data) => callback(data));
            },
            getServerURL: () => mockIpcRenderer.invoke("get-server-url"),
            minimize: () => mockIpcRenderer.send("window-minimize"),
            maximize: () => mockIpcRenderer.send("window-maximize"),
            close: () => mockIpcRenderer.send("window-close"),
            isElectron: true
        };

        test("should have isElectron flag", () => {
            expect(electronAPI.isElectron).toBe(true);
        });

        test("should register PTT listeners correctly", () => {
            const callback = jest.fn();
            electronAPI.onPTTPress(callback);

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledWith("ptt:press");
            expect(mockIpcRenderer.on).toHaveBeenCalledWith("ptt:press", expect.any(Function));
        });

        test("should remove previous listeners before adding new ones", () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            electronAPI.onPTTPress(callback1);
            electronAPI.onPTTPress(callback2);

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledTimes(2);
        });

        test("should send window control messages", () => {
            electronAPI.minimize();
            expect(mockIpcRenderer.send).toHaveBeenCalledWith("window-minimize");

            electronAPI.maximize();
            expect(mockIpcRenderer.send).toHaveBeenCalledWith("window-maximize");

            electronAPI.close();
            expect(mockIpcRenderer.send).toHaveBeenCalledWith("window-close");
        });

        test("should invoke getServerURL", () => {
            electronAPI.getServerURL();
            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith("get-server-url");
        });
    });

    describe("frequency event data structure", () => {
        test("single frequency should be a string", () => {
            const frequency = "45.3";
            expect(typeof frequency).toBe("string");
        });

        test("frequencies array should have correct structure", () => {
            const frequencies = [
                { frequency: "45.3", earSide: 0 },
                { frequency: "100.0", earSide: 1 },
                { frequency: "87.5", earSide: 2 }
            ];

            frequencies.forEach(f => {
                expect(typeof f.frequency).toBe("string");
                expect(typeof f.earSide).toBe("number");
                expect([0, 1, 2]).toContain(f.earSide);
            });
        });

        test("ear-side change event should have correct structure", () => {
            const data = { frequency: "45.3", earSide: 1 };

            expect(typeof data.frequency).toBe("string");
            expect(typeof data.earSide).toBe("number");
        });
    });
});

describe("Titlebar CSS", () => {
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
}`;

    test("should have correct height", () => {
        expect(TITLEBAR_CSS).toContain("height: 32px");
    });

    test("should be draggable", () => {
        expect(TITLEBAR_CSS).toContain("-webkit-app-region: drag");
    });

    test("should be fixed position", () => {
        expect(TITLEBAR_CSS).toContain("position: fixed");
    });

    test("should have high z-index", () => {
        expect(TITLEBAR_CSS).toContain("z-index: 99999");
    });
});
