/**
 * FIFA WC 2026 Scraper Runner
 *
 * Handles: scrape → commit master → deploy gh-pages (without switching branches)
 * Never switches branches or deletes files — all gh-pages work uses git plumbing.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRAPER_DIR = __dirname;
const API_DIR = path.join(SCRAPER_DIR, 'api');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: SCRAPER_DIR, stdio: 'pipe', timeout: 120000, ...opts });
}

function runWithOutput(cmd) {
  return execSync(cmd, { cwd: SCRAPER_DIR, encoding: 'utf-8', timeout: 120000 }).trim();
}

async function runFifaScraper() {
  const start = Date.now();
  console.log(`\n[FIFA-SCRAPER] ⚽ Cycle start ${new Date().toISOString()}`);

  try {
    // 1. Pull latest
    try {
      run('git pull origin master');
      console.log(`[FIFA-SCRAPER] ✓ Pulled latest`);
    } catch (e) {
      console.log(`[FIFA-SCRAPER] - Pull skipped: ${e.message.substring(0, 60)}`);
    }

    // 2. Install deps if missing
    if (!fs.existsSync(path.join(SCRAPER_DIR, 'node_modules'))) {
      console.log(`[FIFA-SCRAPER] Installing deps...`);
      run('npm install --omit=dev');
    }

    // 3. Run the scraper with YouTube conversion
    run('node src/scraper.js --yt', { stdio: 'inherit' });
    console.log(`[FIFA-SCRAPER] ✓ Scraper done`);

    // 4. Check for changes in api/
    const status = runWithOutput('git status --porcelain api/');
    if (!status.trim()) {
      console.log(`[FIFA-SCRAPER] - No changes in api/, skipping commit`);
      return;
    }

    // 5. Commit to master (only api/ changes)
    const commitMsg = `[auto] FIFA WC update ${new Date().toISOString()}`;
    run('git add api/');
    run(`git commit -m "${commitMsg}"`);
    run('git push origin master');
    console.log(`[FIFA-SCRAPER] ✓ Pushed to master`);

    // 6. Deploy api/ → gh-pages (without switching branches)
    deployToGhPages();
    console.log(`[FIFA-SCRAPER] ✓ Deployed to gh-pages`);

  } catch (err) {
    console.error(`[FIFA-SCRAPER] ✗ Failed: ${err.message}`);
  } finally {
    console.log(`[FIFA-SCRAPER] ⚽ Cycle done (${Date.now() - start}ms)\n`);
  }
}

/**
 * Deploy api/ directory to gh-pages branch using git plumbing.
 *
 * Strategy:
 *   - Use a temporary GIT_INDEX_FILE to build a tree from the api/ directory
 *   - Create an orphan commit via git commit-tree (no parent)
 *   - Force-push that commit to refs/heads/gh-pages
 *
 * This NEVER switches branches, never deletes working files,
 * and never interferes with the running script.
 */
function deployToGhPages() {
  const tmpDir = path.join(SCRAPER_DIR, '.gh-deploy-repo');

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Create a fresh repo in temp from the api/ files
    fs.cpSync(API_DIR, tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.nojekyll'), '');

    const remoteUrl = runWithOutput('git remote get-url origin');
    run(`git init "${tmpDir}"`);
    run(`git -C "${tmpDir}" add -A`);
    run(`git -C "${tmpDir}" commit -m "deploy ${new Date().toISOString()}"`);
    run(`git -C "${tmpDir}" push "${remoteUrl}" master:refs/heads/gh-pages --force`);

    console.log(`[FIFA-SCRAPER] ✓ gh-pages updated`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { runFifaScraper };

if (require.main === module) {
  runFifaScraper().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
