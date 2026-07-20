const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const ui = require('../ui');

const VERSION = require('../../package.json').version;
const LLMS_TXT_URL = 'https://docs.mayar.id/llms.txt';
const CACHE_TTL_MS = 86400000; // 24 hours

// ---------------------------------------------------------------------------
// (1) getCacheDir
// ---------------------------------------------------------------------------
function getCacheDir() {
  const dir = path.join(config.dir, 'cache');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

// ---------------------------------------------------------------------------
// (2) getCachedLLMsTxt
// ---------------------------------------------------------------------------
function getCachedLLMsTxt() {
  const cacheDir = getCacheDir();
  const txtPath = path.join(cacheDir, 'llms.txt');
  const metaPath = path.join(cacheDir, 'llms-meta.json');

  if (!fs.existsSync(txtPath) || !fs.existsSync(metaPath)) {
    return null;
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (_) {
    return null;
  }

  if (!meta.fetchedAt) return null;

  const age = Date.now() - new Date(meta.fetchedAt).getTime();
  if (age >= CACHE_TTL_MS) return null;

  try {
    return fs.readFileSync(txtPath, 'utf8');
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helper: read stale cache regardless of TTL
// ---------------------------------------------------------------------------
function readStaleCache() {
  const cacheDir = getCacheDir();
  const txtPath = path.join(cacheDir, 'llms.txt');
  try {
    return fs.readFileSync(txtPath, 'utf8');
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// (3) fetchLLMsTxt
// ---------------------------------------------------------------------------
function fetchLLMsTxt() {
  return new Promise((resolve, reject) => {
    function doFetch(targetUrl, redirects) {
      const parsedUrl = new URL(targetUrl);

      const req = https.get(
        targetUrl,
        {
          headers: { 'User-Agent': `mayar-cli/${VERSION}` },
        },
        (res) => {
          // Follow redirects (301/302) up to 3 hops
          if (
            (res.statusCode === 301 || res.statusCode === 302) &&
            res.headers.location
          ) {
            if (redirects >= 3) {
              res.resume();
              reject(new Error('Too many redirects'));
              return;
            }
            const nextUrl = new URL(res.headers.location, targetUrl).href;
            res.resume();
            doFetch(nextUrl, redirects + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            // Write cache
            try {
              const cacheDir = getCacheDir();
              fs.writeFileSync(path.join(cacheDir, 'llms.txt'), data);
              fs.writeFileSync(
                path.join(cacheDir, 'llms-meta.json'),
                JSON.stringify({ fetchedAt: new Date().toISOString() }),
              );
            } catch (_) {
              // Non-fatal: cache write failure shouldn't prevent returning data
            }
            resolve(data);
          });
          res.on('error', reject);
        },
      );

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.on('error', reject);
    }

    doFetch(LLMS_TXT_URL, 0);
  });
}

// ---------------------------------------------------------------------------
// (4) fetchOrGetLLMsTxt
// ---------------------------------------------------------------------------
async function fetchOrGetLLMsTxt(refresh = false) {
  if (refresh) {
    return fetchLLMsTxt();
  }

  const cached = getCachedLLMsTxt();
  if (cached !== null) {
    return cached;
  }

  try {
    return await fetchLLMsTxt();
  } catch (err) {
    // Fetch failed — check for stale cache as fallback
    const stale = readStaleCache();
    if (stale !== null) {
      process.stdout.write(
        ui.dim('Using stale cache — could not refresh') + '\n',
      );
      return stale;
    }
    throw new Error(
      `${err.message}. Visit https://docs.mayar.id for manual browsing`,
    );
  }
}

// ---------------------------------------------------------------------------
// (5) parseTitleUrl
// ---------------------------------------------------------------------------
function parseTitleUrl(line) {
  const match = line.match(/^-\s+\[([^\]]+)\]\(([^)]+)\)/);
  if (!match) return null;
  return { title: match[1], url: match[2] };
}

// ---------------------------------------------------------------------------
// (6) slugify
// ---------------------------------------------------------------------------
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// ---------------------------------------------------------------------------
// (7) parseLLMsTxt
// ---------------------------------------------------------------------------
function parseLLMsTxt(raw) {
  const lines = raw.split('\n');
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      currentSection = { name: headingMatch[1], topics: [] };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) continue;

    const parsed = parseTitleUrl(line);
    if (!parsed) continue;

    // Extract description — everything after the link
    const descMatch = line.match(/^-\s+\[[^\]]+\]\([^)]+\)\s*-\s*(.*)$/);
    const description = descMatch ? descMatch[1].trim() : '';

    currentSection.topics.push({
      slug: slugify(parsed.title),
      title: parsed.title,
      url: parsed.url,
      description,
      section: currentSection.name,
    });
  }

  // Skip empty sections
  return { sections: sections.filter((s) => s.topics.length > 0) };
}

