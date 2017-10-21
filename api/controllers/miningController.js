const colors = require('colors/safe');
const axios = require('axios');
const log4js = require('log4js');
const url = require('url');
const logger = log4js.getLogger('mining');
const stratumTestLogger = log4js.getLogger('stratumTest');

const configModule = require(`${__basedir}/api/modules/configModule`);
const stratumTestModule = require(`${__basedir}/api/modules/stratumTestModule`);
const minerUtil = require('../lib/miner/util');
const poolUtil = require('../lib/pool/util');

let stats = {
  running: null,
  entries: {},
  rigName: null
};

global.miner = {};
let prevEntries = {};
let profitTimer = {};
let problemCounter = {};
let reloading = false;

function getStats(req, res, next) {
  stats.rigName = configModule.config.rigName;
  Object.keys(miner).forEach((id) => {
    stats.entries[id] = miner[id].getStats();
  });
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(stats));
}

function startMining(req, res, next) {
  let result = false;
  if (!stats.running) {
    result = startAllMiner();
  }
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({result}));
}

async function stopMining(req, res, next) {
  if (stats.running) {
    await stopAllMiner();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: true}));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: false}));
  }
}

async function updateStratumStatus(pool, origPool) {
  if (reloading) {
    return false;
  }
  let result = {};
  try {
    result = await stratumTestModule.testStratum(pool, configModule.config.rigName);
    stratumTestLogger.debug(`${result.data} from pool: ${pool.name}`);
  } catch (err) {
    logger.error(err);
  }
  if (result.working) {
    if (problemCounter[pool.name] >= 2) {
      stratumTestLogger.info(`${pool.name} is working again`);
    }
    problemCounter[pool.name] = 0;
    origPool.working = true;
  } else {
    if (problemCounter[pool.name] === 1000) {
      problemCounter[pool.name] = 3;
    } else {
      problemCounter[pool.name] += 1;
    }
    if (problemCounter[pool.name] === 2) {
      origPool.working = false;
      stratumTestLogger.info(`${pool.name} is not working anymore: ${result.data}`);
    }
  }
}

function updatePoolStatus() {
  //only check mineable algos/pools
  let minerAlgos = {};
  configModule.config.entries.forEach((entry) => {
    if (entry.enabled) {
      minerAlgos[entry.algo] = true;
    }
  });
  configModule.config.pools.forEach((pool) => {
    if (pool.enabled && (!pool.isIgnored) && minerAlgos[pool.algo]) {
      if (problemCounter[pool.name] === undefined) {
        problemCounter[pool.name] = 0;
      }
      updateStratumStatus(pool, pool);
    }
  });
  configModule.config.autoswitchPools.forEach((asPool) => {
    asPool.pools.forEach((pool) => {
      if (pool.enabled && (!pool.isIgnored) && minerAlgos[pool.algo]) {
        const obj = JSON.parse(JSON.stringify(pool));
        obj.url = poolUtil.parseLocation(pool.url, asPool.location);
        obj.worker = asPool.worker;
        obj.pass = asPool.pass;
        if (problemCounter[pool.name] === undefined) {
          problemCounter[pool.name] = 0;
        }
        updateStratumStatus(obj, pool);
      }
    });
  });
}

async function checkIfMiningOnCorrectPool(group) {
  if (!group.pools) {
    return false;
  }
  const poolArray = await Promise.all(group.pools.map(async (pool) => {
    let result = false;
    if (pool.name.includes('autoswitch')) {
      try {
        result = await getMostProfitablePool(group, poolUtil.getAutoswitchPoolObj(pool.name));
      } catch(err) {
        logger.error(err.message);
      }
    } else {
      result = poolUtil.getPoolObj(pool.name);
    }
    return {
      prio: pool.prio,
      pool: result
    };
  }));
  const chosenPool = poolUtil.selectPool(poolArray, group);
  if (chosenPool === null) {
    return false;
  }
  let bestHr = 0;
  let pos = 0;
  //get the best miner for selected pool, allows multiple miners for same algo to be enabled and using the only the best
  configModule.config.entries.forEach((entry, index) => {
    if (entry.group === group.name && entry.enabled && entry.algo === chosenPool.pool.algo && entry.hashrate > bestHr) {
      pos = index;
      bestHr = entry.hashrate;
    }
  });

  if (prevEntries[group.name] !== undefined) {
    // different?
    if (prevEntries[group.name].pool.name !== chosenPool.pool.name || prevEntries[group.name].miner.id !== configModule.config.entries[pos].id) {
      //switch
      logger.info(`[${group.name}] switching from ${prevEntries[group.name].pool.name} to ${chosenPool.pool.name}`);
      await stopMiner(prevEntries[group.name].miner);
      await new Promise((resolve) => setTimeout(() => resolve(), 1100));
      await startMiner(configModule.config.entries[pos], chosenPool.pool);
      prevEntries[group.name] = {pool: chosenPool.pool, miner: configModule.config.entries[pos]};
    }
  } else {
    // init
    await startMiner(configModule.config.entries[pos], chosenPool.pool);
    prevEntries[group.name] = {pool: chosenPool.pool, miner: configModule.config.entries[pos]};
  }
}

