'use strict';

var colors = require('colors/safe');
var fs = require('fs');

var configPath="data/settings.json";

if (!fs.existsSync("data")){
  fs.mkdirSync("data");
}
var config = module.exports = {
  config: {
    autostart:null,
    entries:[],
    rigName:null,
    types:["cpuminer-opt","ccminer","claymore-eth","other"]
  },
  getConfig: function () {
    return config.config;
  },
  setConfig: function (newConfig) {
    config.config = newConfig;
  },
  saveConfig: function () {
    console.log(colors.grey("writing config to file.."));
    fs.writeFile(configPath, JSON.stringify(config.config,null,2), function (err) {
      if (err) {
        return console.log(err);
      }
    });
  },
  loadConfig: function () {
    fs.stat(configPath, function (err, stat) {
      if (err == null) {
        fs.readFile(configPath, 'utf8', function (err, data) {
          if (err) throw err;
          config.config = JSON.parse(data);
          for (var i=0;i<config.config.entries.length;i++){
            if (config.config.entries[i].shell===undefined)
              config.config.entries[i].shell=false;
          }
        });
      } else if (err.code == 'ENOENT') {
        //default conf
        config.config.autostart=false;
        config.config.rigName=process.env.WNAME;
        config.config.entries.push({id:Date.now(),enabled:true,binPath:"bin/cpuminer",cmdline:"-a cryptonight -o us-east.cryptonight-hub.miningpoolhub.com:20580 -u someone123."+process.env.WNAME+" -p x -t 3",type:"cpuminer-opt",port:10001,writeMinerLog:true,shell:false});
        config.saveConfig();
        setTimeout(function(){
          config.loadConfig();
        },500);
      }
    });
  }
};
console.log("initializing, please wait...");
config.loadConfig();
