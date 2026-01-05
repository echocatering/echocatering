# Configuration Directory

This directory will contain centralized configuration files.

## Future Structure

- `database.js` - Database connection configuration
- `server.js` - Server configuration
- `constants.js` - Application constants
- `environment.js` - Environment-specific settings

## Migration Plan

Configuration will be gradually extracted from:
- `server/index.js` - Server settings
- `server/setup.js` - Database setup
- Environment variables - `.env` files

This is a future enhancement and does not affect current functionality.

