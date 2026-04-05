#!/usr/bin/env node
/**
 * 🎮⚡ SWARMDESK UML GENERATOR - TUI MODE
 * Interactive Text User Interface for SwarmDesk UML Generation
 */

const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const Table = require('cli-table3');
const boxen = require('boxen');
const gradient = require('gradient-string');
const figlet = require('figlet');
const { generateUML, analyzeFile, findSourceFiles } = require('./cartogomancy.js');

/**
 * 🎨 Display fancy welcome banner
 */
function showBanner() {
    console.clear();
    const banner = figlet.textSync('SWARMDESK', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default'
    });
    console.log(gradient.pastel.multiline(banner));
    console.log(chalk.cyan('━'.repeat(80)));
    console.log(chalk.white.bold('                    🔍 UML City Builder - Interactive Mode'));
    console.log(chalk.cyan('━'.repeat(80)));
    console.log();
}

/**
 * 🏠 Suggest recent/common projects
 */
function findSuggestedProjects() {
    const suggestions = [];
    const homeDir = require('os').homedir();

    // Common project locations
    const commonPaths = [
        path.join(homeDir, 'lab', 'madness_interactive', 'projects'),
        path.join(homeDir, 'projects'),
        path.join(homeDir, 'dev'),
        path.join(homeDir, 'Documents', 'projects'),
        process.cwd()
    ];

    for (const basePath of commonPaths) {
        if (fs.existsSync(basePath)) {
            try {
                const entries = fs.readdirSync(basePath, { withFileTypes: true });
                for (const entry of entries.slice(0, 5)) { // Limit to 5 per location
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        const fullPath = path.join(basePath, entry.name);
                        // Check if it has package.json (likely a project)
                        if (fs.existsSync(path.join(fullPath, 'package.json'))) {
                            suggestions.push({
                                name: `${entry.name} (${basePath})`,
                                value: fullPath,
                                short: entry.name
                            });
                        }
                    }
                }
            } catch (err) {
                // Skip directories we can't read
            }
        }
    }

    return suggestions.slice(0, 10); // Return top 10
}

/**
 * 📍 Main menu - Project selection
 */
async function selectProject() {
    const suggestions = findSuggestedProjects();

    const choices = [
        { name: '📂 Browse for local directory...', value: 'browse' },
        { name: '🌐 Clone from GitHub URL...', value: 'github' },
        { name: '📁 Use current directory', value: process.cwd() },
        new inquirer.Separator('─── Suggested Projects ───')
    ];

    if (suggestions.length > 0) {
        choices.push(...suggestions);
    }

    choices.push(
        new inquirer.Separator('───────────────────────'),
        { name: '❌ Exit', value: 'exit' }
    );

    const { project } = await inquirer.prompt([
        {
            type: 'list',
            name: 'project',
            message: 'Select a project to analyze:',
            choices,
            pageSize: 15
        }
    ]);

    if (project === 'exit') {
        console.log(chalk.yellow('\n👋 Exiting SwarmDesk UML Generator\n'));
        process.exit(0);
    }

    if (project === 'browse') {
        const { customPath } = await inquirer.prompt([
            {
                type: 'input',
                name: 'customPath',
                message: 'Enter path to project:',
                default: process.cwd(),
                validate: (input) => {
                    if (fs.existsSync(input)) {
                        return true;
                    }
                    return 'Path does not exist. Please enter a valid path.';
                }
            }
        ]);
        return customPath;
    }

    if (project === 'github') {
        const { githubUrl } = await inquirer.prompt([
            {
                type: 'input',
                name: 'githubUrl',
                message: 'Enter GitHub repository URL:',
                validate: (input) => {
                    if (input.startsWith('http') || input.startsWith('git@')) {
                        return true;
                    }
                    return 'Please enter a valid GitHub URL (https://github.com/...)';
                }
            }
        ]);
        return githubUrl;
    }

    return project;
}

/**
 * ⚙️ Configure analysis options
 */
async function configureOptions(projectPath) {
    const { customize } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'customize',
            message: 'Customize include/exclude patterns?',
            default: false
        }
    ]);

    let includePatterns = ['src', 'lib', 'components', 'pages', 'utils', 'hooks', 'services'];
    let excludePatterns = ['node_modules', 'dist', 'build', '.git', 'coverage', 'test', '__tests__'];

    if (customize) {
        const { include, exclude } = await inquirer.prompt([
            {
                type: 'input',
                name: 'include',
                message: 'Include patterns (comma-separated):',
                default: includePatterns.join(', ')
            },
            {
                type: 'input',
                name: 'exclude',
                message: 'Exclude patterns (comma-separated):',
                default: excludePatterns.join(', ')
            }
        ]);
        includePatterns = include.split(',').map(s => s.trim());
        excludePatterns = exclude.split(',').map(s => s.trim());
    }

    const projectName = path.basename(projectPath);
    const { outputFile } = await inquirer.prompt([
        {
            type: 'input',
            name: 'outputFile',
            message: 'Output file name:',
            default: `${projectName}-uml.json`
        }
    ]);

    return {
        includePatterns,
        excludePatterns,
        outputFile
    };
}

