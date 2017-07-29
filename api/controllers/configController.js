const path = require('path');
const log4js = require('log4js');
const rimraf = require('rimraf');
const spawn = require('cross-spawn');
const logger = log4js.getLogger('config');

const configModule = require(`${__basedir}/api/modules/configModule`);
const miningController = require(`${__basedir}/api/controllers/miningController`);

function updateLoggerLevel() {
  log4js.getLogger('system').setLevel(configModule.config.logLevel);
  log4js.getLogger('config').setLevel(configModule.config.logLevel);
  log4js.getLogger('mining').setLevel(configModule.config.logLevel);
  log4js.getLogger('stratumTest').setLevel(configModule.config.logLevel);
}

function getConfig(req, res, next) {
  const obj = configModule.config;
  obj.types = configModule.configNonPersistent.types;
  obj.algos = configModule.configNonPersistent.algos;
  obj.locations = configModule.configNonPersistent.locations;
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(obj));
}
async function setConfig(req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  configModule.setConfig(req.body);
  updateLoggerLevel();
  try {
    await configModule.saveConfig();
    res.send(JSON.stringify({result: true}));
  } catch (err) {
    logger.error(err.message);
    res.send(JSON.stringify({result: false}));
  }
}

async function update(req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  const running = miningController.isRunning();
  if (running) {
    await miningController.stopAllMiner();
  }
  const isWin = /^win/.test(process.platform);
  const path = isWin ? 'helpers\\update.bat' : 'helpers/update.sh';
  const child = spawn(path, [], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  if (running) {
    child.on('close', () => {
      const result = miningController.startAllMiner();
      res.send(JSON.stringify({result}));
    });
  } else {
    res.send(JSON.stringify({result: true}));
  }
}

async function updateMiner(req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  const running = miningController.isRunning();
  if (running) {
    await miningController.stopAllMiner();
  }

  if (req.body.clean) {
    rimraf.sync('miner');
  }
  const isWin = /^win/.test(process.platform);
  const path = isWin ? 'helpers\\updateWindowsMiner.bat' : 'helpers/updateLinuxMiner.sh';
  const child = spawn(path, [], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  if (running) {
    child.on('close', () => {
      const result = miningController.startAllMiner();
      res.send(JSON.stringify({result}));
    });
  } else {
    res.send(JSON.stringify({result: true}));
  }
}


async function rebootSystem(req, res, next) {
  const running = miningController.isRunning();
  if (running) {
    await miningController.stopAllMiner();
  }

  const isWin = /^win/.test(process.platform);
  const path = isWin ? 'helpers\\rebootWindows.bat' : 'helpers/rebootLinux.sh';
  const child = spawn(path, [], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({result: true}));
}


function init() {
  logger.setLevel(configModule.config.logLevel);
}

setTimeout(init, 1000);

exports.getConfig = getConfig;
exports.setConfig = setConfig;
exports.update = update;
exports.updateMiner = updateMiner;
exports.rebootSystem = rebootSystem;
