#!/bin/bash

# Production deployment script for Mail Client
# Usage: ./deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting deployment for environment: $ENVIRONMENT"

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "⚠️  Warning: .env.production not found. Creating from example..."
    if [ -f ".env.production.example" ]; then
        cp .env.production.example .env.production
        echo "📝 Please edit .env.production with your configuration"
        exit 1
    else
        echo "❌ Error: .env.production.example not found"
        exit 1
    fi
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false

# Run tests (optional, uncomment if needed)
# echo "🧪 Running tests..."
# npm test

# Build the application
echo "🔨 Building application..."
NODE_ENV=production npm run build

# Check if build was successful
if [ ! -d ".next" ]; then
    echo "❌ Build failed: .next directory not found"
    exit 1
fi

echo "✅ Build completed successfully!"

# If using Docker
if command -v docker &> /dev/null && [ -f "docker-compose.yml" ]; then
    read -p "🐳 Deploy with Docker? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🐳 Building and starting Docker containers..."
        docker-compose -f docker-compose.yml down
        docker-compose -f docker-compose.yml build --no-cache
        docker-compose -f docker-compose.yml up -d
        echo "✅ Docker deployment completed!"
        echo "📊 Check status: docker-compose ps"
        echo "📋 View logs: docker-compose logs -f"
        exit 0
    fi
fi

# If using PM2
if command -v pm2 &> /dev/null; then
    read -p "⚡ Deploy with PM2? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "⚡ Starting with PM2..."
        pm2 delete mailclient 2>/dev/null || true
        pm2 start npm --name "mailclient" -- start
        pm2 save
        echo "✅ PM2 deployment completed!"
        echo "📊 Check status: pm2 status"
        echo "📋 View logs: pm2 logs mailclient"
        exit 0
    fi
fi

# Manual deployment instructions
echo ""
echo "📋 Manual deployment steps:"
echo "1. Ensure .env.production is configured"
echo "2. Run: npm run build"
echo "3. Run: npm start"
echo "4. Or use a process manager like PM2: pm2 start npm --name mailclient -- start"
echo ""
echo "✅ Deployment script completed!"
