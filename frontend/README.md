# NAS Frontend (React)

React-based frontend for the NAS system.

## Setup

```bash
cd frontend
npm install
```

## Development

Run the development server (proxies API calls to Flask):

```bash
npm run dev
```

## Build for Production

Build the React app to be served by Flask:

```bash
npm run build
```

This outputs to `../app/static/react/` which Flask can serve.

## Features

- **FileUpload** - Upload files with progress bar, category selection, and tags
- **TagManager** - Create and manage tags
- **ThemeSwitcher** - Toggle between light and dark mode
- **FileList** - View, download, and delete files

## CSRF Protection

CSRF tokens are automatically read from the meta tag set by Flask and included in all API requests via:
- `X-CSRFToken` header
- `csrf_token` form field for uploads

## Theme System

Theme state is managed via React Context and persists to cookies. The theme applies CSS variables dynamically for consistent styling.