/**
 * 🏗️ Run analysis with progress indicators
 */
async function runAnalysis(projectPath, options) {
    console.log('\n');

    // Step 1: Finding files
    const findingSpinner = ora({
        text: 'Scanning project files...',
        color: 'cyan'
    }).start();

    const files = findSourceFiles(projectPath, options.includePatterns, options.excludePatterns);
    findingSpinner.succeed(chalk.green(`Found ${files.length} source files`));

    if (files.length === 0) {
        console.log(boxen(chalk.yellow('⚠️  No source files found!\n\nTry adjusting your include patterns.'), {
            padding: 1,
            borderColor: 'yellow',
            borderStyle: 'round'
        }));
        return null;
    }

    // Step 2: Analyzing files
    const analyzingSpinner = ora({
        text: 'Analyzing code structure...',
        color: 'magenta'
    }).start();

    const classes = [];
    const packages = new Map();
    let analyzed = 0;

    for (const filePath of files) {
        try {
            const classData = analyzeFile(filePath, projectPath);
            classes.push(classData);

            const pkgPath = classData.package;
            if (!packages.has(pkgPath)) {
                packages.set(pkgPath, {
                    id: `package_${Math.random().toString(36).substring(2, 9)}`,
                    name: pkgPath.split('/').pop() || 'root',
                    path: pkgPath,
                    classes: []
                });
            }
            packages.get(pkgPath).classes.push(classData.id);

            analyzed++;
            if (analyzed % 10 === 0) {
                analyzingSpinner.text = `Analyzing... ${analyzed}/${files.length} files`;
            }
        } catch (error) {
            // Continue on error
        }
    }

    analyzingSpinner.succeed(chalk.green(`Analyzed ${classes.length} components`));

    // Step 3: Get project metadata
    const metadataSpinner = ora({
        text: 'Reading project metadata...',
        color: 'blue'
    }).start();

    let projectName = path.basename(projectPath);
    let projectDescription = 'Codebase visualization';
    let projectLanguage = 'JavaScript';

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            projectName = packageJson.name || projectName;
            projectDescription = packageJson.description || projectDescription;
        } catch (error) {
            // Use defaults
        }
    }

    metadataSpinner.succeed(chalk.green('Project metadata loaded'));

    // Build UML structure
    const umlData = {
        version: '7.0',
        generated: new Date().toISOString(),
        project: {
            name: projectName,
            description: projectDescription,
            language: projectLanguage
        },
        packages: Array.from(packages.values()),
        classes
    };

    return umlData;
}

/**
 * 📊 Display results table
 */
function displayResults(umlData) {
    console.log('\n');
    console.log(boxen(
        chalk.bold.white('🎉 Analysis Complete!'),
        {
            padding: 1,
            margin: 1,
            borderColor: 'green',
            borderStyle: 'round'
        }
    ));

    const table = new Table({
        head: [chalk.cyan('Metric'), chalk.cyan('Value')],
        style: {
            head: [],
            border: ['cyan']
        }
    });

    table.push(
        ['Project Name', chalk.white.bold(umlData.project.name)],
        ['Description', chalk.gray(umlData.project.description)],
        ['Components', chalk.green(umlData.classes.length.toString())],
        ['Packages', chalk.yellow(umlData.packages.length.toString())],
        ['Generated', chalk.gray(new Date(umlData.generated).toLocaleString())]
    );

    console.log(table.toString());

    // Top 5 most complex components
    const sortedByComplexity = [...umlData.classes]
        .sort((a, b) => b.metrics.complexity - a.metrics.complexity)
        .slice(0, 5);

    if (sortedByComplexity.length > 0) {
        console.log('\n' + chalk.bold('🔥 Most Complex Components:'));
        const complexityTable = new Table({
            head: [chalk.cyan('Component'), chalk.cyan('Complexity'), chalk.cyan('Lines')],
            style: { head: [], border: ['gray'] }
        });

        for (const cls of sortedByComplexity) {
            const complexityColor = cls.metrics.complexity > 20 ? chalk.red :
                                   cls.metrics.complexity > 10 ? chalk.yellow :
                                   chalk.green;
            complexityTable.push([
                chalk.white(cls.name),
                complexityColor(cls.metrics.complexity.toString()),
                chalk.gray(cls.metrics.lines.toString())
            ]);
        }
        console.log(complexityTable.toString());
    }

    // ASCII Art City Preview
    console.log('\n' + chalk.bold('🏙️  City Preview (Building Heights):'));
    const maxHeight = Math.max(...umlData.classes.map(c => c.metrics.lines));
    const buildings = umlData.classes.slice(0, 20); // First 20 buildings

    let cityArt = '';
    for (let i = 0; i < buildings.length; i++) {
        const height = Math.ceil((buildings[i].metrics.lines / maxHeight) * 5);
        const building = '█'.repeat(height);
        const color = buildings[i].metrics.complexity > 15 ? chalk.red :
                     buildings[i].metrics.complexity > 8 ? chalk.yellow :
                     chalk.green;
        cityArt += color(building) + ' ';
    }
    console.log('  ' + cityArt);
    console.log(chalk.gray('  (Taller = More Lines, Red = Complex, Green = Simple)'));
}

