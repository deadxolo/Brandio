#!/usr/bin/env node
/**
 * Social Media Manager - Main Entry Point
 * Starts all services in a single process
 * Supports Cloud Run and Docker deployments
 */

const path = require('path');
const { spawn, fork } = require('child_process');

// Detect if running as packaged executable
const isPkg = typeof process.pkg !== 'undefined';
const basePath = isPkg ? path.dirname(process.execPath) : __dirname;

// Set environment variables
process.env.APP_BASE_PATH = basePath;
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Cloud Run / Docker support - bind to 0.0.0.0
process.env.HOST = process.env.HOST || '0.0.0.0';

// Load .env file (if exists)
try {
  require('dotenv').config({ path: path.join(basePath, '.env') });
} catch (e) {
  console.log('No .env file found, using environment variables');
}

// Get ports from environment or use defaults
const MANAGER_PORT = process.env.PORT || process.env.MANAGER_PORT || 3000;
const BG_ENGINE_PORT = process.env.BG_ENGINE_PORT || 3001;
const POST_GEN_PORT = process.env.POST_GEN_PORT || 3002;
const AUTO_POSTER_PORT = process.env.AUTO_POSTER_PORT || 3003;

const services = [
  { name: 'Manager', path: './manager/server.js', port: MANAGER_PORT },
  { name: 'Background Engine', path: './background_engine/server.js', port: BG_ENGINE_PORT },
  { name: 'Post Generator', path: './post_generator/server.js', port: POST_GEN_PORT },
  { name: 'Auto Poster', path: './auto_poster/server.js', port: AUTO_POSTER_PORT }
];

const isDocker = process.env.DOCKER === 'true' || process.env.PORT;

console.log('');
console.log('='.repeat(50));
console.log('  Social Media Manager');
console.log('='.repeat(50));
console.log(`  Mode: ${isPkg ? 'Packaged' : isDocker ? 'Docker/Cloud Run' : 'Development'}`);
console.log(`  Base Path: ${basePath}`);
console.log(`  Host: ${process.env.HOST}`);
console.log('='.repeat(50));
console.log('');

// Start all services
services.forEach(service => {
  try {
    const servicePath = isPkg
      ? path.join(basePath, service.path)
      : path.join(__dirname, service.path);

    console.log(`Starting ${service.name} on port ${service.port}...`);
    require(servicePath);
  } catch (error) {
    console.error(`Failed to start ${service.name}:`, error.message);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down services...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down services...');
  process.exit(0);
});
