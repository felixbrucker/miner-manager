'use strict';

var path = require('path');

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
  var running=miningController.isRunning();
  if (running)
    miningController.stopAllMiner();
  const spawn = require('cross-spawn');
  const child = spawn('git',['pull'],{
      detached: true,
      stdio: 'ignore',
      shell:true
    });
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
    const spawn = require('cross-spawn');
    var isWin = /^win/.test(process.platform);
    if(isWin){
      const child = spawn('helpers\\updateWindowsMiner.bat',[],{
        detached: true,
        stdio: 'ignore',
        shell:true
      });
      child.on('error', function(err) {
        console.log(err);
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
        console.log(err);
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



function init() {
}

init();

exports.getConfig = getConfig;
exports.setConfig = setConfig;
exports.update = update;
exports.updateMiner = updateMiner;
