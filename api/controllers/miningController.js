'use strict';

const https = require('https');
const http = require('http');
var fs = require('fs');
var path = require('path');
var colors = require('colors/safe');
var psTree = require('ps-tree');
var rfs    = require('rotating-file-stream');

var miner_logs = {};

const configModule = require(__basedir + 'api/modules/configModule');
const stratumTestModule = require(__basedir + 'api/modules/stratumTestModule');

var stats = {
  running:null,
  entries:{},
  rigName:null
};


global.miner = {};
var shouldExit=false;
var timers={};
var prevEntries={};
var profitTimer={};
var problemCounter={};
var reloading=false;


var kill = function (pid, signal, callback) {
  signal = signal || 'SIGKILL';
  callback = callback || function () {
    };
  var killTree = true;
  if (killTree) {
    psTree(pid, function (err, children) {
      [pid].concat(
        children.map(function (p) {
          return p.PID;
        })
      ).forEach(function (tpid) {
        try {
          process.kill(tpid, signal)
        }
        catch (ex) {
        }
      });
      callback();
    });
  } else {
    try {
      process.kill(pid, signal)
    }
    catch (ex) {
    }
    callback();
  }
};


function getStats(req, res, next) {
  stats.rigName=configModule.config.rigName;
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(stats));
}

function startMining(req, res, next) {
  if (!stats.running) {
    startAllMiner();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: true}));
  }else{
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: false}));
  }
}

function validateSettings(entry) {
  if(entry.enabled===true && entry.binPath!==undefined && entry.binPath!==null && entry.binPath!=="") {
    try {
      fs.statSync(entry.binPath);
    } catch (err) {
      return !(err && err.code === 'ENOENT');
    }
  }
  return true;
}

function parseLocation(url,location){
  return url.replace("#APPENDLOCATION#",location);
}

function getStratumStatus(pool,isAS,i,j){
  if(!reloading){
    stratumTestModule.testStratum(pool,isAS,i,j,problemCounter,function(result){
      //console.log(result.data + " from pool: "+pool.name);
      //set pool working to false
      if(problemCounter[pool.name]===1000)
        problemCounter[pool.name]=4;
      else
        problemCounter[pool.name]+=1;

      if(problemCounter[pool.name]===3){
        if(isAS)
          configModule.config.autoswitchPools[i].pools[j].working=false;
        else
          pool.working = false;
        console.log(pool.name + " is not working anymore: '" + result.data + "'");
      }

      setTimeout(function(){getStratumStatus(pool,isAS,i,j,problemCounter);},60*1000);
    });
  }
}

function updatePoolStatus(){

  for(var i=0;i<configModule.config.pools.length;i++){
    if(configModule.config.pools[i].enabled){
      (function (i) {
        if(problemCounter[configModule.config.pools[i].name]===undefined)
          problemCounter[configModule.config.pools[i].name]=0;
        getStratumStatus(configModule.config.pools[i],false,i,null);
      })(i);
    }
  }
  for(var i=0;i<configModule.config.autoswitchPools.length;i++){
    for(var j=0;j<configModule.config.autoswitchPools[i].pools.length;j++){
      if(configModule.config.autoswitchPools[i].pools[j].enabled){
        (function (i,j) {
          var obj = JSON.parse(JSON.stringify(configModule.config.autoswitchPools[i].pools[j]));
          obj.url = parseLocation(obj.url, configModule.config.autoswitchPools[i].location);
          obj.worker=configModule.config.autoswitchPools[i].worker;
          obj.pass=configModule.config.autoswitchPools[i].pass;
          if(problemCounter[obj.name]===undefined)
            problemCounter[obj.name]=0;
          getStratumStatus(obj,true,i,j);
        })(i,j);
      }
    }
  }
}

