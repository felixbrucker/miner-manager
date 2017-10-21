const axios = require('axios');
const colors = require('colors/safe');
const baseMiner = require('./baseMiner');

module.exports = class cpuminerOpt extends baseMiner {

  constructor(binPath, minerString, options) {
    super(binPath, minerString, options);
  }

  async updateStats() {
    const data = {};
    try {
      const result = (await axios.get(`http://127.0.0.1:${this.port}`)).data;
      if (result.uptime) {
        data.uptime = result.uptime;
      }
      if (result.version) {
        data.version = result.version;
      }
      if (result['solution_rate'] && result['solution_rate']['Total']) {
        if (result['solution_rate']['Total']['3600s']) {
          data.hashrate = result['solution_rate']['Total']['3600s'];
        } else {
          if (result['solution_rate']['Total']['60s']) {
            data.hashrate = result['solution_rate']['Total']['60s'];
          } else {
            data.hashrate = result['solution_rate']['Total']['5s'];
          }
        }
      }
      if (result.share) {
        data.accepted = result.share.accepted;
        data.rejected = result.share.rejected;
      }
    } catch (err) {
      data.uptime = null;
      data.version = null;
      data.hashrate = null;
      data.accepted = null;
      data.rejected = null;
      this.logger.warn(`Error: Unable to get stats data for optiminer-zec on port ${this.port}`);
    }
    super.updateStats();
    this.stats.data = data;
  }

  async handleMinerCrash() {
    if (this.running) {
      this.logger.warn(`${colors.cyan('[optiminer-zec]')} ${colors.red('miner terminated, restarting...')}`);
      await super.handleMinerCrash();
    }
  }

  parseApiPort(port) {
    return ` -m ${port}`;
  }

  parsePoolToMinerString(pool, groupName, rigName) {
    let worker = pool.worker;
    // only append dot if no dot already present and at least one string is getting appended
    if ((pool.appendRigName || pool.appendGroupName) && worker.indexOf('.') === -1) {
      worker += '.';
    }
    worker += (pool.appendRigName ? rigName : '');
    worker += (pool.appendGroupName ? groupName : '');
    let arr = pool.url.split('://');
    arr = arr[(arr.length === 1 ? 0 : 1)].split(':');
    const hostname = arr[0];
    const port = arr[1];
    return ` -s ${hostname}:${port} -u ${worker} -p ${pool.pass}`;
  }
};