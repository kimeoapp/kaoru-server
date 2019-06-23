var express = require('express');
const async = require('async');
var router = express.Router();
const common = require('./common');
const kaoruConfig = require('../config');
const RewardLog = require('../model').RewardLog;
const StellarSdk = require('stellar-sdk');
const Sequelize = require('sequelize');

const server = new StellarSdk.Server(kaoruConfig.stellar);

StellarSdk.Network.useTestNetwork();

router.get('/balance', common.uidCheck, common.attachWallet, (req, res, next) => {
  let wallet = req.wallet;
  let publicKey = wallet.public;
  const uid = wallet.user;

  async.parallel({
    walt: (ck) => {
      common.loadRealBalanceForWallet(publicKey, (err, bal) => {
        if(bal) {
          return ck(null, bal);
        }
        return ck(err ? err : false)
      });
    },
    rewards: (ck) => {
      RewardLog.findAll(
        {
          where: {user: uid},
          attributes: [[Sequelize.fn('sum', Sequelize.col('amount')), 'total']]
        }).then(rewards => {
        if(rewards) { return ck(null, rewards.dataValues); }
        return ck(null, null);
      })
      .catch(er => {
        return ck(er);
      });
    }
  }, (err, results) => {
    if(err) {
      console.log(err);
      res.status(500);
      return res.end();
    }
    const bal = results.walt;
    const rewards = results.rewards;
    let gr = rewards ? rewards.total : 0;
    if(!gr) { gr = 0;}
    return res.jsonp({success: true, data: {type: bal.asset_type, balance: bal.balance, green: gr, black: 0}});
  });
});

router.get('/cached', common.uidCheck, common.attachWallet, (req, res, next) => {
  const wallet = req.wallet;
  const uid = wallet.user;

  async.parallel({
    walt: (ck) => {
      return ck(null, req.wallet.balance);
    },
    rewards: (ck) => {
      RewardLog.findOne({where: {user: uid},
        attributes: [[Sequelize.fn('sum', Sequelize.col('amount')), 'total']]}).then(rewards => {
        return ck(null, rewards.dataValues);
      })
      .catch(er => {
        return ck(er);
      });
    }
  }, (err, results) => {
    if(err) {
      res.status(500);
      return res.end();
    }
    const bal = results.walt;
    const rewards = results.rewards;
    let gr = rewards ? rewards.total : 0;
    if(!gr) { gr = 0;}
    return res.jsonp({success: true, data: {type: bal.asset_type, balance: bal.balance, green: gr, black: 0}});
  });

});

router.get('/transactions', common.uidCheck, common.attachWallet, (req, res, nxt) => {
  let wallet = req.wallet;
  let records = [];
  let operations = [];

  function doMapping() {
    let reMap = {}, oeMap = {};
    for(let i = 0; i < records.length; i++) {
      let im = records[i];
      reMap[im.id] = im;
    }
    for(let i = 0; i < operations.length; i++) {
      let im = operations[i];
      oeMap[im.transaction] = im;
    }
    let maps = [];
    for(let prop in reMap) {
      if(reMap.hasOwnProperty(prop) && oeMap.hasOwnProperty(prop)) {
        let im = reMap[prop];
        let om = oeMap[prop];
        im.type = om.type;
        im.amount = om.amount;
        im.spend = om.from == wallet.public;
        maps.push(im);
      }
    }
    return res.jsonp({success: true, data: maps});
  }

  function readOperations() {
    server.operations()
    .forAccount(wallet.public)
    .call()
    .then(function (page) {
        let all = [];
        for(let i = 0; i < page.records.length; i++) {
          let sin = page.records[i];
          let im = {};
          im.transaction = sin.transaction_hash;
          im.type = sin.type;

          if(sin.type == 'create_account') {
            im.from = sin.funder;
            im.to = sin.account;
            im.amount = sin.starting_balance;
          } else {
            im.from = sin.from;
            im.to = sin.to;
            im.amount = sin.amount;
          }

          all.push(im);
        }
        operations = all;
        doMapping();
    });
  }

  server.transactions()
    .forAccount(wallet.public)
    .call()
    .then(function (page) {
        let all = [];
        for(let i = 0;i < page.records.length; i++) {
          let sin = page.records[i];
          let im = {};
          im.id = sin.id;
          if(sin.memo) {
            im.memo = sin.memo;
          } else {
            im.memo = null;
          }
          im.success = sin.successful;
          im.created = sin.created_at;
          im.source = sin.source_account;
          all.push(im);
        }
        records = all;
        readOperations();
    });
});

module.exports = router;