function checkIfMiningOnCorrectPool(group){
  var poolArray=[];
  if(group.pools){
  for(var j=0;j<group.pools.length;j++){
    if(group.pools[j].name.includes('autoswitch')){
      (function (j) {
        getMostProfitablePool(group,getAutoswitchPoolObj(group.pools[j].name),function(result){
          if(result)
            poolArray.push({prio:group.pools[j].prio,pool:result});
        });
      })(j);
    }else{
      var pool=getPoolObj(group.pools[j].name);
      if(pool)
        poolArray.push({prio:group.pools[j].prio,pool:pool});
    }
  }

  setTimeout(function(){
    var chosenPool=selectPool(poolArray);
    if(chosenPool!==null){
      var bestHr=0;
      var pos=0;
      //get the best miner for selected pool, allows multiple miners for same algo to be enabled and using the only the best
      for(var i=0;i< configModule.config.entries.length;i++) {
        var entry = configModule.config.entries[i];
        if(entry.group===group.name&&entry.enabled&&entry.algo===chosenPool.pool.algo&&entry.hashrate>bestHr){
          pos=i;
          bestHr=entry.hashrate;
        }
      }

      if(prevEntries[group.name]!==undefined){
        if(prevEntries[group.name].pool.name!==chosenPool.pool.name||prevEntries[group.name].miner.id!==configModule.config.entries[pos].id){
          //switch
          stopMiner(prevEntries[group.name].miner);
          setTimeout(function (){
            startMiner(configModule.config.entries[pos],chosenPool.pool);
            prevEntries[group.name]={pool:chosenPool.pool,miner:configModule.config.entries[pos]};
          },500);
        }
      }else{
        //startup
        startMiner(configModule.config.entries[pos],chosenPool.pool);
        prevEntries[group.name]={pool:chosenPool.pool,miner:configModule.config.entries[pos]};
      }
    }
  },5000);
  }
}

function startAllMiner(){
  if(configModule.config.groups!==undefined){
    console.log("starting up miners, please wait..");
    for(var i=0;i< configModule.config.groups.length;i++) {
      var group = configModule.config.groups[i];
      (function (group){
        if (group.enabled){
          checkIfMiningOnCorrectPool(group);
          profitTimer[group.id]=setInterval(function(){
            checkIfMiningOnCorrectPool(group);
          },1000*180);
        }
      })(group);
    }
    stats.running=true;
  }
}

function parsePoolToMinerString(pool,minerType,rigName,groupName){
  var result="";
  switch(minerType){
    case "claymore-eth":
      result = " -epool " + pool.url + " -ewal " + pool.worker + (pool.appendRigName ? "."+rigName+groupName+" " : " ") + "-epsw "+pool.pass;
      break;
    case "claymore-zec":
      result = " -zpool " + pool.url + " -zwal " + pool.worker + (pool.appendRigName ? "."+rigName+groupName+" " : " ") + "-zpsw "+pool.pass;
      break;
    case "optiminer-zec":
      var arr = pool.url.split("://");
      arr = arr[(arr.length===1 ? 0 : 1)].split(":");
      var hostname = arr[0];
      var port = arr[1];
      result = " -s " + hostname+":"+ port + " -u " + pool.worker + (pool.appendRigName ? "."+rigName+groupName+" " : " ") + "-p "+pool.pass;
      break;
    case "sgminer-gm":
    case "claymore-cryptonight":
    case "ccminer":
    case "cpuminer-opt":
      result = " -o " + pool.url + " -u " + pool.worker + (pool.appendRigName ? "."+rigName+groupName+" " : " ") + "-p "+pool.pass;
      break;
    case "nheqminer":
      result = " -l " + pool.url + " -u " + pool.worker + (pool.appendRigName ? "."+rigName+groupName+" " : " ") + "-p "+pool.pass;
      break;
    case "other":
      break;
  }
  return result;
}

function parseApiPort(entry){
  var result="";
  switch (entry.type){
    case "cpuminer-opt":
    case "ccminer":
      result=" -b 127.0.0.1:"+entry.port;
      break;
    case "claymore-eth":
    case "claymore-zec":
    case "claymore-cryptonight":
      result=" -mport -"+entry.port;
      break;
    case "optiminer-zec":
      result=" -m "+entry.port;
      break;
    case "sgminer-gm":
      result=" --api-listen --api-port "+entry.port;
      break;
    case "nheqminer":
      result=" -a "+entry.port;
      break;
    case "other":
      break;
  }
  return result;
}

function getPoolObj(poolName){
  for(var i=0;i<configModule.config.pools.length;i++){
    if(configModule.config.pools[i].name===poolName)
      return configModule.config.pools[i];
  }
}
function getAutoswitchPoolObj(poolName){
  for(var i=0;i<configModule.config.autoswitchPools.length;i++){
    if(configModule.config.autoswitchPools[i].name===poolName)
      return configModule.config.autoswitchPools[i];
  }
}

