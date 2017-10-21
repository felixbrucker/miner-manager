const path = require('path');
const fs = require('fs');
const spawn = require('cross-spawn');
const psTree = require('ps-tree');
const rfs = require('rotating-file-stream');


module.exports = class baseMiner {

  constructor(entry, pool, options) {
    this.isWin = /^win/.test(process.platform);
    this.dirPath = path.dirname(entry.binPath);
    this.fileName = path.basename(entry.binPath);
    this.fullPath = entry.binPath;
    this.minerString = this.constructMinerString(entry, options.rigName, pool);
    this.port = entry.port;
    this.id = entry.id;
    this.expectedHr = entry.hashrate;
    this.type = entry.type;

    this.logger = options.logger;
    this.startShell = entry.shell;
    this.writeMinerLog = entry.writeMinerLog;

    this.logWriter = null;
    if (this.writeMinerLog) {
      this.setupFileLogging(options.logDir);
    }

    this.running = false;
    this.miner = null;
    this.statsInterval = null;
    this.stats = {
      running: this.running,
      text: this.fullPath,
      type: this.type,
      expectedHr: this.expectedHr,
    };
  }

  start() {
    if (this.running) {
      throw new Error(`Miner ${this.id} already running`);
    }
    let binPath = this.fullPath;
    const startOptions = {};
    if (this.startShell) {
      startOptions.shell = true;
      startOptions.detached = true;
    }
    if (this.isWin) {
      startOptions.cwd = this.dirPath;
      binPath = this.fileName;
    }
    this.miner = spawn(binPath, this.minerString.split(' '), startOptions);
    this.running = !!(this.miner && this.miner.pid);
    if (this.running) {
      this.setupMinerListener();
    }

    return this.running;
  }

  async stop() {
    if (!this.running) {
      throw new Error(`Miner ${this.id} already stopped`);
    }
    this.running = false;
    this.tearDownMinerListener();
    await this.killMiner();
    this.miner = null;
  }

  killMiner() {
    return new Promise((resolve) => {
      const signal = 'SIGKILL';
      psTree(this.miner.pid, (err, children) => {
        if (!this.miner) {
          return resolve();
        }
        [this.miner.pid]
          .concat(children.map(p => p.PID))
          .forEach((pid) => {
            try {
              process.kill(pid, signal);
            }
            catch (err) {}
          });
        return resolve();
      });
    });
  }

  async handleStdio(data) {
    if (this.writeMinerLog) {
      this.logWriter.write(data.toString());
    }
    if (this.checkOutputString(data.toString())) {
      await this.killMiner();
    }
  }

  async handleMinerCrash() {
    if (this.running) {
      await this.stop();
      this.start();
    }
  }

  handleMinerError(err) {
    // silently discard enoent for killing proc
  }

  setupMinerListener() {
    this.miner.stdout.on('data', this.handleStdio.bind(this));
    this.miner.stderr.on('data', this.handleStdio.bind(this));
    this.miner.on('close', this.handleMinerCrash.bind(this));
    this.miner.on('error', this.handleMinerError.bind(this));
    this.statsInterval = setInterval(this.updateStats.bind(this), 10 * 1000);
  }

  tearDownMinerListener() {
    // doesn't seem to work due to binding
    // this.miner.stdout.removeListener('data', this.handleStdio.bind(this));
    // this.miner.stderr.removeListener('data', this.handleStdio.bind(this));
    // this.miner.removeListener('close', this.handleMinerCrash.bind(this));
    // this.miner.removeListener('error', this.handleMinerError.bind(this));
    clearInterval(this.statsInterval);
    this.statsInterval = null;
  }

  setupFileLogging(logDir) {
    this.logWriter = rfs(`miner-${this.id}.log`, {
      size: '50M',
      path: logDir,
    });
    this.logWriter.on('rotated', (filename) => fs.unlink(filename, () => {}));
  }

  constructMinerString(entry, rigName, pool) {
    let minerString = entry.cmdline;
    if (entry.port) {
      minerString += this.parseApiPort(entry.port);
    }
    minerString += this.parsePoolToMinerString(pool, entry.group, rigName);
    return minerString;
  }

  getStats() {
    return this.stats;
  }

  parseApiPort() {
    return '';
  }

  parsePoolToMinerString() {
    return '';
  }

  checkOutputString() {
    return false;
  }

  async updateStats() {
    this.stats = {
      running: this.running,
      text: this.fullPath,
      type: this.type,
      expectedHr: this.expectedHr,
    };
  }
};