const net = require('net');
const colors = require('colors/safe');
const baseMiner = require('./baseMiner');

module.exports = class cpuminerOpt extends baseMiner {

  constructor(binPath, minerString, options) {
    super(binPath, minerString, options);
  }

  async updateStats() {
    const data = await new Promise ((resolve) => {
      const result = {};
      const mysocket = new net.Socket();

      mysocket.on('connect', function () {
        let req = '{"command":"summary+coin","parameter":""}';
        mysocket.write(`${req}\n`);
        mysocket.setTimeout(2000);
      });

      mysocket.on('timeout', () => {
        mysocket.end();
        mysocket.destroy();
        result.accepted = null;
        result.rejected = null;
        result.algorithm = null;
        result.hashrate = null;
        result.miner = null;
        result.uptime = null;
        this.logger.warn(`timeout connecting to sgminer on port ${this.port}`);
        resolve(result);
      });

      mysocket.on('data', (data) => {
        let parsed = null;
        const tmpString = data.toString('utf8');
        try {
          parsed = JSON.parse(tmpString.substring(0, tmpString.length - 1)); // cut last char ('')
        } catch (error) {
          result.accepted = null;
          result.rejected = null;
          result.algorithm = null;
          result.hashrate = null;
          result.miner = null;
          result.uptime = null;
          this.logger.warn(`Error: Unable to get stats data for sgminer on port ${this.port}`);
          this.logger.debug(error);
        }
        if (parsed !== null) {
          result.accepted = parseInt(parsed.summary[0].SUMMARY[0].Accepted);
          result.rejected = parseFloat(parsed.summary[0].SUMMARY[0].Rejected);
          result.algorithm = parsed.coin[0].COIN[0]['Hash Method'];
          result.hashrate = parseFloat(parsed.summary[0].SUMMARY[0]['KHS av']);
          result.miner = parsed.summary[0].STATUS[0].Description;
          result.uptime = parsed.summary[0].SUMMARY[0].Elapsed;
        }
        mysocket.end();
        mysocket.destroy();
        resolve(result);
      });

      mysocket.on('close', () => {});

      mysocket.on('error', (err) => {
        result.accepted = null;
        result.rejected = null;
        result.algorithm = null;
        result.hashrate = null;
        result.miner = null;
        result.uptime = null;
        this.logger.warn(`socket error for sgminer on port ${this.port}`);
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
      this.logger.warn(`${colors.cyan('[sgminer]')} ${colors.red('miner terminated, restarting...')}`);
      await super.handleMinerCrash();
    }
  }

  parseApiPort(port) {
    return ` --api-listen --api-port ${port}`;
  }

  parsePoolToMinerString(pool, groupName, rigName) {
    let worker = pool.worker;
    // only append dot if no dot already present and at least one string is getting appended
    if ((pool.appendRigName || pool.appendGroupName) && worker.indexOf('.') === -1) {
      worker += '.';
    }
    worker += (pool.appendRigName ? rigName : '');
    worker += (pool.appendGroupName ? groupName : '');
    return ` -o ${pool.url} -u ${worker} -p ${pool.pass}`;
  }
};