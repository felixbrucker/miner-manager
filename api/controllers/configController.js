'use strict';

var path = require('path');
var log4js = require('log4js');
const rimraf = require('rimraf');
var logger = log4js.getLogger('config');

var configModule = require(__basedir + 'api/modules/configModule');
var miningController = require(__basedir + 'api/controllers/miningController');

function changeLoggerLevel(){
  log4js.getLogger('system').setLevel(configModule.config.logLevel);
  log4js.getLogger('config').setLevel(configModule.config.logLevel);
  log4js.getLogger('mining').setLevel(configModule.config.logLevel);
  log4js.getLogger('stratumTest').setLevel(configModule.config.logLevel);
}

function getConfig(req, res, next) {
  var obj=configModule.config;
  obj.types=configModule.configNonPersistent.types;
  obj.algos=configModule.configNonPersistent.algos;
  obj.locations=configModule.configNonPersistent.locations;
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(obj));
}
function setConfig(req, res, next) {
  configModule.setConfig(req.body);
  changeLoggerLevel();
  configModule.saveConfig();
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({result: true}));
}

function update(req, res, next) {
  var running=miningController.isRunning();
  if (running)
    miningController.stopAllMiner();
  const spawn = require('cross-spawn');
  var isWin = /^win/.test(process.platform);
  if (isWin){
    const child = spawn('helpers\\update.bat', [], {
      detached: true,
      stdio: 'ignore',
      shell: true
    });
  }else{
    const child = spawn('helpers/update.sh', [], {
      detached: true,
      stdio: 'ignore',
      shell: true
    });
  }
  if (running)
    setTimeout(function(){
      miningController.startAllMiner();
    },4000);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({result:true}));
}

function updateMiner(req, res, next) {
  var running=miningController.isRunning();
  if (running)
    miningController.stopAllMiner();
  setTimeout(function(){
    if (req.body.clean) {
      rimraf.sync('miner');
    }
    const spawn = require('cross-spawn');
    var isWin = /^win/.test(process.platform);
    if(isWin){
      const child = spawn('helpers\\updateWindowsMiner.bat',[],{
        detached: true,
        stdio: 'ignore',
        shell:true
      });
      child.on('error', function(err) {
        logger.error(err);
      });
      child.on('exit', function() {
        if (running)
          setTimeout(function(){
            miningController.startAllMiner();
          },2000);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({result:true}));
      });
    }
    else{
      const child = spawn('helpers/updateLinuxMiner.sh',[],{
        detached: true,
        stdio: 'ignore',
        shell:true
      });
      child.on('error', function(err) {
        logger.error(err);
      });
      child.on('exit', function() {
        if (running)
          setTimeout(function(){
            miningController.startAllMiner();
          },2000);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({result:true}));
      });
    }


  },1000);
}


function rebootSystem(req, res, next) {
  var running=miningController.isRunning();
  if (running)
    miningController.stopAllMiner();
  setTimeout(function(){
    const spawn = require('cross-spawn');
    var isWin = /^win/.test(process.platform);
    if(isWin){
      const child = spawn('helpers\\rebootWindows.bat',[],{
        detached: true,
        stdio: 'ignore',
        shell:true
      });
      child.on('error', function(err) {
        logger.error(err);
      });
      child.on('exit', function() {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({result:true}));
      });
    }
    else{
      const child = spawn('helpers/rebootLinux.sh',[],{
        detached: true,
        stdio: 'ignore',
        shell:true
      });
      child.on('error', function(err) {
        logger.error(err);
      });
      child.on('exit', function() {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({result:true}));
      });
    }
  },1000);
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
