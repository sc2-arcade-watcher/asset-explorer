/**
 * Discord server widget loader
 * Fetches widget.json (name, online count, invite) and widget.png banner for each server.
 * Caches responses in localStorage for 2 hours per guild ID.
 * Falls back to a static invite link card when widget is disabled or fetch fails.
 */

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCached(guildId) {
  try {
    const raw = localStorage.getItem(`discord-widget-${guildId}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function setCache(guildId, data) {
  try {
    localStorage.setItem(`discord-widget-${guildId}`, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // localStorage may be full or unavailable — ignore
  }
}

async function fetchWidget(guildId) {
  const cached = getCached(guildId);
  if (cached) return cached;

  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`);
    if (!res.ok) return null; // widget disabled (403) or rate limited (429)
    const data = await res.json();
    setCache(guildId, data);
    return data;
  } catch {
    return null;
  }
}

function bannerUrl(guildId) {
  return `https://discord.com/api/guilds/${guildId}/widget.png?style=banner2`;
}

function renderWidget(container, server, widgetData) {
  const href = widgetData?.instant_invite
    ?? `https://discord.gg/${server.inviteCode}`;

  if (!widgetData) {
    // Fallback: text card with static invite link
    const el = document.createElement('a');
    el.href = href;
    el.target = '_blank';
    el.rel = 'noopener';
    el.className = 'discord-widget-fallback';
    el.innerHTML = `
      <div class="widget-name">${server.label}</div>
      <div class="widget-desc">${server.description}</div>
    `;
    container.appendChild(el);
    return;
  }

  const onlineCount = widgetData.presence_count ?? 0;

  const el = document.createElement('a');
  el.href = href;
  el.target = '_blank';
  el.rel = 'noopener';
  el.className = 'discord-widget';
  el.innerHTML = `
    <img class="widget-banner" src="${bannerUrl(server.guildId)}" alt="${server.label} Discord banner" loading="lazy" onerror="this.style.display='none'">
    <div class="widget-info">
      <div class="widget-name">${server.label}</div>
      <div class="widget-desc">${server.description}</div>
      ${onlineCount > 0 ? `<div class="widget-online">● ${onlineCount} online</div>` : ''}
    </div>
  `;
  container.appendChild(el);
}

/**
 * Render Discord server widgets into a container element.
 *
 * @param {HTMLElement} container - Element to render widgets into
 * @param {Array<{guildId: string, label: string, description: string, inviteCode: string}>} servers
 */
export async function renderDiscordWidgets(container, servers) {
  // Deduplicate by guildId (SC2Mapster and SC2 All Races share one — keep first occurrence)
  const seen = new Set();
  const unique = servers.filter(s => {
    if (seen.has(s.guildId)) return false;
    seen.add(s.guildId);
    return true;
  });

  // Lazy-load after page paint to avoid blocking render
  await new Promise(resolve => {
    if (document.readyState === 'complete') return resolve();
    window.addEventListener('load', resolve, { once: true });
  });

  const results = await Promise.allSettled(unique.map(s => fetchWidget(s.guildId)));

  unique.forEach((server, i) => {
    const widgetData = results[i].status === 'fulfilled' ? results[i].value : null;
    renderWidget(container, server, widgetData);
  });
}
