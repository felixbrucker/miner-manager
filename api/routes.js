'use strict';

const express = require('express');

module.exports = function(app) {
  const router = express.Router();

  const configController = require(`${__basedir}/api/controllers/configController`);
  const miningController = require(`${__basedir}/api/controllers/miningController`);

  router.get('/config', configController.getConfig);
  router.post('/config', configController.setConfig);
  router.post('/config/update', configController.update);
  router.post('/config/updateMiner', configController.updateMiner);
  router.post('/config/reboot', configController.rebootSystem);

  router.get('/mining/stats', miningController.getStats);
  router.post('/mining/start', miningController.startMining);
  router.post('/mining/stop', miningController.stopMining);

  app.use('/api', router);
};
