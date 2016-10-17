/**
 * @namespace configCtrl
 *
 * @author: Felix Brucker
 * @version: v0.0.1
 *
 * @description
 * handles functionality for the config page
 *
 */
(function () {
    'use strict';

    angular
        .module('app')
        .controller('configCtrl', configController);

    function configController($scope,$interval,$http) {

        var vm = this;
        vm.config = {
            rigName: null,
            autostart:null,
            entries:[],
            types:[]
        };
        vm.waiting = null;
        vm.updating=null;

        vm.newCustomMiner={
            id:null,
            enabled:true,
            binPath:"",
            cmdline:"",
            type:null,
            port:null,
            writeMinerLog:true,
            shell:false
        };


        // controller API
        vm.init = init;
        vm.getConfig=getConfig;
        vm.setConfig=setConfig;
        vm.update=update;
        vm.addCustomMiner=addCustomMiner;
        vm.delCustomMiner=delCustomMiner;



        /**
         * @name init
         * @desc data initialization function
         * @memberOf configCtrl
         */
        function init() {
            angular.element(document).ready(function () {
                vm.getConfig();
            });
        }

        /**
         * @name addCustomMiner
         * @desc add new custom miner to array
         * @memberOf configCtrl
         */
        function addCustomMiner() {
            if (vm.newCustomMiner.binPath!==""&&vm.newCustomMiner.binPath!==null&&vm.newCustomMiner.cmdline!==""&&vm.newCustomMiner.cmdline!==null){
                //gen unique id
                vm.newCustomMiner.id=Date.now();
                //add to array
                vm.config.entries.push(JSON.parse(JSON.stringify(vm.newCustomMiner)));
                //clear variables
                vm.newCustomMiner.id=null;
                vm.newCustomMiner.enabled=true;
                vm.newCustomMiner.binPath="";
                vm.newCustomMiner.cmdline="";
                vm.newCustomMiner.type=null;
                vm.newCustomMiner.port=null;
                vm.newCustomMiner.writeMinerLog=true;
                vm.newCustomMiner.shell=false;
                vm.setConfig();
            }
        }

        /**
         * @name delCustomMiner
         * @desc delete custom miner from array
         * @memberOf configCtrl
         */
        function delCustomMiner(id) {
            vm.config.entries.forEach(function (entry,index,array) {
                if (entry.id===id){
                    vm.config.entries.splice(index,1);
                }
            });
            vm.setConfig();
        }

        /**
         * @name getConfig
         * @desc get the config
         * @memberOf configCtrl
         */
        function getConfig() {
            return $http({
                method: 'GET',
                url: 'api/config'
            }).then(function successCallback(response) {
                vm.config.rigName = response.data.rigName;
                vm.config.autostart = response.data.autostart;
                vm.config.entries=response.data.entries;
                vm.config.types=response.data.types;
            }, function errorCallback(response) {
                console.log(response);
            });
        }


        /**
         * @name setConfig
         * @desc set the config
         * @memberOf configCtrl
         */
        function setConfig() {
            vm.waiting=true;
            return $http({
                method: 'POST',
                url: 'api/config',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                data: vm.config
            }).then(function successCallback(response) {
                setTimeout(function(){vm.waiting = false;},500);
            }, function errorCallback(response) {
                console.log(response);
            });
        }

        /**
         * @name update
         * @desc updates the project from git
         * @memberOf configCtrl
         */
        function update() {
            vm.updating=true;
            return $http({
                method: 'POST',
                url: 'api/config/update',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                }
            }).then(function successCallback(response) {
                setTimeout(function(){vm.updating = false;},500);
            }, function errorCallback(response) {
                console.log(response);
            });
        }




        // call init function on firstload
        vm.init();

    }

})();