function getMostProfitablePool(group,pool,callback){ //expected to be a autoswitch pool obj
  if(configModule.config.profitabilityServiceUrl!==undefined&&configModule.config.profitabilityServiceUrl!==null&&pool.enabled){
    var query={
      algos:{},
      region:pool.location,
      name:configModule.config.rigName+group.name
    };
    for(var i=0;i< configModule.config.entries.length;i++) {
      var entry = configModule.config.entries[i];
      if(entry.group===group.name&&entry.enabled){
        query.algos[entry.algo]={hashrate:entry.hashrate};
      }
    }
    var arr = configModule.config.profitabilityServiceUrl.split(":");
    var req= http.request({
      host: arr[0],
      path: '/api/query',
      method: 'POST',
      port: arr[1],
      headers: {
        'Content-Type': 'application/json;charset=UTF-8'
      }
    }, function (response) {
      response.setEncoding('utf8');
      var body = '';
      response.on('data', function (d) {
        body += d;
      });
      response.on('end', function () {
        var parsed = null;
        try{
          parsed=JSON.parse(body);
        }catch(error){
          console.log(colors.red("["+group.name.toUpperCase()+"] Error: Unable to get profitability data"));
          console.log(error);
        }
        if (parsed != null){
          if (parsed.result!==false){
            var chosenPools=[];
            for(var j=0;j<pool.pools.length;j++){
              if(pool.pools[j].algo===parsed.result.algo){
                chosenPools.push(pool.pools[j]);
              }
            }
            var destinedOne=null;
            var bestHr=0;
            var pos=0;
            //get the best miner for selected algo, allows multiple miners for same algo to be enabled
            for(var i=0;i< configModule.config.entries.length;i++) {
              var entry = configModule.config.entries[i];
              if(entry.group===group.name&&entry.enabled&&entry.algo===parsed.result.algo&&entry.hashrate>bestHr){
                pos=i;
                bestHr=entry.hashrate;
              }
            }
            destinedOne=configModule.config.entries[pos];
            var preferSSL=false;
            //check if miner supports ssl connection
            if(destinedOne.type==="claymore-zec"||destinedOne.type==="claymore-cryptonight")
              preferSSL=true;
            var actualPool;
            //get the right pool (depending on ssl above)
            for(var j=0;j<chosenPools.length;j++){
              if(preferSSL){
                if(chosenPools[j].isSSL){
                  actualPool=JSON.parse(JSON.stringify(chosenPools[j]));
                  break;
                }else{
                  actualPool=JSON.parse(JSON.stringify(chosenPools[j]));
                }
              }else{
                if(!chosenPools[j].isSSL){
                  actualPool=JSON.parse(JSON.stringify(chosenPools[j]));
                }
              }
            }

            actualPool.url=parseLocation(actualPool.url,pool.location);
            actualPool.worker=pool.worker;
            actualPool.pass=pool.pass;
            actualPool.appendRigName=pool.appendRigName;


            callback(actualPool);
          }else{
            callback(false);
          }
        }else{
          console.log(colors.red("["+group.name.toUpperCase()+"] Error: malformed profitability request"));
          callback(false);
        }
      });
    }).on("error", function(error) {
      console.log(colors.red("["+group.name.toUpperCase()+"] Error: Unable to get profitability data"));
      console.log(error);
      callback(false);
    });
    req.write(JSON.stringify(query));
    req.end();
  }else{
    callback(false);
  }
}

//get lowest prio working & enabled pool
function selectPool(pools){
  var lowest=9999;
  var pos=0;
  for(var i=0;i<pools.length;i++){
    if(pools[i].prio<lowest&&pools[i].pool.working&&pools[i].pool.enabled){
      lowest=pools[i].prio;
      pos=i;
    }
  }
  if(lowest!==9999){
    return pools[pos];
  }
  return null;
}

