#!/bin/bash
# @description Start DuckDB UI connected to the Apprentice SQLite database
# @tags database, utilities, debug

set -e

APPRENTICE_HOME="${APPRENTICE_HOME:-$HOME/.apprentice}"
SOURCE_DB_PATH="$APPRENTICE_HOME/memory/index.db"
DB_PATH="$APPRENTICE_HOME/memory/analytics.db"

if [ ! -f "$SOURCE_DB_PATH" ]; then
  echo "Error: Database not found at $SOURCE_DB_PATH"
  echo "Run some commands first to populate the database."
  exit 1
fi

echo "Setting up DuckDB views for SQLite database: $SOURCE_DB_PATH"

# First, set up the extension and create views (without -ui to avoid segfault)
# Get list of tables from SQLite and create views for each
TABLES=$(sqlite3 "$SOURCE_DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")

# Build the setup SQL
SETUP_SQL="INSTALL sqlite; LOAD sqlite;"

for table in $TABLES; do
  SETUP_SQL="$SETUP_SQL
CREATE OR REPLACE VIEW $table AS SELECT * FROM sqlite_scan('$SOURCE_DB_PATH', '$table');"
done

# Run setup without UI
duckdb "$DB_PATH" -cmd "$SETUP_SQL" -c "SELECT 'Views created for: $TABLES'" > /dev/null 2>&1

echo "Views created for tables: $TABLES"
echo ""
echo "Starting DuckDB UI - you can now query tables directly!"
echo "  SELECT * FROM events LIMIT 10;"
echo "  SELECT * FROM assets LIMIT 10;"
echo ""

# Now start UI separately (need to load sqlite extension for views to work)
duckdb "$DB_PATH" -ui -cmd "LOAD sqlite;"
