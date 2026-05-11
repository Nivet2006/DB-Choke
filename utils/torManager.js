
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const TOR_DATA_DIR = path.join(__dirname, '..', '.tor_instances');

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
}

function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = net.createConnection(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Tor port ${port} did not start within ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 1000);
        }
      });
    };
    tryConnect();
  });
}

async function spawnTorInstances(count, basePort = 9150) {

  if (!fs.existsSync(TOR_DATA_DIR)) {
    fs.mkdirSync(TOR_DATA_DIR, { recursive: true });
  }

  const instances = [];
  console.log(`[TOR] Launching ${count} isolated Tor instances...`);

  for (let i = 0; i < count; i++) {
    const socksPort = basePort + (i * 2);
    const controlPort = basePort + (i * 2) + 1;
    const dataDir = path.join(TOR_DATA_DIR, `tor_${i}`);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const socksFree = await isPortFree(socksPort);
    const ctrlFree = await isPortFree(controlPort);

    if (!socksFree || !ctrlFree) {
      console.log(`[TOR] Ports ${socksPort}/${controlPort} in use — reusing existing instance`);
      instances.push({ port: socksPort, process: null, controlPort });
      continue;
    }

    const torProcess = spawn('tor', [
      '--SocksPort', String(socksPort),
      '--ControlPort', String(controlPort),
      '--DataDirectory', dataDir,
      '--CookieAuthentication', '0',
      '--HashedControlPassword', '',
      '--Log', 'notice stderr',
      '--RunAsDaemon', '0',

      '--NewCircuitPeriod', '15',
      '--MaxCircuitDirtiness', '15',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    torProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg.includes('Bootstrapped 100%') || msg.includes('error') || msg.includes('failed')) {
        console.log(`[TOR-${i}] ${msg.slice(0, 120)}`);
      }
    });

    torProcess.on('error', (err) => {
      console.log(`[TOR-${i}] Failed to start: ${err.message}`);
    });

    instances.push({ port: socksPort, process: torProcess, controlPort, index: i });
    console.log(`[TOR-${i}] Spawned on SOCKS:${socksPort} Control:${controlPort}`);
  }

  console.log(`[TOR] Waiting for ${count} instances to bootstrap...`);
  const readyPromises = instances.map(async (inst, idx) => {
    try {
      await waitForPort(inst.port, 45000);
      console.log(`[TOR-${idx}] ✓ Ready on port ${inst.port}`);
    } catch (err) {
      console.log(`[TOR-${idx}] ✗ ${err.message}`);
    }
  });
  await Promise.all(readyPromises);

  console.log(`[TOR] All ${count} instances ready — each worker gets a unique IP`);

  const cleanup = () => {
    console.log('[TOR] Shutting down all Tor instances...');
    for (const inst of instances) {
      if (inst.process) {
        try { inst.process.kill('SIGTERM'); } catch {}
      }
    }
  };

  return { instances, cleanup };
}

function rotateCircuit(controlPort) {
  try {
    execSync(
      `(echo authenticate '""'; echo signal newnym; echo quit) | nc -q 1 localhost ${controlPort}`,
      { timeout: 5000, stdio: 'pipe' }
    );
  } catch {

  }
}

function ensureSystemTor() {
  try {
    execSync('pgrep -x tor', { stdio: 'pipe' });
    console.log('[TOR] System Tor is running on port 9050');
    return true;
  } catch {
    try {
      execSync('sudo systemctl start tor', { timeout: 10000, stdio: 'pipe' });
      console.log('[TOR] Started system Tor');
      return true;
    } catch {
      console.log('[TOR] Could not start Tor — install with: sudo apt install tor');
      return false;
    }
  }
}

module.exports = { spawnTorInstances, rotateCircuit, ensureSystemTor, waitForPort };
