#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }
hr()    { echo -e "${CYAN}──────────────────────────────────────────────${NC}"; }

SITE="https://estralisfest2026.vercel.app"
API_BASE="https://estralis-kw3j.onrender.com"

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║            GUARD — Privacy Scanner            ║"
echo "  ║     Scans for trackers, IP leaks, & data      ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. DNS / CDN / whois info ──────────────────────────────────
hr
echo -e "${BOLD}[1] DOMAIN & INFRASTRUCTURE${NC}"
hr
echo -ne "  Resolving ${SITE}... "
SITE_IP=$(curl -s --max-time 5 "https://dns.google/resolve?name=estralisfest2026.vercel.app&type=A" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Answer'][0]['data'])" 2>/dev/null)
echo "${SITE_IP:-failed}"
echo -ne "  Resolving ${API_BASE}... "
API_IP=$(curl -s --max-time 5 "https://dns.google/resolve?name=estralis-kw3j.onrender.com&type=A" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Answer'][0]['data'])" 2>/dev/null)
echo "${API_IP:-failed}"

if command -v geoiplookup &>/dev/null && [ -n "$SITE_IP" ]; then
  echo -n "  Site IP location: "; geoiplookup "$SITE_IP" 2>/dev/null | head -1
fi

# ── 2. Crawl with Playwright, capture all requests ────────────
hr
echo -e "${BOLD}[2] NETWORK REQUEST AUDIT${NC}"
hr
echo "  Launching browser to capture all requests..."

HAR_FILE="/tmp/guard_har.json"
node -e "
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // Collect ALL requests with details
  const requests = [];
  context.on('request', r => {
    requests.push({
      url: r.url(),
      method: r.method(),
      type: r.resourceType(),
      headers: r.headers(),
    });
  });

  const page = await context.newPage();

  // Hit main page
  await page.goto('${SITE}', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Hit events section
  await page.goto('${SITE}/#events', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Open the first event modal to trigger API calls
  const cards = page.locator('text=Access Protocol');
  if (await cards.count() > 0) {
    await cards.first().click();
    await new Promise(r => setTimeout(r, 2000));
  }

  // Hit special-guest section
  await page.goto('${SITE}/#special-guest', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Check localStorage / cookies
  const storage = await page.evaluate(() => {
    return {
      cookies: document.cookie,
      localStorage: Object.entries(localStorage).map(([k, v]) => k + '=' + (v.length > 80 ? v.slice(0,80)+'...' : v)),
      sessionStorage: Object.entries(sessionStorage).map(([k, v]) => k + '=' + (v.length > 80 ? v.slice(0,80)+'...' : v)),
    };
  });

  console.log(JSON.stringify({ requests, storage }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
" 2>/dev/null > /tmp/guard_raw.json

# ── 3. Analyze requests ──────────────────────────────────────
hr
echo -e "${BOLD}[3] TRACKER DETECTION${NC}"
hr

TOTAL_REQS=$(python3 -c "
import json, sys
with open('/tmp/guard_raw.json') as f: data = json.load(f)
print(len(data['requests']))
" 2>/dev/null || echo 0)

echo "  Total requests captured: $TOTAL_REQS"

# Known tracker patterns
TRACKERS=(
  "google-analytics" "googletagmanager" "gtag" "ga.js" "ga_"
  "facebook" "fbclid" "fbq" "connect.facebook"
  "hotjar" "mouseflow" "fullstory" "crazyegg" "luckyorange"
  "mixpanel" "amplitude" "segment" "heap" "intercom"
  "scorecardresearch" "comscore" "quantserve"
  "adsrvr" "doubleclick" "adservice" "googlesyndication"
  "newrelic" "datadog" "sentry" "bugsnag"
  "cdn.segment" "cdn.amplitude" "cdn.mxpnl"
  "ipapi" "ipinfo" "ipstack" "geolocation-db" "abstractapi"
  "fingerprint" "fingerprintjs" "creepjs"
  "captcha" "recaptcha" "hcaptcha"
  "clarity" "bing" "analytics"
)

for tracker in "${TRACKERS[@]}"; do
  MATCHES=$(python3 -c "
import json
with open('/tmp/guard_raw.json') as f: data = json.load(f)
hits = [r['url'] for r in data['requests'] if '${tracker}' in r['url'].lower()]
for h in hits: print(h)
" 2>/dev/null)
  if [ -n "$MATCHES" ]; then
    warn "  Possible tracker: '${tracker}'"
    echo "$MATCHES" | head -3 | sed 's/^/      → /'
  fi
done

# ── 4. Check for IP/geolocation leakage ──────────────────────
hr
echo -e "${BOLD}[4] IP & GEOLOCATION LEAK CHECK${NC}"
hr

IP_LEAKS=$(python3 -c "
import json
with open('/tmp/guard_raw.json') as f: data = json.load(f)
keywords = ['ipapi', 'ipinfo', 'ipstack', 'geolocation', 'geoip', 'whatismyip', 'ifconfig', 'myip', 'iplocation', 'freegeoip', 'ip-api', 'abstractapi', 'ipdata', 'ip2location', 'whois', 'ipify', 'icanhazip']
for r in data['requests']:
    url = r['url'].lower()
    if any(k in url for k in keywords):
        print(r['url'])
" 2>/dev/null)

if [ -n "$IP_LEAKS" ]; then
  err "  IP/geolocation API calls detected!"
  echo "$IP_LEAKS" | sed 's/^/  → /'
else
  log "  No IP/geolocation API calls found"
fi

# Check browser geo API usage
GEO_USAGE=$(python3 -c "
import json
with open('/tmp/guard_raw.json') as f: data = json.load(f)
geo_reqs = [r['url'] for r in data['requests'] if ('maps.googleapis' in r['url'] or 'googleapis.com/maps' in r['url'])]
print(len(geo_reqs))
" 2>/dev/null)
if [ "$GEO_USAGE" -gt 0 ]; then
  warn "  Google Maps API calls: $GEO_USAGE (may leak location)"
fi

# ── 5. Third-party domains ──────────────────────────────────
hr
echo -e "${BOLD}[5] THIRD-PARTY DOMAINS${NC}"
hr
python3 -c "
import json, urllib.parse
with open('/tmp/guard_raw.json') as f: data = json.load(f)
domains = {}
for r in data['requests']:
    parsed = urllib.parse.urlparse(r['url'])
    if parsed.netloc:
        domains[parsed.netloc] = domains.get(parsed.netloc, 0) + 1
# Separate first-party vs third-party
first = ['estralisfest2026.vercel.app', 'estralis-kw3j.onrender.com']
for d, count in sorted(domains.items(), key=lambda x: -x[1]):
    label = 'SELF' if d in first else 'THIRD-PARTY'
    print(f'  [{label}] {d} ({count} reqs)')
" 2>/dev/null

# ── 6. Check request headers for data leaks ──────────────────
hr
echo -e "${BOLD}[6] HEADER LEAK CHECK${NC}"
hr
python3 -c "
import json
with open('/tmp/guard_raw.json') as f: data = json.load(f)
leaks = []
for r in data['requests']:
    h = r.get('headers', {})
    for key in h:
        val = str(h[key])
        if any(p in val.lower() for p in ['authorization', 'bearer', 'token', 'apikey', 'api_key', 'secret', 'password', 'auth']):
            leaks.append(f'{r[\"url\"][:80]} → {key}: {val[:60]}')
            break
if leaks:
    for l in leaks[:5]:
        print(f'  ✗ {l}')
else:
    print('  No sensitive headers found')
" 2>/dev/null

# ── 7. Check localStorage / cookies for trackers ─────────────
hr
echo -e "${BOLD}[7] LOCAL STORAGE & COOKIES${NC}"
hr
python3 -c "
import json
with open('/tmp/guard_raw.json') as f: data = json.load(f)
s = data.get('storage', {})
print(f'  Cookies: {\"present\" if s.get(\"cookies\") else \"none\"} ')
print(f'  localStorage keys: {len(s.get(\"localStorage\", []))}')
print(f'  sessionStorage keys: {len(s.get(\"sessionStorage\", []))}')
tracking_keys = ['_ga', '_gid', '_fbp', '_hj', 'amp', 'mixpanel', 'ajs', 'gtm']
for key in tracking_keys:
    for item in s.get('localStorage', []):
        if key in item.lower():
            print(f'  ✗ Tracker storage key: {item[:60]}')
            break
" 2>/dev/null

# ── 8. API backend data exposure check ──────────────────────
hr
echo -e "${BOLD}[8] BACKEND API DATA EXPOSURE${NC}"
hr
echo "  Checking what the backend API endpoints expose..."
curl -s --max-time 5 "${API_BASE}/api/theme/status" -H "Accept: application/json" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'  /api/theme/status: keys = {list(d.keys())}')
    for k, v in d.items():
        if isinstance(v, str) and len(v) > 100: v = v[:100] + '...'
        print(f'    {k}: {v}')
except: print('  (could not parse)')
" 2>/dev/null

echo ""
curl -s --max-time 5 "${API_BASE}/api/colleges" -H "Accept: application/json" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'data' in d and isinstance(d['data'], list):
        print(f'  /api/colleges: {len(d[\"data\"])} colleges exposed')
        for c in d['data'][:3]:
            print(f'    - {c.get(\"name\",\"?\")} (id={c.get(\"id\",\"?\")})')
except: print('  (could not parse)')
" 2>/dev/null

echo ""
curl -s --max-time 5 "${API_BASE}/api/events/slots-status?eventTitle=ARTIST%20PERFORMANCE%20AND%20DJ%20NIGHT" -H "Accept: application/json" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'  /api/events/slots-status: keys = {list(d.keys())}')
except: print('  (could not parse)')
" 2>/dev/null

# ── Summary ─────────────────────────────────────────────────
hr
echo -e "${BOLD}SUMMARY${NC}"
hr

python3 -c "
import json
with open('/tmp/guard_raw.json') as f: data = json.load(f)
urls = [r['url'] for r in data['requests']]
all_js = [u for u in urls if '.js' in u]

# Check for specific tracker categories
trackers_found = []
if any('google-analytics' in u.lower() for u in urls): trackers_found.append('Google Analytics')
if any('googletagmanager' in u.lower() for u in urls): trackers_found.append('Google Tag Manager')
if any('facebook' in u.lower() for u in urls): trackers_found.append('Facebook')
if any('hotjar' in u.lower() for u in urls): trackers_found.append('Hotjar')
if any('clarity' in u.lower() for u in urls): trackers_found.append('Microsoft Clarity')
if any('mixpanel' in u.lower() for u in urls): trackers_found.append('Mixpanel')
if any('amplitude' in u.lower() for u in urls): trackers_found.append('Amplitude')
if any('fingerprint' in u.lower() for u in urls): trackers_found.append('FingerprintJS')
if any('captcha' in u.lower() for u in urls): trackers_found.append('CAPTCHA')
if any('ipapi' in u.lower() for u in urls): trackers_found.append('IP API')
if any('sentry' in u.lower() for u in urls): trackers_found.append('Sentry')

if trackers_found:
    print(f'  Trackers detected: {\", \".join(trackers_found)}')
else:
    print('  No significant trackers detected')

print(f'  Total JS files loaded: {len(all_js)}')
print(f'  Third-party domains: {len([u for u in set(urls) if \"estralis\" not in u.lower()])}')
" 2>/dev/null

echo ""
if [ -n "$SITE_IP" ]; then
  echo -e "  ${BOLD}Your IP seen by:${NC}"
  echo "    - Vercel (hosting): ${SITE_IP}"
  echo "    - Render (backend): ${API_IP:-unknown}"
  echo "    - Google Maps API"
  echo "    - Google DNS"
fi

echo ""
echo -e "${GREEN}Scan complete. Report saved to /tmp/guard_raw.json${NC}"
