/**
 * Unit tests for Config module
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
    loadEnvFile,
    applyEnv,
    ensureDirectoryExists,
    saveConfig,
    readConfig,
    deleteConfig
} = require("../src/main/config.cjs");

// Test directory for file operations
const TEST_DIR = path.join(os.tmpdir(), "radio-voip-tests-" + Date.now());

beforeAll(() => {
    // Create test directory
    fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
    // Cleanup test directory
    try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
        // Ignore cleanup errors
    }
});

describe("config module", () => {

    // ==========================================
    // loadEnvFile tests
    // ==========================================
    describe("loadEnvFile", () => {
        test("should parse valid .env file", () => {
            const envPath = path.join(TEST_DIR, "test1.env");
            fs.writeFileSync(envPath, "SECRET_CODE=mycode\nPORT=3000\n");

            const env = loadEnvFile(envPath);

            expect(env.SECRET_CODE).toBe("mycode");
            expect(env.PORT).toBe("3000");
        });

        test("should skip comments and empty lines", () => {
            const envPath = path.join(TEST_DIR, "test2.env");
            fs.writeFileSync(envPath, "# This is a comment\n\nKEY=value\n\n# Another comment\n");

            const env = loadEnvFile(envPath);

            expect(Object.keys(env)).toHaveLength(1);
            expect(env.KEY).toBe("value");
        });

        test("should handle values with equals signs", () => {
            const envPath = path.join(TEST_DIR, "test3.env");
            fs.writeFileSync(envPath, "URL=http://example.com?foo=bar\n");

            const env = loadEnvFile(envPath);

            expect(env.URL).toBe("http://example.com?foo=bar");
        });

        test("should return empty object for non-existent file", () => {
            const env = loadEnvFile(path.join(TEST_DIR, "nonexistent.env"));
            expect(env).toEqual({});
        });

        test("should handle whitespace around keys and values", () => {
            const envPath = path.join(TEST_DIR, "test4.env");
            fs.writeFileSync(envPath, "  KEY  =  value  \n");

            const env = loadEnvFile(envPath);

            expect(env.KEY).toBe("value");
        });

        test("should skip lines without equals sign", () => {
            const envPath = path.join(TEST_DIR, "test5.env");
            fs.writeFileSync(envPath, "INVALID_LINE\nVALID=true\n");

            const env = loadEnvFile(envPath);

            expect(env.VALID).toBe("true");
            expect(env.INVALID_LINE).toBeUndefined();
        });
    });

    // ==========================================
    // applyEnv tests
    // ==========================================
    describe("applyEnv", () => {
        const originalEnv = { ...process.env };

        afterEach(() => {
            // Restore original env
            process.env = { ...originalEnv };
        });

        test("should apply new environment variables", () => {
            delete process.env.TEST_VAR_1;
            
            applyEnv({ TEST_VAR_1: "value1" });

            expect(process.env.TEST_VAR_1).toBe("value1");
        });

        test("should not overwrite existing variables", () => {
            process.env.TEST_VAR_2 = "original";

            applyEnv({ TEST_VAR_2: "new" });

            expect(process.env.TEST_VAR_2).toBe("original");
        });

        test("should apply multiple variables", () => {
            delete process.env.TEST_A;
            delete process.env.TEST_B;

            applyEnv({ TEST_A: "a", TEST_B: "b" });

            expect(process.env.TEST_A).toBe("a");
            expect(process.env.TEST_B).toBe("b");
        });
    });

    // ==========================================
    // ensureDirectoryExists tests
    // ==========================================
    describe("ensureDirectoryExists", () => {
        test("should create directory if not exists", () => {
            const dirPath = path.join(TEST_DIR, "new-dir-" + Date.now());
            
            expect(fs.existsSync(dirPath)).toBe(false);
            
            const result = ensureDirectoryExists(dirPath);
            
            expect(result).toBe(true);
            expect(fs.existsSync(dirPath)).toBe(true);
        });

        test("should return true for existing directory", () => {
            const dirPath = path.join(TEST_DIR, "existing-dir");
            fs.mkdirSync(dirPath, { recursive: true });

            const result = ensureDirectoryExists(dirPath);

            expect(result).toBe(true);
        });

        test("should create nested directories", () => {
            const dirPath = path.join(TEST_DIR, "a", "b", "c", Date.now().toString());

            const result = ensureDirectoryExists(dirPath);

            expect(result).toBe(true);
            expect(fs.existsSync(dirPath)).toBe(true);
        });
    });

    // ==========================================
    // saveConfig / readConfig tests
    // ==========================================
    describe("saveConfig and readConfig", () => {
        test("should save and read config", () => {
            const configPath = path.join(TEST_DIR, "config1.json");

            const saved = saveConfig(configPath, 19800);
            expect(saved).toBe(true);

            const config = readConfig(configPath);
            expect(config).toEqual({
                port: 19800,
                url: "http://127.0.0.1:19800"
            });
        });

        test("should create parent directories", () => {
            const configPath = path.join(TEST_DIR, "nested", "dir", "config.json");

            const saved = saveConfig(configPath, 19801);

            expect(saved).toBe(true);
            expect(fs.existsSync(configPath)).toBe(true);
        });

        test("should return null for non-existent config", () => {
            const config = readConfig(path.join(TEST_DIR, "nonexistent.json"));
            expect(config).toBeNull();
        });

        test("should return null for invalid JSON", () => {
            const configPath = path.join(TEST_DIR, "invalid.json");
            fs.writeFileSync(configPath, "not valid json {{{");

            const config = readConfig(configPath);
            expect(config).toBeNull();
        });
    });

    // ==========================================
    // deleteConfig tests
    // ==========================================
    describe("deleteConfig", () => {
        test("should delete existing config", () => {
            const configPath = path.join(TEST_DIR, "to-delete.json");
            fs.writeFileSync(configPath, "{}");

            expect(fs.existsSync(configPath)).toBe(true);

            const result = deleteConfig(configPath);

            expect(result).toBe(true);
            expect(fs.existsSync(configPath)).toBe(false);
        });

        test("should return true for non-existent file", () => {
            const result = deleteConfig(path.join(TEST_DIR, "nonexistent-delete.json"));
            expect(result).toBe(true);
        });
    });
});
