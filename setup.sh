#!/bin/bash
# ============================================================================
# Phase 1 Setup Script - Automated Deployment
# ============================================================================
# This script sets up PostgreSQL and runs all necessary migrations
# Run this ONCE after creating .env file

set -e  # Exit on any error

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🚀 PHASE 1 SETUP - Automated Database & Deployment      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found!"
    echo "   Please create .env file first. Copy from .env.example"
    exit 1
fi

# ============================================================================
# STEP 1: Check PostgreSQL Installation
# ============================================================================
echo "📋 STEP 1: Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not installed. Please install first:"
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    echo "   Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

PSQL_VERSION=$(psql --version)
echo "✅ PostgreSQL found: $PSQL_VERSION"
echo ""

# ============================================================================
# STEP 2: Create Database
# ============================================================================
echo "📋 STEP 2: Creating database 'receptionist_dev'..."

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw receptionist_dev; then
    echo "⚠️  Database 'receptionist_dev' already exists"
    echo "   Skipping creation..."
else
    createdb receptionist_dev
    echo "✅ Database created: receptionist_dev"
fi
echo ""

# ============================================================================
# STEP 3: Import Schema
# ============================================================================
echo "📋 STEP 3: Importing database schema..."

if [ ! -f db/schema.sql ]; then
    echo "❌ ERROR: db/schema.sql not found!"
    exit 1
fi

psql receptionist_dev < db/schema.sql
echo "✅ Schema imported successfully"
echo ""

# ============================================================================
# STEP 4: Verify Database
# ============================================================================
echo "📋 STEP 4: Verifying database..."

BUSINESS_COUNT=$(psql receptionist_dev -t -c "SELECT COUNT(*) FROM businesses;")
echo "✅ Businesses in database: $BUSINESS_COUNT"

CALL_LOG_COUNT=$(psql receptionist_dev -t -c "SELECT COUNT(*) FROM call_logs;")
echo "✅ Call logs in database: $CALL_LOG_COUNT"

echo ""

# ============================================================================
# STEP 5: Install Dependencies
# ============================================================================
echo "📋 STEP 5: Installing npm dependencies..."

if [ ! -f package.json ]; then
    echo "❌ ERROR: package.json not found!"
    exit 1
fi

npm install
echo "✅ Dependencies installed"
echo ""

# ============================================================================
# SUCCESS
# ============================================================================
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ SETUP COMPLETE!                                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. TEST LOCALLY (verify everything works):"
echo "   npm start"
echo ""
echo "   In another terminal:"
echo "   curl -X POST http://localhost:3000/api/test/call"
echo ""
echo "2. CHECK DATABASE:"
echo "   psql receptionist_dev"
echo "   SELECT * FROM call_logs;"
echo "   SELECT * FROM leads;"
echo ""
echo "3. DEPLOY TO RAILWAY:"
echo "   git add -A"
echo "   git commit -m 'Phase 1: Database setup complete'"
echo "   git push origin main"
echo ""
echo "4. CONFIGURE TWILIO WEBHOOK:"
echo "   - Go to: Twilio Console → Phone Numbers → Your Number"
echo "   - Set Call Status Callbacks URL: https://your-app/api/voice/hangup"
echo "   - Save"
echo ""
echo "5. TEST WITH REAL CALL:"
echo "   - Call +64 3 668 1200"
echo "   - Complete booking"
echo "   - Check email arrives at info@sanctuarywanaka.co.nz"
echo ""
