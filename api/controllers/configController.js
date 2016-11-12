'use strict';

var configModule = require(__basedir + 'api/modules/configModule');
var miningController = require(__basedir + 'api/controllers/miningController');


function getConfig(req, res, next) {
  var obj=configModule.config;
  obj.types=configModule.configNonPersistent.types;
  obj.algos=configModule.configNonPersistent.algos;
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(obj));
}
function setConfig(req, res, next) {
  configModule.setConfig(req.body);
  configModule.saveConfig();
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({result: true}));
}

function update(req, res, next) {
  miningController.stopAllMiner();
  const spawn = require('cross-spawn');
  const child = spawn('git',['pull'],{
      detached: true,
      stdio: 'ignore',
      shell:true
    });
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({result:true}));
}

function init() {
}

init();

exports.getConfig = getConfig;
exports.setConfig = setConfig;
exports.update = update;
