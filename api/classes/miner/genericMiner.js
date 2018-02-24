const colors = require('colors/safe');
const baseMiner = require('./shared/baseMiner');

module.exports = class genericMiner extends baseMiner {

  constructor(binPath, minerString, options) {
    super(binPath, minerString, options);
  }

  async handleMinerCrash() {
    if (this.running) {
      this.logger.warn(`${colors.cyan('[generic miner]')} ${colors.red('miner terminated, restarting...')}`);
      await super.handleMinerCrash();
    }
  }
};