function startMiner(entry,pool) {
  if (validateSettings(entry)) {
      const spawn = require('cross-spawn');
        (function (entry,pool){
          if (entry.enabled){
            if (miner[entry.id]===undefined || miner[entry.id]===null){
              var minerString=entry.cmdline;
              if (entry.port!==undefined&&entry.port!==null){
                minerString+=parseApiPort(entry);
              }
              minerString+=parsePoolToMinerString(pool,entry.type,configModule.config.rigName,entry.group);
              (function (entry,minerString){
                var isWin = /^win/.test(process.platform);
                if (entry.shell){
                  if (isWin)
                    miner[entry.id]=spawn(path.basename(entry.binPath), minerString.split(" "),{
                      shell:true,
                      detached:true,
                      cwd:path.dirname(entry.binPath)
                    });
                  else
                    miner[entry.id]=spawn(entry.binPath, minerString.split(" "),{
                      shell:true,
                      detached:true
                    });
                }
                else{
                  if (isWin)
                    miner[entry.id]=spawn(path.basename(entry.binPath), minerString.split(" "),{
                      cwd:path.dirname(entry.binPath)
                    });
                  else
                    miner[entry.id]=spawn(entry.binPath, minerString.split(" "));
                }
                if (stats.entries[entry.id]===undefined)
                  stats.entries[entry.id]={};
                stats.entries[entry.id].type=entry.type;
                stats.entries[entry.id].text=entry.binPath+" "+minerString;
                stats.entries[entry.id].expectedHr=entry.hashrate;

                timers[entry.id]=setInterval(function () {
                  getMinerStats(entry.id,entry.port,entry.type);
                }, 5000);


                console.log(colors.cyan("["+entry.type+"] ")+colors.green("miner started"));
                miner_logs[entry.id] = rfs('miner'+entry.id+'.log', {
                  size:'50M',
                  path:'data'
                });
                miner_logs[entry.id].on('rotated', function(filename) {
                  fs.unlinkSync(filename);
                });
                miner[entry.id].stdout.on('data', function (data) {
                  if (entry.writeMinerLog) {
                    miner_logs[entry.id].write(data.toString());
                  }
                  if(checkMinerOutputString(data.toString())){
                    miner[entry.id].kill();
                    kill(miner[entry.id].pid);
                  }
                });
                miner[entry.id].stderr.on('data', function (data) {
                  if (entry.writeMinerLog){
                    miner_logs[entry.id].write(data.toString());
                  }
                  if(checkMinerOutputString(data.toString())){
                    miner[entry.id].kill();
                    kill(miner[entry.id].pid);
                  }
                });

                miner[entry.id].on('exit', function(){
                  restartMinerOnExit(entry,minerString);
                });
                miner[entry.id].on('error', function(err) {
                  //silently discard enoent for killing proc
                });

              }(entry,minerString));


            }else{
              console.log(colors.red("miner already running"));
              return false;
            }
          }
        }(entry,pool));
  } else {
    console.log(colors.red("some required settings are not properly configured"));
    return false;
  }
  return true;
}

function restartMinerOnExit(entry,minerString){
  if (!shouldExit){
    setTimeout(function(){
      (function (entry,minerString){
        stats.entries[entry.id]={};
        stats.entries[entry.id].type=entry.type;
        stats.entries[entry.id].text=entry.binPath+" "+minerString;
        stats.entries[entry.id].expectedHr=entry.hashrate;
        const spawn = require('cross-spawn');
        console.log(colors.cyan("["+entry.type+"] ")+colors.red("miner terminated, restarting..."));
        var isWin = /^win/.test(process.platform);
        if (entry.shell){
          if (isWin)
            miner[entry.id]=spawn(path.basename(entry.binPath), minerString.split(" "),{
              shell:true,
              detached:true,
              cwd:path.dirname(entry.binPath)
            });
          else
            miner[entry.id]=spawn(entry.binPath, minerString.split(" "),{
              shell:true,
              detached:true
            });
        }
        else{
          if (isWin)
            miner[entry.id]=spawn(path.basename(entry.binPath), minerString.split(" "),{
              cwd:path.dirname(entry.binPath)
            });
          else
            miner[entry.id]=spawn(entry.binPath, minerString.split(" "));
        }

        console.log(colors.cyan("["+entry.type+"] ")+colors.green("miner started"));
        miner[entry.id].stdout.on('data', function (data) {
          if (entry.writeMinerLog) {
            miner_logs[entry.id].write(data.toString());
          }
          if(checkMinerOutputString(data.toString())){
            miner[entry.id].kill();
            kill(miner[entry.id].pid);
          }
        });
        miner[entry.id].stderr.on('data', function (data) {
          if (entry.writeMinerLog){
            miner_logs[entry.id].write(data.toString());
          }
          if(checkMinerOutputString(data.toString())){
            miner[entry.id].kill();
            kill(miner[entry.id].pid);
          }
        });
        miner[entry.id].on('exit', function(){
          restartMinerOnExit(entry,minerString);
        });
        miner[entry.id].on('error', function(err) {
          //silently discard enoent for killing proc
        });
      }(entry,minerString));
    },500);
  }
}

