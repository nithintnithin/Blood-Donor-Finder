#!/usr/bin/env node
/**
 * Setup script to ensure admin accounts are properly seeded
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_FILE);

console.log('Initializing database and seeding admins...\n');

// Utility to promisify db.run
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function setup() {
    try {
        // Create tables
        await dbRun(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE,
            password_hash TEXT
        )`);
        console.log('✓ Admins table created/exists');

        await dbRun(`CREATE TABLE IF NOT EXISTS institutions (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE
        )`);
        console.log('✓ Institutions table created/exists');

        await dbRun(`CREATE TABLE IF NOT EXISTS donors (
            id INTEGER PRIMARY KEY,
            institution_id INTEGER,
            name TEXT,
            age INTEGER,
            bloodGroup TEXT,
            contact TEXT,
            address TEXT,
            FOREIGN KEY(institution_id) REFERENCES institutions(id) ON DELETE CASCADE
        )`);
        console.log('✓ Donors table created/exists\n');

        // Seed default admins
        const adminAccounts = [
            { username: 'admin', password: 'admin123' },
            { username: 'Mithun M', password: 'Babblu0124' }
        ];

        for (const account of adminAccounts) {
            const hash = await new Promise((resolve, reject) => {
                bcrypt.hash(account.password, 10, (err, h) => {
                    if (err) reject(err);
                    else resolve(h);
                });
            });
            await dbRun(
                `INSERT OR REPLACE INTO admins (username, password_hash) VALUES (?, ?)`,
                [account.username, hash]
            );
            console.log(`✓ Admin account seeded: ${account.username}`);
        }

        // Handle env variable additional admins
        const envAdmins = process.env.ADMIN_USERS || '';
        if (envAdmins) {
            for (const pair of envAdmins.split(',')) {
                const [user, pass] = pair.split(':');
                if (user && pass) {
                    const hash = await new Promise((resolve, reject) => {
                        bcrypt.hash(pass, 10, (err, h) => {
                            if (err) reject(err);
                            else resolve(h);
                        });
                    });
                    await dbRun(
                        `INSERT OR REPLACE INTO admins (username, password_hash) VALUES (?, ?)`,
                        [user, hash]
                    );
                    console.log(`✓ Admin account seeded: ${user}`);
                }
            }
        }

        console.log('\n✓ Database setup complete!');
        console.log('\nAvailable admin accounts:');
        console.log('  - Username: admin, Password: admin123');
        console.log('  - Username: Mithun M, Password: Babblu0124');
        if (process.env.ADMIN_USERS) {
            console.log(`  - Plus any from ADMIN_USERS env var`);
        }

        db.close();
        process.exit(0);
    } catch (err) {
        console.error('Setup failed:', err);
        db.close();
        process.exit(1);
    }
}

setup();
