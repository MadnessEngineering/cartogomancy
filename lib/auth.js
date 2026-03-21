const axios = require('axios');
const Conf = require('conf');
const open = require('open');
const chalk = require('chalk');
const ora = require('ora');

const AUTH0_DOMAIN = 'dev-eoi0koiaujjbib20.us.auth0.com';
const CLIENT_ID = 'U43kJwbd1xPcCzJsu3kZIIeNV1ygS7x1';
const AUDIENCE = 'https://madnessinteractive.cc/api';
const SCOPE = 'openid profile email offline_access';

const config = new Conf({
    projectName: '@madnessengineering/uml-generator',
    encryptionKey: 'swarmdesk-uml-cli-v1'
});

class AuthManager {
    /**
     * Initiate Device Authorization Flow
     */
    async login() {
        const spinner = ora('Initiating authentication...').start();

        try {
            // Step 1: Request device code
            const deviceCodeResponse = await axios.post(
                `https://${AUTH0_DOMAIN}/oauth/device/code`,
                {
                    client_id: CLIENT_ID,
                    scope: SCOPE,
                    audience: AUDIENCE
                }
            );

            const {
                device_code,
                user_code,
                verification_uri,
                verification_uri_complete,
                expires_in,
                interval
            } = deviceCodeResponse.data;

            spinner.succeed('Device code received');

            // Step 2: Display user instructions
            console.log(chalk.cyan('\n┌─────────────────────────────────────────────┐'));
            console.log(chalk.cyan('│') + chalk.bold.white('  🔐 Authentication Required') + chalk.cyan('                │'));
            console.log(chalk.cyan('└─────────────────────────────────────────────┘\n'));
            console.log(chalk.white('Please authorize this device:'));
            console.log(chalk.yellow(`\n  1. Visit: ${verification_uri}`));
            console.log(chalk.yellow(`  2. Enter code: ${chalk.bold(user_code)}\n`));

            // Auto-open browser
            try {
                await open(verification_uri_complete);
                console.log(chalk.green('✓ Opened browser automatically\n'));
            } catch {
                console.log(chalk.gray('(Could not auto-open browser)\n'));
            }

            // Step 3: Poll for authorization
            const pollSpinner = ora('Waiting for authorization...').start();
            const tokenData = await this.pollForToken(device_code, interval, expires_in);
            pollSpinner.succeed(chalk.green('Authenticated successfully!'));

            // Step 4: Fetch user info
            const userInfo = await this.fetchUserInfo(tokenData.access_token);

            // Step 5: Store tokens
            config.set('auth', {
                ...tokenData,
                expires_at: Date.now() + (tokenData.expires_in * 1000),
                user: userInfo
            });

            console.log(chalk.green(`\n✅ Logged in as: ${chalk.bold(userInfo.email)}\n`));
            return true;

        } catch (error) {
            spinner.fail('Authentication failed');
            console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
            return false;
        }
    }

    /**
     * Poll Auth0 for token
     */
    async pollForToken(deviceCode, interval, expiresIn) {
        const maxAttempts = Math.ceil(expiresIn / interval);

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await this.sleep(interval * 1000);

            try {
                const response = await axios.post(
                    `https://${AUTH0_DOMAIN}/oauth/token`,
                    {
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                        device_code: deviceCode,
                        client_id: CLIENT_ID
                    }
                );

                return response.data;

            } catch (error) {
                const errorCode = error.response?.data?.error;

                if (errorCode === 'authorization_pending') {
                    continue;
                } else if (errorCode === 'slow_down') {
                    interval += 5;
                    continue;
                } else if (errorCode === 'expired_token') {
                    throw new Error('Device code expired. Please try again.');
                } else if (errorCode === 'access_denied') {
                    throw new Error('Authorization denied by user.');
                } else {
                    throw error;
                }
            }
        }

        throw new Error('Authentication timed out.');
    }

    /**
     * Fetch user info from Auth0
     */
    async fetchUserInfo(accessToken) {
        const response = await axios.get(
            `https://${AUTH0_DOMAIN}/userinfo`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        );
        return response.data;
    }

    /**
     * Get valid access token (refresh if needed)
     */
    async getAccessToken() {
        const auth = config.get('auth');

        if (!auth) {
            throw new Error('Not authenticated. Run: swarmdesk-uml login');
        }

        // Check if token is still valid (with 5min buffer)
        if (auth.expires_at > Date.now() + (5 * 60 * 1000)) {
            return auth.access_token;
        }

        // Token expired, refresh it
        console.log(chalk.gray('🔄 Refreshing authentication token...'));

        try {
            const response = await axios.post(
                `https://${AUTH0_DOMAIN}/oauth/token`,
                {
                    grant_type: 'refresh_token',
                    client_id: CLIENT_ID,
                    refresh_token: auth.refresh_token
                }
            );

            const newTokenData = response.data;

            config.set('auth', {
                ...newTokenData,
                expires_at: Date.now() + (newTokenData.expires_in * 1000),
                user: auth.user
            });

            console.log(chalk.green('✓ Token refreshed'));
            return newTokenData.access_token;

        } catch (error) {
            config.delete('auth');
            throw new Error('Session expired. Please login again: swarmdesk-uml login');
        }
    }

    /**
     * Check if user is authenticated (Auth0 or API key)
     */
    isAuthenticated() {
        return config.has('auth') || config.has('apiKey');
    }

    /**
     * Get current user info
     */
    getCurrentUser() {
        if (config.has('apiKey')) {
            return { email: config.get('apiKey.email') || 'API Key User' };
        }
        return config.get('auth.user');
    }

    /**
     * Store an API key for authentication
     */
    setApiKey(apiKey, email = null) {
        config.set('apiKey', { key: apiKey, email: email || 'API Key User' });
        console.log(chalk.green(`\n✅ API key saved${email ? ` for ${email}` : ''}\n`));
    }

    /**
     * Get stored API key
     */
    getApiKey() {
        return config.get('apiKey.key');
    }

    /**
     * Check if using API key auth
     */
    hasApiKey() {
        return config.has('apiKey');
    }

    /**
     * Logout
     */
    logout() {
        config.delete('auth');
        config.delete('apiKey');
        console.log(chalk.green('✅ Logged out successfully\n'));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new AuthManager();
