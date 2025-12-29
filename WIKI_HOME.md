# PWA Starter Wiki

Welcome to the PWA Starter documentation!

## Overview

This PWA starter includes a comprehensive plugin-based system for building modern Progressive Web Applications with offline-first architecture.

## Quick Links

- [Getting Started](Getting-Started)
- [Claude PWA Components](Claude-PWA-Components)
- [Database Guide](Database-Guide)
- [API System](API-System)
- [Authentication](Authentication)
- [Logging & Metrics](Logging-and-Metrics)
- [Settings Management](Settings-Management)
- [Webhooks](Webhooks)
- [Dynamic Pages](Dynamic-Pages)
- [Examples](Examples)

## Features

- **Offline-First**: Works completely offline with sync when online
- **Client-Side Database**: SQLite with IndexedDB persistence
- **Modular Plugins**: Use only what you need
- **Type-Safe**: Proper TypeScript integration
- **Production-Ready**: Comprehensive error handling

## Architecture

```
pwa-starter/
├── claude_contrib/         # PWA Components system
│   ├── db/                # Database schema and service
│   ├── plugins/           # Individual plugin modules
│   ├── docs/              # Detailed documentation
│   └── index.js           # Main entry point
├── src/                   # Application source
└── public/                # Static assets
```

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Access the App**
   Open http://localhost:5173/ in your browser

## Contributing

See our [Contributing Guide](Contributing) for details on how to contribute to this project.

## License

MIT License - See LICENSE file for details
