'use strict';

var express = require('express');

module.exports = function(app) {
  var router = express.Router();

  var configController = require(__basedir + 'api/controllers/configController');
  var miningController = require(__basedir + 'api/controllers/miningController');

  router.get('/config', configController.getConfig);
  router.post('/config', configController.setConfig);
  router.post('/config/update', configController.update);
  router.post('/config/updateMiner', configController.updateMiner);

  router.get('/mining/stats', miningController.getStats);
  router.post('/mining/start', miningController.startMining);
  router.post('/mining/stop', miningController.stopMining);

  app.use('/api', router);
};
