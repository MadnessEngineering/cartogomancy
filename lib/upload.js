const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const authManager = require('./auth');

const API_BASE_URL = 'https://madnessinteractive.cc/api';

class UploadManager {
    /**
     * Upload UML data to user's SwarmDesk account
     */
    async upload(umlData, projectName) {
        // Ensure authenticated (API key or Auth0)
        if (!authManager.isAuthenticated()) {
            console.log(chalk.yellow('\n⚠️  Not authenticated. Please login first:\n'));
            console.log(chalk.cyan('  cartogomancy login --api-key <your-omni-key>\n'));
            console.log(chalk.gray('  Get your API key from: https://madnessinteractive.cc/dashboard > Settings > API Keys\n'));
            return false;
        }

        const user = authManager.getCurrentUser();
        const spinner = ora(`Uploading to SwarmDesk (${user.email})...`).start();

        try {
            // Use API key if available, otherwise Auth0 token
            let accessToken;
            if (authManager.hasApiKey()) {
                accessToken = authManager.getApiKey();
            } else {
                accessToken = await authManager.getAccessToken();
            }

            // Upload to API
            const response = await axios.post(
                `${API_BASE_URL}/uml-data/upload`,
                {
                    umlData: umlData,
                    name: projectName
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 120000
                }
            );

            const { data } = response;
            spinner.succeed(chalk.green('Upload successful!'));

            // Display success information
            console.log(chalk.cyan('\n┌─────────────────────────────────────────────┐'));
            console.log(chalk.cyan('│') + chalk.bold.white('  ✨ Upload Complete') + chalk.cyan('                       │'));
            console.log(chalk.cyan('└─────────────────────────────────────────────┘\n'));

            console.log(chalk.white(`  Project: ${chalk.bold(projectName)}`));
            console.log(chalk.white(`  Action: ${data.action === 'updated' ? chalk.yellow('Updated') : chalk.green('Created')}`));
            console.log(chalk.white(`  Classes: ${chalk.cyan(data.stats.classes)}`));
            console.log(chalk.white(`  Packages: ${chalk.cyan(data.stats.packages)}`));
            console.log(chalk.white(`  Size: ${chalk.gray(data.stats.sizeKB + ' KB')}\n`));

            console.log(chalk.white('  View in dashboard:'));
            console.log(chalk.blue(`  ${data.viewUrl}\n`));

            return true;

        } catch (error) {
            spinner.fail('Upload failed');

            if (error.response) {
                const status = error.response.status;
                const message = error.response.data?.message || error.message;

                if (status === 401) {
                    console.error(chalk.red('\n❌ Authentication failed. Please login again:\n'));
                    console.log(chalk.cyan('  swarmdesk-uml login\n'));
                    authManager.logout();
                } else if (status === 413) {
                    console.error(chalk.red('\n❌ File too large. Maximum size: 10MB\n'));
                    console.log(chalk.gray('  Try analyzing a smaller project or using --exclude patterns\n'));
                } else {
                    console.error(chalk.red(`\n❌ Server error: ${message}\n`));
                }
            } else if (error.code === 'ECONNREFUSED') {
                console.error(chalk.red('\n❌ Cannot connect to SwarmDesk API\n'));
                console.log(chalk.gray('  Check your internet connection or try again later\n'));
            } else {
                console.error(chalk.red(`\n❌ Upload error: ${error.message}\n`));
            }

            return false;
        }
    }

    /**
     * Upload existing JSON file
     */
    async uploadFile(filePath) {
        if (!fs.existsSync(filePath)) {
            console.error(chalk.red(`\n❌ File not found: ${filePath}\n`));
            return false;
        }

        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const umlData = JSON.parse(fileContent);

            // Validate structure
            if (!umlData.classes || !umlData.packages) {
                console.error(chalk.red('\n❌ Invalid UML data format\n'));
                console.log(chalk.gray('  Expected structure with "classes" and "packages" fields\n'));
                return false;
            }

            const projectName = umlData.project?.name || path.basename(filePath, '.json');

            console.log(chalk.white(`\n📁 Uploading: ${chalk.bold(projectName)}`));
            console.log(chalk.gray(`   Source: ${filePath}\n`));

            return await this.upload(umlData, projectName);

        } catch (error) {
            if (error instanceof SyntaxError) {
                console.error(chalk.red('\n❌ Invalid JSON file\n'));
            } else {
                console.error(chalk.red(`\n❌ Error reading file: ${error.message}\n`));
            }
            return false;
        }
    }
}

module.exports = new UploadManager();