function checkMinerOutputString(output){
  if (output.indexOf("CUDA error")!==-1 || output.indexOf("eq_cuda_context")!==-1 || output.indexOf("null (23)")!==-1 || output.indexOf("read_until")!==-1)
    return true;
  else
    return false;
}

function stopMining(req, res, next) {
  if (stats.running) {
    stopAllMiner();
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: true}));
  }else{
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({result: false}));
  }
}

function stopAllMiner() {
  shouldExit=true;
  for(var i=0;i< configModule.config.groups.length;i++) {
    var group = configModule.config.groups[i];
    if(profitTimer[group.id]!==undefined&&profitTimer[group.id]!==null){
      clearInterval(profitTimer[group.id]);
      profitTimer[group.id]=null;
    }
  }
  Object.keys(miner).forEach(function (key) {
    clearInterval(timers[key]);
    kill(miner[key].pid);
    stats.entries[key]=null;
    delete stats.entries[key];
    for (var i=0;i<configModule.config.entries.length;i++){
      if (configModule.config.entries[i].id==key){
        console.log(colors.cyan("["+configModule.config.entries[i].type+"] ")+colors.green("miner stopped"));
        break;
      }
    }
    miner[key]=null;
    delete miner[key];
  });
  stats.running=false;
  prevEntries={};
  setTimeout(function(){shouldExit=false;},5000);
}

function stopMiner(entry) {
  shouldExit=true;
  clearInterval(timers[entry.id]);
  kill(miner[entry.id].pid);
  stats.entries[entry.id]=null;
  delete stats.entries[entry.id];
  console.log(colors.cyan("["+entry.type+"] ")+colors.green("miner stopped"));
  miner[entry.id]=null;
  delete miner[entry.id];
  setTimeout(function(){shouldExit=false;},1000);
}

function asyncSleep(param, callback) {
  setTimeout(function () {
    callback(null);
  }, param);
}


