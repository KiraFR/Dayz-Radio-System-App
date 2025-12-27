/**
 * Configuration module for Radio VoIP DayZ
 */

const path = require("path");
const fs = require("fs");

/**
 * Load environment variables from .env file
 * @param {string} envPath - Path to .env file
 * @returns {object} - Parsed environment variables
 */
function loadEnvFile(envPath) {
    const env = {};

    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        envContent.split("\n").forEach((line) => {
            // Skip empty lines and comments
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith("#")) {
                return;
            }

            const equalIndex = trimmedLine.indexOf("=");
            if (equalIndex > 0) {
                const key = trimmedLine.substring(0, equalIndex).trim();
                const value = trimmedLine.substring(equalIndex + 1).trim();
                if (key && value) {
                    env[key] = value;
                }
            }
        });
    }

    return env;
}

/**
 * Apply environment variables to process.env (without overwriting existing)
 * @param {object} env - Environment variables to apply
 */
function applyEnv(env) {
    Object.entries(env).forEach(([key, value]) => {
        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
}

/**
 * Ensure directory exists, create if not
 * @param {string} dirPath
 * @returns {boolean} - True if created or exists
 */
function ensureDirectoryExists(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Save config file for DayZ mod to read
 * @param {string} configPath - Path to config file
 * @param {number} port - HTTP server port
 * @returns {boolean}
 */
function saveConfig(configPath, port) {
    try {
        const configDir = path.dirname(configPath);
        ensureDirectoryExists(configDir);

        const config = {
            port: port,
            url: `http://127.0.0.1:${port}`
        };

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Read config file
 * @param {string} configPath
 * @returns {object|null}
 */
function readConfig(configPath) {
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, "utf-8");
            return JSON.parse(content);
        }
    } catch (err) {
        // Ignore errors
    }
    return null;
}

/**
 * Delete config file
 * @param {string} configPath
 * @returns {boolean}
 */
function deleteConfig(configPath) {
    try {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Get default config directory path
 * @returns {string}
 */
function getDefaultConfigDir() {
    return path.join(process.env.LOCALAPPDATA || "", "DayZ", "RadioVOIP");
}

/**
 * Get default config file path
 * @returns {string}
 */
function getDefaultConfigPath() {
    return path.join(getDefaultConfigDir(), "config.json");
}

module.exports = {
    loadEnvFile,
    applyEnv,
    ensureDirectoryExists,
    saveConfig,
    readConfig,
    deleteConfig,
    getDefaultConfigDir,
    getDefaultConfigPath
};
