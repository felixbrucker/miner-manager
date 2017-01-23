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
    groups:[],
    rigName:null,
    profitabilityServiceUrl:null
  },
  configNonPersistent:{
    types:["cpuminer-opt","claymore-eth","claymore-zec","claymore-cryptonight","optiminer-zec","ccminer","nheqminer","other"],
    algos:[
      "argon2",
      "axiom",
      "blake2s",
      "blake256r8",
      "blake256r8vnl",
      "blake256r14",
      "c11",
      "cryptonight",
      "daggerhashimoto",
      "decred",
      "equihash",
      "hodl",
      "keccak",
      "lbry",
      "lyra2re",
      "lyra2rev2",
      "m7m",
      "myr-gr",
      "neoscrypt",
      "nist5",
      "quark",
      "qubit",
      "scrypt",
      "scryptjanenf16",
      "scryptnf",
      "sha256",
      "sib",
      "skein",
      "veltor",
      "whirlpoolx",
      "x11",
      "x11evo",
      "x13",
      "x14",
      "x15",
      "x17",
      "yescrypt"
    ]
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
          if (config.config.groups===undefined)
            config.config.groups=[];
          if(config.config.profitabilityServiceUrl===undefined)
            config.config.profitabilityServiceUrl=null;
        });
      } else if (err.code == 'ENOENT') {
        //default conf
        config.config.autostart=false;
        config.config.rigName="RXX";
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