function getMinerStats(id,port,type) {
  switch(type){
    case "cpuminer-opt":
    case "ccminer":
      var WebSocketClient = require('websocket').client;
      var client = new WebSocketClient();

      client.on('connectFailed', function (error) {
        console.log(colors.red("Connect Failed: " + error.toString()));
      });

      client.on('connect', function (connection) {
        connection.on('error', function (error) {
          console.log(colors.red("Connection Error: " + error.toString()));
        });
        connection.on('close', function () {
        });
        connection.on('message', function (message) {
          if (message.type === 'utf8') {
            var properties = message.utf8Data.split('|');
            properties = properties[0].split(';');
            var obj = {};
            properties.forEach(function (property) {
              var tup = property.split('=');
              obj[tup[0]] = tup[1];
            });
            if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
              stats.entries[id].accepted = parseFloat(obj.ACC);
            stats.entries[id].acceptedPerMinute = parseFloat(obj.ACCMN);
            stats.entries[id].algorithm = obj.ALGO;
            stats.entries[id].difficulty = parseFloat(obj.DIFF);
            stats.entries[id].hashrate = parseFloat(obj.KHS);
            stats.entries[id].miner = obj.NAME + " " + obj.VER;
            stats.entries[id].rejected = parseFloat(obj.REJ);
            stats.entries[id].uptime = obj.UPTIME;
            switch(type){
              case "cpuminer-opt":
                stats.entries[id].temperature = parseFloat(obj.TEMP);
                stats.entries[id].cores = parseFloat(obj.CPUS);
                break;
              case "ccminer":
                stats.entries[id].gpus = parseFloat(obj.GPUS);
                break;
            }
            }
          }
        });
      });
      client.connect('ws://127.0.0.1:'+port+'/summary', 'text');
      break;
    case "claymore-eth":
      var net = require('net');
      var mysocket = new net.Socket();

      mysocket.on('connect', function() {
        var req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
        mysocket.write(req + '\n');
        mysocket.setTimeout(1000);
        mysocket.end();
      });

      mysocket.on('timeout', function() {
        
        mysocket.destroy();
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          console.log(colors.red("timeout connecting to claymore-eth on port "+port));
          stats.entries[id].uptime=null;
        stats.entries[id]['eth-hashrate']=null;
        stats.entries[id]['eth-accepted']=null;
        stats.entries[id]['eth-rejected']=null;
        stats.entries[id]['alt-hashrate']=null;
        stats.entries[id]['alt-accepted']=null;
        stats.entries[id]['alt-rejected']=null;
        stats.entries[id].temps=null;
        stats.entries[id].fans=null;
        stats.entries[id].pools=null;
        stats.entries[id].version=null;
            }
        
      });

      mysocket.on('data', function(data) {
        mysocket.setTimeout(0);
        var d = JSON.parse(data);
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          stats.entries[id].uptime= d.result[1]*60;
        var properties = d.result[2].split(';');
        stats.entries[id]['eth-hashrate']=properties[0];
        stats.entries[id]['eth-accepted']=properties[1];
        stats.entries[id]['eth-rejected']=properties[2];
        properties = d.result[4].split(';');
        stats.entries[id]['alt-hashrate']=properties[0];
        stats.entries[id]['alt-accepted']=properties[1];
        stats.entries[id]['alt-rejected']=properties[2];
        properties = d.result[6].split(';');
        stats.entries[id].temps=[];
        stats.entries[id].fans=[];
        for(var i=0;i<properties.length;i+=2){
          if (properties[i]!==""&&properties[i]!==null){
            stats.entries[id].temps.push(properties[i]);
            stats.entries[id].fans.push(properties[i+1]);
          }
        }
        stats.entries[id].pools = d.result[7].split(';');
        stats.entries[id].version=d.result[0];
            }
        
      });

      mysocket.on('close', function() {
      });

      mysocket.on('error', function(e) {
        console.log(colors.red("socket error: " + e.message));
      });

      mysocket.connect(port, "127.0.0.1");
      break;
    case "claymore-zec":
      var net = require('net');
      var mysocket = new net.Socket();

      mysocket.on('connect', function() {
        var req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
        mysocket.write(req + '\n');
        mysocket.setTimeout(1000);
        mysocket.end();
      });

      mysocket.on('timeout', function() {
        
        mysocket.destroy();
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          console.log(colors.red("timeout connecting to claymore-zec on port "+port));
          stats.entries[id].uptime=null;
        stats.entries[id]['zec-hashrate']=null;
        stats.entries[id]['zec-accepted']=null;
        stats.entries[id]['zec-rejected']=null;
        stats.entries[id].temps=null;
        stats.entries[id].fans=null;
        stats.entries[id].pools=null;
        stats.entries[id].version=null;
            }
        
      });

      mysocket.on('data', function(data) {
        mysocket.setTimeout(0);
        var d = JSON.parse(data);
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          stats.entries[id].uptime= d.result[1]*60;
        var properties = d.result[2].split(';');
        stats.entries[id]['zec-hashrate']=properties[0];
        stats.entries[id]['zec-accepted']=properties[1];
        stats.entries[id]['zec-rejected']=properties[2];
        properties = d.result[6].split(';');
        stats.entries[id].temps=[];
        stats.entries[id].fans=[];
        for(var i=0;i<properties.length;i+=2){
          if (properties[i]!==""&&properties[i]!==null){
            stats.entries[id].temps.push(properties[i]);
            stats.entries[id].fans.push(properties[i+1]);
          }
        }
        stats.entries[id].pools = d.result[7].split(';');
        stats.entries[id].version=d.result[0].replace(" - ZEC","");
            }
        
      });

      mysocket.on('close', function() {
      });

      mysocket.on('error', function(e) {
        console.log(colors.red("socket error: " + e.message));
      });

      mysocket.connect(port, "127.0.0.1");
      break;
    case "claymore-cryptonight":
      var net = require('net');
      var mysocket = new net.Socket();

      mysocket.on('connect', function() {
        var req = '{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}';
        mysocket.write(req + '\n');
        mysocket.setTimeout(1000);
        mysocket.end();
      });

      mysocket.on('timeout', function() {
        
        mysocket.destroy();
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          console.log(colors.red("timeout connecting to claymore-cryptonight on port "+port));
          stats.entries[id].uptime=null;
        stats.entries[id].hashrate=null;
        stats.entries[id].accepted=null;
        stats.entries[id].rejected=null;
        stats.entries[id].temps=null;
        stats.entries[id].fans=null;
        stats.entries[id].pools=null;
        stats.entries[id].version=null;
            }
        
      });

      mysocket.on('data', function(data) {
        mysocket.setTimeout(0);
        var d = JSON.parse(data);
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
        stats.entries[id].uptime= d.result[1]*60;
        var properties = d.result[2].split(';');
        stats.entries[id].hashrate=properties[0];
        stats.entries[id].accepted=properties[1];
        stats.entries[id].rejected=properties[2];
        properties = d.result[6].split(';');
        stats.entries[id].temps=[];
        stats.entries[id].fans=[];
        for(var i=0;i<properties.length;i+=2){
          if (properties[i]!==""&&properties[i]!==null){
            stats.entries[id].temps.push(properties[i]);
            stats.entries[id].fans.push(properties[i+1]);
          }
        }
        stats.entries[id].pools = d.result[7].split(';');
        stats.entries[id].version=d.result[0].replace(" - CN","");
        }
      });

      mysocket.on('close', function() {
      });

      mysocket.on('error', function(e) {
        console.log(colors.red("socket error: " + e.message));
      });

      mysocket.connect(port, "127.0.0.1");
      break;
    case "nheqminer":
      var net = require('net');
      var mysocket = new net.Socket();

      mysocket.on('connect', function() {
        var req = 'status';
        mysocket.write(req + '\n');
        mysocket.setTimeout(1000);
        mysocket.end();
      });

      mysocket.on('timeout', function() {
        mysocket.destroy();
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          console.log(colors.red("timeout connecting to nheqminer on port "+port));
        stats.entries[id].iterationRate=null;
        stats.entries[id].solutionRate=null;
        stats.entries[id].acceptedPerMinute=null;
        stats.entries[id].rejectedPerMinute=null;
        miner[id].kill();
        kill(miner[id].pid);
        }
      });

      mysocket.on('data', function(data) {
        mysocket.setTimeout(0);
        var d = JSON.parse(data);
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
        stats.entries[id].iterationRate= d.result.speed_ips;
        stats.entries[id].solutionRate=d.result.speed_sps;
        stats.entries[id].acceptedPerMinute= d.result.accepted_per_minute;
        stats.entries[id].rejectedPerMinute= d.result.rejected_per_minute;
        }
      });

      mysocket.on('close', function() {
      });

      mysocket.on('error', function(e) {
        console.log(colors.red("socket error: " + e.message));
      });
      mysocket.connect(port, "127.0.0.1");
      break;
    case "optiminer-zec":
      var req= http.request({
        host: "127.0.0.1",
        path: "/",
        method: 'GET',
        port: port,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8'
        }
      }, function (response) {
        response.setEncoding('utf8');
        var body = '';
        response.on('data', function (d) {
          body += d;
        });
        response.on('end', function () {
          if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          //console.log(body);
          var parsed = null;
          try{
            parsed=JSON.parse(body);
          }catch(error){
            stats.entries[id].uptime=null;
            stats.entries[id].version=null;
            stats.entries[id].hashrate=null;
            stats.entries[id].accepted=null;
            stats.entries[id].rejected=null;
            console.log(colors.red("Error: Unable to get stats data for optiminer-zec on port "+port));
          }
          if (parsed != null){
            if (parsed.uptime)
              stats.entries[id].uptime=parsed.uptime;
            if (parsed.version)
              stats.entries[id].version=parsed.version;
            if (parsed["solution_rate"]&&parsed["solution_rate"]["Total"])
              if(parsed["solution_rate"]["Total"]["3600s"]){
                stats.entries[id].hashrate=parsed["solution_rate"]["Total"]["3600s"];
              }else{
                if(parsed["solution_rate"]["Total"]["60s"])
                  stats.entries[id].hashrate=parsed["solution_rate"]["Total"]["60s"];
                else
                  stats.entries[id].hashrate=parsed["solution_rate"]["Total"]["5s"];
              }
                
            if (parsed.share){
              stats.entries[id].accepted=parsed.share.accepted;
              stats.entries[id].rejected=parsed.share.rejected;
            }
          }
          }
        });
      }).on("error", function(error) {
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
          stats.entries[id].uptime=null;
          stats.entries[id].version=null;
          stats.entries[id].hashrate=null;
          stats.entries[id].accepted=null;
          stats.entries[id].rejected=null;
          console.log(colors.red("Error: Unable to get stats data for optiminer-zec on port "+port));
        console.log(error);
        }
      });
      req.on('socket', function (socket) {
        socket.setTimeout(2000);
        socket.on('timeout', function() {
          if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
            console.log(colors.red("timeout connecting to optiminer-zec on port "+port));
            stats.entries[id].uptime=null;
            stats.entries[id].version=null;
            stats.entries[id].hashrate=null;
            stats.entries[id].accepted=null;
            stats.entries[id].rejected=null;
          }
          req.abort();
        });
      });
      req.end();
      break;
    case "sgminer-gm":
      var net = require('net');
      var mysocket = new net.Socket();

      mysocket.on('connect', function() {
        var req = '{"command":"summary+coin","parameter":""}';
        mysocket.write(req + '\n');
        mysocket.setTimeout(2000);
        mysocket.end();
      });

      mysocket.on('timeout', function() {
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
        stats.entries[id].accepted = null;
        stats.entries[id].rejected = null;
        stats.entries[id].algorithm = null;
        stats.entries[id].hashrate = null;
        stats.entries[id].miner = null;
        stats.entries[id].uptime = null;
        console.log(colors.red("timeout connecting to sgminer-gm on port "+port));
        }
        mysocket.destroy();
      });

      mysocket.on('data', function(data) {
        mysocket.setTimeout(0);
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
        var parsed=null;
        var tmpString=data.toString('utf8');
        try{
          //cut last char ("")
          parsed=JSON.parse(tmpString.substring(0, tmpString.length - 1));
        }catch(error){
          stats.entries[id].accepted = null;
          stats.entries[id].rejected = null;
          stats.entries[id].algorithm = null;
          stats.entries[id].hashrate = null;
          stats.entries[id].miner = null;
          stats.entries[id].uptime = null;
          console.log(colors.red("Error: Unable to get stats data for sgminer-gm on port "+port));
          console.log(error);
        }
        if (parsed != null){
          stats.entries[id].accepted = parseInt(parsed.summary[0].SUMMARY[0].Accepted);
          stats.entries[id].rejected = parseFloat(parsed.summary[0].SUMMARY[0].Rejected);
          stats.entries[id].algorithm = parsed.coin[0].COIN[0]["Hash Method"];
          stats.entries[id].hashrate = parseFloat(parsed.summary[0].SUMMARY[0]["KHS av"]);
          stats.entries[id].miner = parsed.summary[0].STATUS[0].Description;
          stats.entries[id].uptime = parsed.summary[0].SUMMARY[0].Elapsed;
        }
        }
      });

      mysocket.on('close', function() {
      });

      mysocket.on('error', function(e) {
        if(stats.entries[id]!==undefined&&stats.entries[id]!==null){
        stats.entries[id].accepted = null;
        stats.entries[id].rejected = null;
        stats.entries[id].algorithm = null;
        stats.entries[id].hashrate = null;
        stats.entries[id].miner = null;
        stats.entries[id].uptime = null;
        console.log(colors.red("socket error: " + e.message));
        }
      });

      mysocket.connect(port, "127.0.0.1");
      break;
    case "other":
      break;
  }
}

function isRunning(){
  return stats.running;
}

function reload(){
  reloading=true;
  setTimeout(function(){
    reloading=false;
    updatePoolStatus();
  },60*1000);
}

function init() {
  if (configModule.config.autostart) {
    console.log(colors.green("autostart enabled, starting miner shortly.."));
    setTimeout(function () {
      startAllMiner();
    }, 10000);
  }
  stats.rigName=configModule.config.rigName;

  updatePoolStatus();

}

setTimeout(init, 1000);

exports.getStats = getStats;
exports.startMining = startMining;
exports.stopMining = stopMining;
exports.stopMiner = stopMiner;
exports.stopAllMiner = stopAllMiner;
exports.startMiner = startMiner;
exports.startAllMiner = startAllMiner;
exports.isRunning=isRunning;