async function startAllMiner() {
  if (configModule.config.groups === undefined) {
    return false;
  }
  logger.info('starting up miners, please wait..');
  const groups = configModule.config.groups.filter(group => group.enabled);
  for (let group of groups) {
    await checkIfMiningOnCorrectPool(group);
    profitTimer[group.id] = setInterval(async () => {
      await checkIfMiningOnCorrectPool(group);
    }, 3 * 60 * 1000);
  }
  stats.running = true;
  return true;
}

async function stopAllMiner() {
  stats.running = false;
  configModule.config.groups.forEach((group) => {
    if (profitTimer[group.id] !== undefined && profitTimer[group.id] !== null) {
      clearInterval(profitTimer[group.id]);
      profitTimer[group.id] = null;
    }
  });
  const keys = Object.keys(miner);
  for (let key of keys) {
    await miner[key].stop();
    miner[key] = null;
    delete miner[key];

    stats.entries[key] = null;
    delete stats.entries[key];

    const thisMiner = configModule.config.entries.find((entry) => entry.id === parseInt(key, 10));
    logger.info(colors.cyan(`[${thisMiner.type}]`) + ' miner stopped');
  }
  prevEntries = {};
  logger.info('all miners stopped');
}

async function startMiner(entry, pool) {
  const valid = await minerUtil.validateSettings(entry);
  if (!valid) {
    logger.error(colors.red('some required settings are not properly configured'));
    return false;
  }
  if (!entry.enabled) {
    logger.error(colors.red('miner is not enabled'));
    return false;
  }

  miner[entry.id] = minerUtil.createMinerInstance(entry, pool, {
    rigName: configModule.config.rigName,
    logger,
    logDir: 'data',
  });
  const running = miner[entry.id].start();
  if (running) {
    logger.info(colors.cyan(`[${entry.type}]`) + ' miner started');
  }

  return running;
}

async function stopMiner(entry) {
  await miner[entry.id].stop();
  miner[entry.id] = null;
  delete miner[entry.id];

  stats.entries[key] = null;
  delete stats.entries[key];

  logger.info(colors.cyan(`[${entry.type}]`) + ' miner stopped');
}

async function getMostProfitablePool(group, asPool) { //expected to be an autoswitch pool obj
  if (!configModule.config.profitabilityServiceUrl || !asPool.enabled) {
    return false;
  }
  const query = {
    algos: {},
    region: asPool.location,
    name: configModule.config.rigName + group.name,
  };
  configModule.config.entries.forEach((entry) => {
    if (entry.group === group.name && entry.enabled) {
      query.algos[entry.algo] = {hashrate: entry.hashrate};
    }
  });
  let requestUrl = configModule.config.profitabilityServiceUrl;
  if (requestUrl.indexOf('http') === -1) { // default to http
    requestUrl = `http://${requestUrl}`;
  }
  requestUrl = url.resolve(requestUrl, '/api/query');
  const result = (await axios.post(requestUrl, query)).data;
  if (!result.result) {
    return false;
  }
  const chosenPools = asPool.pools.filter((currPool) => currPool.algo === result.result.algo);
  let bestHr = 0;
  let pos = 0;
  //get the best miner for selected algo, allows multiple miners for same algo to be enabled
  configModule.config.entries.forEach((entry, index) => {
    if (entry.group === group.name && entry.enabled && entry.algo === result.result.algo && entry.hashrate > bestHr) {
      pos = index;
      bestHr = entry.hashrate;
    }
  });
  const bestMiner = configModule.config.entries[pos];
  let preferSSL = false;
  //check if miner supports ssl connection
  if (bestMiner.type === 'claymore-zec' || bestMiner.type === 'claymore-cryptonight')
    preferSSL = true;
  let actualPool;
  //get the right pool (depending on ssl above)
  for (let j = 0; j < chosenPools.length; j++) {
    if (preferSSL) {
      if (chosenPools[j].isSSL) {
        actualPool = chosenPools[j];
        break;
      } else {
        actualPool = chosenPools[j];
      }
    } else {
      if (!chosenPools[j].isSSL) {
        actualPool = chosenPools[j];
      }
    }
  }
  actualPool.url = poolUtil.parseLocation(actualPool.url, asPool.location);
  actualPool.worker = asPool.worker;
  actualPool.pass = asPool.pass;
  actualPool.appendRigName = asPool.appendRigName;
  actualPool.appendGroupName = asPool.appendGroupName;

  return actualPool;
}

function isRunning() {
  return stats.running;
}


function init() {
  logger.setLevel(configModule.config.logLevel);
  if (configModule.config.autostart) {
    logger.info('autostart enabled, starting miner shortly..');
    setTimeout(async () => {
      await startAllMiner();
    }, 10000);
  }
  stats.rigName = configModule.config.rigName;

  // disabled for now because of poolside blocking
  //updatePoolStatus();
  //setInterval(updatePoolStatus, 5 * 60 * 1000);
}

setTimeout(init, 1000);

exports.getStats = getStats;
exports.startMining = startMining;
exports.stopMining = stopMining;
exports.stopMiner = stopMiner;
exports.stopAllMiner = stopAllMiner;
exports.startMiner = startMiner;
exports.startAllMiner = startAllMiner;
exports.isRunning = isRunning;
