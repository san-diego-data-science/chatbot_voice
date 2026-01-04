/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src/public', // Serve frontend from here
    build: {
        outDir: '../../dist/public',
        emptyOutDir: true,
    },
    test: {
        root: './',
        include: ['test/**/*.{test,spec}.ts'],
        environment: 'node',
    },
});
