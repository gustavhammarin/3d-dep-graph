# Dependency Vulnerability Graph

A 3D interactive visualization of Python package dependencies, highlighting vulnerable packages. Built with React, Three.js and `3d-force-graph`.

## Prerequisites

- Node.js 18+
- npm

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

| Action | Result |
|--------|--------|
| Drag | Rotate the graph |
| Scroll | Zoom in / out |
| Hover a node | Show package name and version |
| Click a node | Focus camera + show full CVE list |

Vulnerable packages are shown in **red** with a glow effect. Safe packages are **blue**. Node size scales with number of vulnerabilities.

## Build

```bash
npm run build
```

Output is written to `dist/`.
