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


async function checkIfMiningOnCorrectPool(group) {
  if (!group.pools) {
    return false;
  }
  const poolArray = await Promise.all(group.pools.map(async (pool) => {
    let result = false;
    if (pool.name.some(name => name.includes('autoswitch'))) {
      try {
        result = await getMostProfitablePool(group, pool.name);
      } catch(err) {
        logger.error(err.message);
      }
    } else {
      result = poolUtil.getPoolObj(pool.name[0]); // always use first, regular pools do not support merging
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
  if (!stats.running) {
    return;
  }
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

  stats.entries[entry.id] = null;
  delete stats.entries[entry.id];

  logger.info(colors.cyan(`[${entry.type}]`) + ' miner stopped');
}

async function getMostProfitablePool(group, asPoolNames) { //expected to be an autoswitch pool obj
  const asPools = asPoolNames
    .map(name => poolUtil.getAutoswitchPoolObj(name))
    .filter(pool => pool.enabled);
  if (!configModule.config.profitabilityServiceUrl || asPools.length === 0) {
    return false;
  }

  const query = {
    algos: {},
    region: asPools[0].location, // use location of first asPool for now
    name: configModule.config.rigName + group.name,
    provider: asPools.map(pool => pool.provider),
  };

  const minerForAlgos = {};
  configModule.config.entries
    .filter(entry => entry.group === group.name)
    .filter(entry => entry.enabled)
    .map((entry) => {
      if (!minerForAlgos[entry.algo]) {
        minerForAlgos[entry.algo] = [];
      }
      minerForAlgos[entry.algo].push(entry);
    });
  Object.keys(minerForAlgos).map((key) => {
    minerForAlgos[key].sort((a, b) => b.hashrate - a.hashrate);
    minerForAlgos[key] = minerForAlgos[key][0];
    const bestMiner = minerForAlgos[key];
    const supportsSSL = (bestMiner.type === 'claymore-xmr' || bestMiner.type === 'claymore-zec');
    query.algos[bestMiner.algo] = {hashrate: bestMiner.hashrate, supportsSSL};
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

  if (result.result.length === 0) {
    return false;
  }
  const bestPool = result.result[0];
  const asPool = asPools.find(pool => pool.provider === bestPool.provider);

  const mostProfitablePool = {
    enabled: true,
    isIgnored: false,
    name: `${bestPool.provider}-${bestPool.algorithm}`,
    algo: bestPool.algorithm,
    isSSL: bestPool.isSSL,
    working: true,
    url: bestPool.stratum,
    worker: asPool.worker,
    pass: asPool.pass,
    appendRigName: asPool.appendRigName,
    appendGroupName: asPool.appendGroupName,
  };

  // specific overrides to make it work
  if (asPool.provider === 'minecryptonight') {
    mostProfitablePool.worker = bestPool.user;
    mostProfitablePool.pass = bestPool.pass;
    mostProfitablePool.appendRigName = false;
    mostProfitablePool.appendGroupName = false;
    mostProfitablePool.name = `${bestPool.provider}-${bestPool.symbol}`;
  }

  return mostProfitablePool;
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
    }, 2000);
  }
  stats.rigName = configModule.config.rigName;
}

setTimeout(init, 5000);

exports.getStats = getStats;
exports.startMining = startMining;
exports.stopMining = stopMining;
exports.stopMiner = stopMiner;
exports.stopAllMiner = stopAllMiner;
exports.startMiner = startMiner;
exports.startAllMiner = startAllMiner;
exports.isRunning = isRunning;
