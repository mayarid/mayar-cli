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
      process.stderr.write(
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
// similarityScore — fuzzy matching for "Did you mean?" suggestions
// ---------------------------------------------------------------------------
function similarityScore(input, title) {
  let score = 0;
  const lowerInput = input.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Prefix match bonus
  if (lowerTitle.startsWith(lowerInput)) {
    score += 100;
  }

  // Shared character count: characters from input appearing in order in the title
  let inputIdx = 0;
  for (let i = 0; i < lowerTitle.length && inputIdx < lowerInput.length; i++) {
    if (lowerTitle[i] === lowerInput[inputIdx]) {
      inputIdx++;
    }
  }
  score += inputIdx;

  return score;
}

// ---------------------------------------------------------------------------
// run — CLI entry point
// ---------------------------------------------------------------------------
async function run(ctx) {
  const { flags, positional } = ctx;
  const topic = positional[0] || null;
  const refresh = flags.refresh || false;
  const json = flags.json || false;
  const sectionFilter = flags.section || flags.category || null;
  const compact = flags.compact || false;
  const showAll = flags.all || false;

  // Default search limit is 5 unless --all or explicit --limit N is given
  let limit = null;
  if (flags.limit) {
    const parsed = parseInt(flags.limit, 10);
    if (!isNaN(parsed) && parsed > 0) limit = parsed;
  } else if (topic && !showAll) {
    limit = 5;
  }

  // Fetch and parse the topic index
  let raw;
  try {
    raw = await fetchOrGetLLMsTxt(refresh);
  } catch (err) {
    if (json) {
      ui.jsonOut({ error: err.message });
      process.exitCode = 1;
      return;
    }
    process.stderr.write(ui.red('Error: ' + err.message) + '\n');
    process.exit(1);
  }

  const { sections: parsedSections } = parseLLMsTxt(raw);

  // Filter sections if --section filter is provided
  let sections = parsedSections;
  if (sectionFilter) {
    const secLower = sectionFilter.toLowerCase();
    const matchedSections = parsedSections.filter((sec) =>
      sec.name.toLowerCase().includes(secLower),
    );
    if (matchedSections.length > 0) {
      sections = matchedSections;
    } else {
      // Fallback: Filter topics by section, URL path, or title matching the section filter
      sections = parsedSections
        .map((sec) => ({
          ...sec,
          topics: sec.topics.filter(
            (t) =>
              t.section.toLowerCase().includes(secLower) ||
              t.url.toLowerCase().includes(secLower) ||
              t.title.toLowerCase().includes(secLower),
          ),
        }))
        .filter((sec) => sec.topics.length > 0);
    }
  }

  // Build flat allTopics array for lookup/filtering
  const allTopics = [];
  for (const sec of sections) {
    for (const t of sec.topics) {
      allTopics.push(t);
    }
  }

  // Helper for formatting topic JSON output based on --compact
  const formatTopic = (t) => {
    if (compact) {
      return { slug: t.slug, title: t.title, section: t.section };
    }
    return {
      slug: t.slug,
      title: t.title,
      url: t.url,
      description: t.description,
      section: t.section,
    };
  };

  // --json mode: short-circuit before any interactive or plain-text output
  if (json) {
    if (topic) {
      const inputSlug = slugify(topic);
      const inputLower = topic.toLowerCase();
      let matches = allTopics.filter(
        (t) =>
          t.slug.includes(inputSlug) ||
          t.title.toLowerCase().includes(inputLower),
      );

      if (matches.length === 0) {
        // Zero matches: error with suggestions
        const scored = allTopics
          .map((t) => ({ slug: t.slug, score: similarityScore(topic, t.title) }))
          .sort((a, b) => b.score - a.score);
        const suggestions = scored
          .slice(0, 3)
          .filter((s) => s.score > 0)
          .map((s) => s.slug);

        ui.jsonOut({
          error: `No documentation found for "${topic}"`,
          suggestions,
        });
        process.exitCode = 1;
        return;
      }

      // Sort matches by relevance score
      matches.sort((a, b) => similarityScore(topic, b.title) - similarityScore(topic, a.title));

      if (matches.length === 1) {
        // Single match: fetch page content and render
        const m = matches[0];
        try {
          const html = await fetchPageContent(m.url);
          const rendered = renderContent(html);
          ui.jsonOut({
            topic: m.slug,
            title: m.title,
            url: m.url,
            content: rendered,
          });
        } catch (err) {
          ui.jsonOut({ error: `Could not fetch page: ${err.message}` });
          process.exitCode = 1;
        }
        return;
      }

      // Multiple matches: return capped match list
      const totalMatches = matches.length;
      if (limit && matches.length > limit) {
        matches = matches.slice(0, limit);
      }

      ui.jsonOut({
        total: totalMatches,
        showing: matches.length,
        matches: matches.map(formatTopic),
      });
      return;
    }

    // No topic argument: output topics (apply limit if specified)
    let outputTopics = allTopics;
    if (limit && outputTopics.length > limit) {
      outputTopics = outputTopics.slice(0, limit);
    }

    ui.jsonOut({
      total: allTopics.length,
      showing: outputTopics.length,
      topics: outputTopics.map(formatTopic),
    });
    return;
  }

  if (topic) {
    // --- Topic resolution ---
    const inputSlug = slugify(topic);
    const inputLower = topic.toLowerCase();

    let matches = allTopics.filter((t) => {
      return t.slug.includes(inputSlug) || t.title.toLowerCase().includes(inputLower);
    });

    if (matches.length === 0) {
      // No match — show "No documentation found for" + fuzzy "Did you mean?"
      process.stdout.write(
        `No documentation found for "${topic}"` + '\n',
      );

      // Fuzzy matching: compute similarity scores for all topics
      const scored = allTopics.map((t) => ({
        topic: t,
        score: similarityScore(topic, t.title),
      }));
      scored.sort((a, b) => b.score - a.score);
      const top3 = scored.slice(0, 3).filter((s) => s.score > 0);

      if (top3.length > 0) {
        process.stdout.write('\n' + ui.dim('Did you mean?') + '\n');
        for (let i = 0; i < top3.length; i++) {
          process.stdout.write(
            `  ${i + 1}. ${top3[i].topic.title}` + '\n',
          );
        }
      }
      return;
    }

    // Sort matches by relevance score
    matches.sort((a, b) => similarityScore(topic, b.title) - similarityScore(topic, a.title));

    if (matches.length === 1) {
      // Single match — fetch page content and render
      const m = matches[0];
      process.stdout.write(
        `${ui.bold(m.title)} — ${ui.cyan(m.url)}` + '\n',
      );

      try {
        const html = await fetchPageContent(m.url);
        const rendered = renderContent(html);
        process.stdout.write(rendered + '\n');
      } catch (_err) {
        process.stdout.write(ui.dim('(could not fetch page content)') + '\n');
      }

      process.stdout.write(ui.dim('───') + '\n');
    } else {
      // Multiple matches — numbered list with optional capping
      const totalMatches = matches.length;
      let displayMatches = matches;

      if (limit && matches.length > limit) {
        displayMatches = matches.slice(0, limit);
        process.stdout.write(
          `Showing top ${limit} of ${totalMatches} topics matching "${topic}" ${ui.dim('(use --all to see all)')}:` + '\n\n',
        );
      } else {
        process.stdout.write(
          `${totalMatches} topics match "${topic}":` + '\n\n',
        );
      }

      for (let i = 0; i < displayMatches.length; i++) {
        const m = displayMatches[i];
        process.stdout.write(
          `  ${i + 1}. ${m.title} ${ui.dim('(' + m.section + ')')}` + '\n',
        );
        if (m.description) {
          process.stdout.write(`     ${ui.dim(m.description)}` + '\n');
        }
      }
    }
  } else {
    // --- No topic argument ---
    let displayTopics = allTopics;
    if (limit && displayTopics.length > limit) {
      displayTopics = displayTopics.slice(0, limit);
    }

    if (process.stdout.isTTY) {
      // Interactive TTY mode — show section headers, flatten topics, pickFromList
      for (const sec of sections) {
        process.stdout.write(ui.bold(sec.name) + '\n');
      }
      process.stdout.write('\n');

      const selected = await ui.pickFromList(displayTopics, {
        displayKey: 'title',
        descriptionKey: 'description',
      });

      if (selected) {
        // Fetch and render the page content for the chosen topic
        process.stdout.write('\n');
        process.stdout.write(
          `${ui.bold(selected.title)} — ${ui.cyan(selected.url)}` + '\n',
        );

        try {
          const html = await fetchPageContent(selected.url);
          const rendered = renderContent(html);
          process.stdout.write(rendered + '\n');
        } catch (_err) {
          process.stdout.write(
            ui.dim('(could not fetch page content)') + '\n',
          );
        }

        process.stdout.write(ui.dim('───') + '\n');
      }
      // null (quit) → exit silently
    } else {
      // Non-TTY — plain-text categorized listing
      for (const sec of sections) {
        process.stdout.write('## ' + sec.name + '\n');
        for (const t of sec.topics) {
          process.stdout.write(
            `  - ${t.title} — ${t.description}` + '\n',
          );
        }
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
  similarityScore,
  fetchOrGetLLMsTxt,
  fetchPageContent,
  renderContent,
};