/**
 * 💾 Save output
 */
async function saveOutput(umlData, outputFile) {
    const saveSpinner = ora({
        text: `Saving to ${outputFile}...`,
        color: 'cyan'
    }).start();

    try {
        fs.writeFileSync(outputFile, JSON.stringify(umlData, null, 2));
        saveSpinner.succeed(chalk.green(`Saved to ${outputFile}`));

        // Ask about uploading
        const authManager = require('./lib/auth');

        if (authManager.isAuthenticated()) {
            const user = authManager.getCurrentUser();
            const { shouldUpload } = await inquirer.prompt([{
                type: 'confirm',
                name: 'shouldUpload',
                message: `Upload to SwarmDesk account (${user.email})?`,
                default: true
            }]);

            if (shouldUpload) {
                const uploadManager = require('./lib/upload');
                await uploadManager.upload(umlData, umlData.project.name);
            }
        } else {
            const { wantToLogin } = await inquirer.prompt([{
                type: 'confirm',
                name: 'wantToLogin',
                message: 'Upload to SwarmDesk? (requires login)',
                default: false
            }]);

            if (wantToLogin) {
                const loginSuccess = await authManager.login();
                if (loginSuccess) {
                    const uploadManager = require('./lib/upload');
                    await uploadManager.upload(umlData, umlData.project.name);
                }
            }
        }

        console.log('\n' + boxen(
            chalk.white.bold('🎮 Next Steps:\n\n') +
            chalk.gray('1. ') + chalk.white('View in dashboard: ') + chalk.cyan('https://madnessinteractive.cc/dashboard\n') +
            chalk.gray('2. ') + chalk.white('Or load ') + chalk.cyan(outputFile) + chalk.white(' in SwarmDesk\n') +
            chalk.gray('3. ') + chalk.white('Press ') + chalk.cyan('I') + chalk.white(' to cycle data sources'),
            {
                padding: 1,
                margin: 1,
                borderColor: 'cyan',
                borderStyle: 'round'
            }
        ));

        return true;
    } catch (error) {
        saveSpinner.fail(chalk.red(`Failed to save: ${error.message}`));
        return false;
    }
}

/**
 * 🔁 Ask if user wants to analyze another project
 */
async function askContinue() {
    const { again } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'again',
            message: '\nAnalyze another project?',
            default: false
        }
    ]);
    return again;
}

/**
 * 🚀 Main TUI flow
 */
async function main() {
    showBanner();

    let continueAnalyzing = true;

    while (continueAnalyzing) {
        try {
            // Step 1: Select project
            const projectPath = await selectProject();

            // Step 2: Configure options
            const options = await configureOptions(projectPath);

            // Step 3: Run analysis
            const umlData = await runAnalysis(projectPath, options);

            if (umlData) {
                // Step 4: Display results
                displayResults(umlData);

                // Step 5: Save output
                await saveOutput(umlData, options.outputFile);

                // Step 6: Ask to continue
                continueAnalyzing = await askContinue();
            } else {
                continueAnalyzing = await askContinue();
            }

            if (continueAnalyzing) {
                console.clear();
                showBanner();
            }

        } catch (error) {
            if (error.isTtyError) {
                console.error(chalk.red('\n❌ Interactive mode not supported in this environment'));
                process.exit(1);
            } else if (error.message === 'User force closed the prompt') {
                console.log(chalk.yellow('\n\n👋 Exiting...\n'));
                process.exit(0);
            } else {
                console.error(chalk.red(`\n❌ Error: ${error.message}`));
                continueAnalyzing = await askContinue();
            }
        }
    }

    console.log(chalk.yellow('\n👋 Thanks for using SwarmDesk UML Generator!\n'));
    console.log(chalk.gray('🧙‍♂️ From the Mad Laboratory with ') + chalk.red('❤️\n'));
}

module.exports = { main };

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red(`Fatal error: ${error.message}`));
        process.exit(1);
    });
}
