#!/bin/bash

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

print_banner() {
  echo -e "${CYAN}"
  echo "  ╔═════════════════════════════════════════════════╗"
  echo "  ║              DATABASE CHOCK                     ║"
  echo "  ║               ft. SNAKEKING                     ║"
  echo "  ╚═════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

log_step() { echo -e "\n${GREEN}[✓]${NC} ${BOLD}$1${NC}"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_err()  { echo -e "${RED}[✗]${NC} $1"; }

needs_setup() {
  if ! command -v node &>/dev/null; then return 0; fi
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then return 0; fi
  return 1
}

install_node() {
  if command -v node &>/dev/null; then
    log_step "Node.js: $(node -v)"; return
  fi
  log_step "Installing Node.js v20..."
  sudo apt update -y && sudo apt install -y curl unzip
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  log_step "Node.js installed: $(node -v)"
}

install_system_deps() {
  log_step "Installing system dependencies..."
  local asound_pkg="libasound2"
  if apt-cache show libasound2t64 &>/dev/null; then
    asound_pkg="libasound2t64"
  fi
  sudo apt install -y \
    build-essential libcairo2-dev libjpeg-dev libpango1.0-dev \
    libgif-dev librsvg2-dev libpixman-1-dev libnss3 libatk1.0-0 \
    libatk-bridge2.0-0 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 "$asound_pkg" libpangocairo-1.0-0 libgtk-3-0 \
    libxshmfence1 libdrm2 libxfixes3 libcups2 libxtst6 fonts-liberation
}

install_tor() {
  log_step "Installing & configuring Tor..."
  sudo apt install -y tor

  sudo sed -i 's/#ControlPort 9051/ControlPort 9051/' /etc/tor/torrc 2>/dev/null || true
  sudo sed -i 's/#CookieAuthentication 1/CookieAuthentication 0/' /etc/tor/torrc 2>/dev/null || true

  if ! grep -q "HashedControlPassword" /etc/tor/torrc; then
    echo 'HashedControlPassword ""' | sudo tee -a /etc/tor/torrc >/dev/null 2>&1 || true
  fi
  sudo systemctl enable tor 2>/dev/null || true
  sudo systemctl restart tor 2>/dev/null || sudo service tor restart 2>/dev/null || true
  sleep 2
  if systemctl is-active --quiet tor 2>/dev/null; then
    log_step "Tor is running on SOCKS5 port 9050"
  else
    log_warn "Tor may not be running — start manually: sudo tor &"
  fi
}

install_npm_deps() {
  log_step "Installing npm packages..."
  cd "$SCRIPT_DIR" && npm install
}

install_playwright() {
  log_step "Installing Playwright Chromium..."
  npx playwright install chromium
  sudo npx playwright install-deps chromium 2>/dev/null || true
}

create_dirs() {
  mkdir -p "$SCRIPT_DIR"/{uploads,logs,generated_receipts,screenshots,logos}
}

install_cloudflared() {
  if command -v cloudflared &>/dev/null; then
    log_step "cloudflared already installed"; return
  fi
  log_step "Installing cloudflared (Cloudflare Tunnel)..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  sudo dpkg -i /tmp/cloudflared.deb 2>/dev/null || sudo apt install -f -y
  rm -f /tmp/cloudflared.deb
  log_step "cloudflared installed"
}

run_setup() {
  log_step "Running full setup..."
  install_node
  install_system_deps
  install_tor
  install_cloudflared
  install_npm_deps
  install_playwright
  create_dirs
  log_step "Setup complete!"
}



check_tor() {
  if systemctl is-active --quiet tor 2>/dev/null || pgrep -x tor >/dev/null 2>&1 || tasklist.exe 2>/dev/null | grep -i "tor.exe" >/dev/null 2>&1 || curl -s --socks5 127.0.0.1:9050 https://check.torproject.org/ &>/dev/null; then
    echo -e "  Tor: ${GREEN}RUNNING${NC}"
  else
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
      echo -e "  Tor: ${RED}STOPPED${NC} — start Tor or run 'tor' in terminal"
    else
      echo -e "  Tor: ${RED}STOPPED${NC} — start with: sudo systemctl start tor"
    fi
  fi
}

show_menu() {
  echo -e "${BOLD}─── RUN OPTIONS ─── (${YELLOW}all names in NAMES.TXT${NC}${BOLD}) ──${NC}"
  echo -e "  ${CYAN}1)${NC}  Run ALL names + Tor (parallel)     ${GREEN}(RECOMMENDED)${NC}"
  echo -e "  ${CYAN}2)${NC}  Run custom count (parallel, no proxy)"
  echo -e "  ${CYAN}3)${NC}  Run with proxy list (proxies.txt)"
  echo -e "  ${CYAN}4)${NC}  Run sequential (single thread)"
  echo -e "  ${CYAN}5)${NC}  Run in background (VPS/nohup)"
  echo ""
  echo -e "${BOLD}─── DASHBOARD ──────────────────────────────────────${NC}"
  echo -e "  ${CYAN}6)${NC}  Launch Dashboard (local)"
  echo -e "  ${CYAN}7)${NC}  Launch Dashboard + Cloudflare Tunnel ${GREEN}(PUBLIC URL)${NC}"
  echo -e "  ${CYAN}8)${NC}  Run Bot + Dashboard + Tunnel (all-in-one)"
  echo ""
  echo -e "${BOLD}─── SETUP & TOOLS ──────────────────────────────────${NC}"
  echo -e "  ${CYAN}9)${NC}  Full setup (Node + Tor + Tunnel)"
  echo -e "  ${CYAN}10)${NC} Start / restart Tor"
  echo -e "  ${CYAN}11)${NC} Check Tor IP"
  echo -e "  ${CYAN}12)${NC} View live logs"
  echo -e "  ${CYAN}13)${NC} Stop all bots + dashboard"
  echo -e "  ${CYAN}0)${NC}  Exit"
  echo ""
  check_tor
  echo ""
  echo -n "Choice: "
}

print_banner
create_dirs

if needs_setup; then
  log_warn "First run — starting setup..."
  run_setup
fi

while true; do
  show_menu
  read -r choice

  case $choice in
    1)
      echo -n "Parallel workers? [10]: "; read -r workers
      workers=${workers:-10}
      if ! pgrep -x tor >/dev/null 2>&1 && ! tasklist.exe 2>/dev/null | grep -i "tor.exe" >/dev/null 2>&1; then
        log_warn "Starting Tor..."
        if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
          start tor 2>/dev/null || tor &
        else
          sudo systemctl start tor 2>/dev/null || sudo tor &
        fi
        sleep 3
      fi
      log_step "Running ALL names in NAMES.TXT, $workers parallel, Tor IP rotation..."
      node "$SCRIPT_DIR/index.js" --parallel "$workers" --proxy tor
      ;;
    2)
      echo -n "How many registrations? [50]: "; read -r count
      count=${count:-50}
      echo -n "Parallel workers? [10]: "; read -r workers
      workers=${workers:-10}
      node "$SCRIPT_DIR/index.js" "$count" --parallel "$workers"
      ;;
    3)
      if [ ! -f "$SCRIPT_DIR/proxies.txt" ]; then
        log_err "proxies.txt not found!"; continue
      fi
      echo -n "Parallel workers? [10]: "; read -r workers
      workers=${workers:-10}
      node "$SCRIPT_DIR/index.js" --parallel "$workers" --proxy file
      ;;
    4)
      echo -n "How many? [5]: "; read -r count
      count=${count:-5}
      node "$SCRIPT_DIR/index.js" "$count" --proxy tor
      ;;
    5)
      echo -n "Parallel workers? [10]: "; read -r workers
      workers=${workers:-10}
      LOGFILE="$SCRIPT_DIR/logs/bg_$(date +%s).log"
      nohup node "$SCRIPT_DIR/index.js" --parallel "$workers" --proxy tor > "$LOGFILE" 2>&1 &
      log_step "Background PID: $! — Log: $LOGFILE"
      ;;
    6)
      log_step "Starting Dashboard on http://localhost:4000 ..."
      node "$SCRIPT_DIR/dashboard/server.js" &
      DASH_PID=$!
      log_step "Dashboard running (PID: $DASH_PID)"
      echo -e "  Open: ${CYAN}http://localhost:4000${NC}"
      echo -e "  Press Enter to stop dashboard..."
      read -r
      kill $DASH_PID 2>/dev/null
      ;;
    7)
      log_step "Starting Dashboard + Cloudflare Tunnel..."
      node "$SCRIPT_DIR/dashboard/server.js" &
      DASH_PID=$!
      sleep 1
      log_step "Dashboard running. Starting Cloudflare Tunnel..."
      echo -e "  ${YELLOW}Look for the public URL below (*.trycloudflare.com)${NC}"
      echo ""
      cloudflared tunnel --url http://localhost:4000 &
      CF_PID=$!
      echo ""
      echo -e "  Press Enter to stop dashboard + tunnel..."
      read -r
      kill $DASH_PID $CF_PID 2>/dev/null
      ;;
    8)
      log_step "Starting Bot + Dashboard + Tunnel (all-in-one)..."

      node "$SCRIPT_DIR/dashboard/server.js" &
      DASH_PID=$!
      sleep 1

      cloudflared tunnel --url http://localhost:4000 &
      CF_PID=$!
      sleep 3
      echo ""
      echo -n "Parallel workers? [10]: "; read -r workers
      workers=${workers:-10}

      log_step "Bot starting... Dashboard is live. Watch the tunnel URL above."
      node "$SCRIPT_DIR/index.js" --parallel "$workers" --proxy tor

      kill $DASH_PID $CF_PID 2>/dev/null
      log_step "Bot finished. Dashboard + Tunnel stopped."
      ;;
    9) run_setup ;;
    10)
      log_step "Restarting Tor..."
      if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
        taskkill.exe /f /im tor.exe 2>/dev/null || true
        start tor 2>/dev/null || tor &
      else
        sudo systemctl restart tor 2>/dev/null || sudo service tor restart 2>/dev/null || (sudo killall tor 2>/dev/null; sudo tor &)
      fi
      sleep 2; check_tor
      ;;
    11)
      log_step "Checking Tor exit IP..."
      REAL_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")
      TOR_IP=$(curl -s --socks5 127.0.0.1:9050 ifconfig.me 2>/dev/null || echo "Tor not running")
      echo -e "  Real IP: ${RED}$REAL_IP${NC}"
      echo -e "  Tor IP:  ${GREEN}$TOR_IP${NC}"
      ;;
    12)
      LATEST=$(ls -t "$SCRIPT_DIR/logs/"*.log 2>/dev/null | head -1)
      if [ -n "$LATEST" ]; then tail -f "$LATEST"
      else log_warn "No logs found"; fi
      ;;
    13)
      pkill -f "node.*index.js" 2>/dev/null || true
      pkill -f "node.*server.js" 2>/dev/null || true
      pkill -f cloudflared 2>/dev/null || true
      log_step "All processes stopped"
      ;;
    0) echo -e "${GREEN}Bye!${NC}"; exit 0 ;;
    *) log_err "Invalid choice" ;;
  esac
  echo ""
done
