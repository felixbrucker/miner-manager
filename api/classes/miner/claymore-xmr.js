const net = require('net');
const colors = require('colors/safe');
const baseMiner = require('./baseMiner');

module.exports = class claymoreXmr extends baseMiner {

  constructor(binPath, minerString, options) {
    super(binPath, minerString, options);
  }

  async updateStats() {
    const data = await new Promise((resolve) => {
      const result = {};
      const mysocket = new net.Socket();

      mysocket.on('connect', () => {
        const req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
        mysocket.write(`${req}\n`);
        mysocket.setTimeout(1000);
      });

      mysocket.on('timeout', () => {
        mysocket.end();
        mysocket.destroy();
        this.logger.warn(`timeout connecting to claymore-xmr on port ${this.port}`);
        result.uptime = null;
        result['xmr-hashrate'] = null;
        result['xmr-accepted'] = null;
        result['xmr-rejected'] = null;
        result.temps = null;
        result.fans = null;
        result.pools = null;
        result.version = null;
        resolve(result);
      });

      mysocket.on('data', (data) => {
        const d = JSON.parse(data);
        result.uptime = d.result[1] * 60;
        let properties = d.result[2].split(';');
        result['xmr-hashrate'] = properties[0];
        result['xmr-accepted'] = properties[1];
        result['xmr-rejected'] = properties[2];
        properties = d.result[6].split(';');
        result.temps = [];
        result.fans = [];
        for (let i = 0; i < properties.length; i += 2) {
          if (properties[i] !== '' && properties[i] !== null) {
            result.temps.push(parseInt(properties[i], 10));
            result.fans.push(parseInt(properties[i + 1], 10));
          }
        }
        result.pools = d.result[7].split(';');
        result.version = d.result[0].replace(' - XMR', '');
        mysocket.end();
        mysocket.destroy();
        resolve(result);
      });

      mysocket.on('close', () => {});

      mysocket.on('error', (err) => {
        this.logger.warn(`socket error for claymore-xmr on port ${this.port}`);
        this.logger.debug(err.message);
        mysocket.destroy();
        resolve(result);
      });

      mysocket.connect(this.port, '127.0.0.1');
    });
    super.updateStats();
    this.stats.data = data;
  }

  async handleMinerCrash() {
    if (this.running) {
      this.logger.warn(`${colors.cyan('[claymore-xmr]')} ${colors.red('miner terminated, restarting...')}`);
      await super.handleMinerCrash();
    }
  }

  parseApiPort(port) {
    return ` -mport -${port}`;
  }

  parsePoolToMinerString(pool, groupName, rigName) {
    let worker = pool.worker;
    // only append dot if no dot already present and at least one string is getting appended
    if ((pool.appendRigName || pool.appendGroupName) && worker.indexOf('.') === -1) {
      worker += '.';
    }
    worker += (pool.appendRigName ? rigName : '');
    worker += (pool.appendGroupName ? groupName : '');
    return ` -xpool ${pool.url} -xwal ${worker} -xpsw ${pool.pass}`;
  }
};