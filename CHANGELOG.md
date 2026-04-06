# Changelog

All notable changes to @madnessengineering/cartogomancy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-01

### Added
- 🔐 **Auth0 Authentication** - OAuth Device Flow for secure CLI authentication
  - `login` command - Authenticate with SwarmDesk account
  - `logout` command - Clear stored credentials
  - `whoami` command - Check current login status
  - Auto-refresh token handling prevents session expiration
  - Secure token storage in `~/.config` with encryption

- ☁️ **Cloud Upload** - Upload UML data directly to SwarmDesk account
  - `--upload` flag - Analyze and upload in one command
  - `upload <file>` command - Upload existing UML JSON files
  - Automatic update-or-create logic (updates existing projects by name)
  - 10MB file size limit with helpful error messages
  - Integration with TUI mode - prompts after analysis

- 📤 **Backend API** - New upload endpoint
  - `POST /api/uml-data/upload` - Upload pre-generated UML data
  - Stores in user's personal MongoDB database
  - Returns dashboard URL and project stats
  - Proper error handling (401, 413, 500)

- 📚 **Documentation**
  - Cloud Integration section in README
  - Updated help text with new commands
  - Security notes about token storage

### Changed
- Updated dependencies: Added `axios`, `conf`, `open`
- Enhanced TUI mode with upload prompts
- Help text now includes auth commands

### Security
- Tokens stored with encryption using `conf` library
- Auto-refresh with 5-minute buffer before expiry
- HTTPS-only API communication
- OAuth Device Flow follows Auth0 best practices
- No password storage - refresh tokens only

## [0.1.0] - 2024-12-31

### Added
- Initial release with TUI and CLI modes
- TypeScript AST parsing for accurate code analysis
- Dependency graph generation
- External library detection and stub classes
- GitHub repository cloning and analysis
- Interactive TUI with project suggestions
- Real-time progress indicators
- ASCII art city preview
- React component detection
- Complexity metrics and code quality analysis
- Batch project analysis in TUI mode

---

🧙‍♂️ From the Mad Laboratory with ❤️
