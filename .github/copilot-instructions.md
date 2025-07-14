# Codicent JavaScript SDK - AI Coding Instructions

## Project Overview
This is a JavaScript SDK for the Codicent platform - a messaging and data storage system with real-time capabilities. The library provides a unified API for chat messages, file uploads, AI chat, and structured data storage using a tag-based system.

## Architecture & Key Patterns

### Single-File Library Design
- **Main file**: `codicentjs.js` - Complete IIFE library that loads SignalR dynamically
- **Build output**: `codicentjs.min.js` - Minified version using UglifyJS
- **TypeScript definitions**: `src/global.d.ts` - Global type declarations for `window.Codicent`

### Core Components
1. **SignalR Connection Management**: Sophisticated retry logic with exponential backoff, CORS error handling, and connection state management
2. **RESTful API Client**: Fetch-based HTTP client for Codicent backend services
3. **CRUD Data API**: Tag-based structured data storage (`window.Codicent.data.*`)
4. **UI Helpers**: Declarative HTML attributes and custom element system

### Message System Architecture
- **Mentions**: `@codicent` format for project targeting
- **Tags**: `#tag` format for categorization (acts as table names in data API)
- **Data Storage**: JSON objects embedded in message content
- **Parent-Child Relations**: Messages can reference parents via `parentId`

## Critical Development Workflows

### Build Process
```bash
uglifyjs codicentjs.js --output codicentjs.min.js
```
Always minify after changes - this is the production distribution file.

### Testing Workflow
Use `index.html` as the test harness:
- Replace `"ENTER_CODICENT_API_TOKEN_HERE"` with valid token
- Test all major APIs: postMessage, getMessages, upload, AI chat, data CRUD
- Custom elements and UI helpers are demonstrated inline

### SignalR Connection Strategy
The library implements automatic reconnection with:
- Exponential backoff (10s base, 2x multiplier, 2min cap)
- CORS-specific error detection and logging
- Connection attempt limits (default 5, configurable via `maxConnectionAttempts`)
- Prevents duplicate connection attempts during retry cycles

## Project-Specific Conventions

### Data Message Format
```javascript
// Standard format: @mention #tag {jsonData}
"@myproject #users {\"name\":\"John\",\"age\":30}"
```

### CRUD Operations Pattern
- **Create**: Post message with `@codicent #tag {data}`
- **Update**: Post new message with `parentId` reference to original
- **Delete**: Post `@codicent #hidden` with `parentId` reference
- **Read**: Use `getDataMessages` with tag filtering

### Error Handling Strategy
- All async methods throw errors rather than returning error objects
- SignalR errors are logged but don't prevent initialization
- CORS errors get special handling due to common development issues

### UI Integration Patterns
- **Declarative buttons**: `data-codicent-type="send"` with `data-codicent-message`
- **Live counters**: `data-codicent-type="counter"` with search filters
- **Custom elements**: Template-based with `{{attribute}}` interpolation and `{{#each}}` loops

## External Dependencies
- **SignalR**: Loaded dynamically from CDN (`microsoft-signalr/3.1.0`)
- **UglifyJS**: Dev dependency for minification
- **Codicent Backend**: RESTful API at `https://codicent.com/`

## Key Files to Understand
- `codicentjs.js`: Complete library implementation - all core functionality
- `src/global.d.ts`: TypeScript interfaces showing expected API surface
- `index.html`: Live examples of all major features and UI patterns
- `README.md`: User-facing documentation with API examples

## Integration Points
- **Authentication**: Bearer token passed in Authorization headers
- **Real-time**: SignalR hub connection for live message updates
- **File Storage**: Multipart upload with filename preservation
- **AI Chat**: Timeout-protected requests (5min) with abort controllers

When working on this codebase, focus on maintaining the single-file architecture while ensuring the TypeScript definitions stay synchronized with the implementation.