// ---------------------------------------------------------------------------
// run — CLI entry point
// ---------------------------------------------------------------------------
async function run(ctx) {
  const { flags, positional } = ctx;
  const topic = positional[0] || null;
  const refresh = flags.refresh || false;
  const json = flags.json || false;

  // Fetch and parse the topic index
  let raw;
  try {
    raw = await fetchOrGetLLMsTxt(refresh);
  } catch (err) {
    if (json) {
      ui.jsonOut({ error: err.message });
    } else {
      process.stderr.write(ui.red('Error: ' + err.message) + '\n');
    }
    process.exit(1);
  }

  const { sections } = parseLLMsTxt(raw);

  if (topic) {
    // Keyword-filtered mode
    const q = topic.toLowerCase();
    const matches = [];
    for (const sec of sections) {
      for (const t of sec.topics) {
        if (
          t.title.toLowerCase().includes(q) ||
          t.slug.includes(q) ||
          t.description.toLowerCase().includes(q)
        ) {
          matches.push(t);
        }
      }
    }

    if (matches.length === 0) {
      if (json) {
        ui.jsonOut({ matches: [] });
      } else {
        process.stdout.write(
          ui.dim(`No topics found matching "${topic}"`) + '\n',
        );
      }
      return;
    }

    if (json) {
      if (matches.length === 1) {
        ui.jsonOut({
          topic: matches[0].slug,
          title: matches[0].title,
          url: matches[0].url,
          description: matches[0].description,
          section: matches[0].section,
        });
      } else {
        ui.jsonOut({ matches });
      }
      return;
    }

    if (matches.length === 1) {
      const m = matches[0];
      process.stdout.write(
        `${ui.bold(m.title)}  ${ui.dim(`(${m.section})`)}\n`,
      );
      process.stdout.write(`${ui.cyan(m.url)}\n`);
      if (m.description) {
        process.stdout.write(ui.dim(m.description) + '\n');
      }
    } else {
      process.stdout.write(
        ui.dim(
          `${matches.length} topics match "${topic}":`,
        ) + '\n\n',
      );
      for (const m of matches) {
        process.stdout.write(
          `  ${ui.bold(m.title)}  ${ui.dim(`(${m.section})`)}\n`,
        );
        process.stdout.write(`  ${ui.cyan(m.url)}\n`);
        if (m.description) {
          process.stdout.write(`  ${ui.dim(m.description)}\n`);
        }
        process.stdout.write('\n');
      }
    }
  } else {
    // No topic argument
    if (json) {
      // Output structured JSON
      const topics = [];
      for (const sec of sections) {
        for (const t of sec.topics) {
          topics.push({
            slug: t.slug,
            title: t.title,
            url: t.url,
            description: t.description,
            section: t.section,
          });
        }
      }
      ui.jsonOut({ topics });
      return;
    }

    if (process.stdout.isTTY) {
      // Interactive mode — display the categorized list
      const allTopics = [];
      for (const sec of sections) {
        allTopics.push({ type: 'section', name: sec.name });
        for (const t of sec.topics) {
          allTopics.push({ type: 'topic', ...t });
        }
      }

      // Build a flat numbered list for pickFromList
      const items = [];
      for (const sec of sections) {
        for (const t of sec.topics) {
          items.push(t);
        }
      }

      // Print sections with topics
      for (const sec of sections) {
        process.stdout.write('\n' + ui.bold(sec.name) + '\n');
        for (let i = 0; i < sec.topics.length; i++) {
          const t = sec.topics[i];
          const num = items.indexOf(t) + 1;
          process.stdout.write(
            `  ${String(num).padEnd(3)} ${t.title}  ${ui.dim(t.description)}\n`,
          );
        }
      }

      process.stdout.write('\n');
      const selected = await ui.pickFromList(items, {
        displayKey: 'title',
        descriptionKey: 'description',
      });
      if (selected) {
        process.stdout.write('\n');
        process.stdout.write(
          `${ui.bold(selected.title)}  ${ui.dim(`(${selected.section})`)}\n`,
        );
        process.stdout.write(`${ui.cyan(selected.url)}\n`);
        if (selected.description) {
          process.stdout.write(ui.dim(selected.description) + '\n');
        }
      }
    } else {
      // Non-TTY — print categorized list
      for (const sec of sections) {
        process.stdout.write(ui.bold(sec.name) + '\n');
        for (const t of sec.topics) {
          process.stdout.write(
            `  ${t.title}  ${ui.dim(t.description)}\n`,
          );
        }
        process.stdout.write('\n');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// fetchPageContent — fetch a documentation page HTML
// ---------------------------------------------------------------------------
function fetchPageContent(url) {
  return new Promise((resolve, reject) => {
    function doFetch(targetUrl, redirects) {
      const req = https.get(
        targetUrl,
        {
          headers: { 'User-Agent': `mayar-cli/${VERSION}` },
        },
        (res) => {
          // Follow redirects (301/302/307/308) up to 3 hops
          if (
            (res.statusCode === 301 ||
              res.statusCode === 302 ||
              res.statusCode === 307 ||
              res.statusCode === 308) &&
            res.headers.location
          ) {
            if (redirects >= 3) {
              res.resume();
              reject(new Error('Too many redirects'));
              return;
            }
            const nextUrl = new URL(res.headers.location, targetUrl).href;
            res.resume();
            doFetch(nextUrl, redirects + 1);
            return;
          }

          // Accept any 2xx; reject non-2xx
          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve(data);
          });
          res.on('error', reject);
        },
      );

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.on('error', reject);
    }

    doFetch(url, 0);
  });
}

// ---------------------------------------------------------------------------
// renderContent — extract and format HTML for terminal output
// ---------------------------------------------------------------------------
function renderContent(html) {
  // (a) Extract main content region
  let content = '';
  let match;

  // Try <main>...</main>
  match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (match) {
    content = match[1];
  }

  // Try <article>...</article>
  if (!content) {
    match = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (match) {
      content = match[1];
    }
  }

  // Fallback: <div class="...content...">...</div>
  if (!content) {
    match = html.match(
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    if (match) {
      content = match[1];
    }
  }

  // Final fallback: entire <body> content
  if (!content) {
    match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (match) {
      content = match[1];
    } else {
      content = html;
    }
  }

  // (b) Strip all HTML tags
  let text = content.replace(/<[^>]*>/g, '');

  // (c) Decode common HTML entities
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&#x2F;': '/',
  };
  text = text.replace(
    /&(?:amp|lt|gt|quot|nbsp|#39|#x2F);/g,
    (m) => entities[m] || m,
  );

  // (d) Collapse 3+ consecutive newlines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // (e) Trim leading/trailing whitespace per line
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  // (f) Apply terminal formatting
  const lines = text.split('\n');
  const result = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect code fences
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      // Indent code by 2 spaces
      result.push('  ' + line);
      continue;
    }

    // Detect horizontal rules
    if (line === '---' || line === '***') {
      result.push(ui.dim('─'.repeat(40)));
      continue;
    }

    // Detect markdown headings (lines starting with #)
    if (/^#{1,6}\s/.test(line)) {
      result.push(ui.bold(line));
      continue;
    }

    result.push(line);
  }

  return result.join('\n').trim();
}

module.exports = {
  run,
  parseLLMsTxt,
  slugify,
  parseTitleUrl,
  fetchOrGetLLMsTxt,
  fetchPageContent,
  renderContent,
};
