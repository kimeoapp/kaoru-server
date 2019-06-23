var express = require('express');
var router = express.Router();
const common = require('./common');
const kaoruConfig = require('../config');
const StellarSdk = require('stellar-sdk');
const server = new StellarSdk.Server(kaoruConfig.stellar);
const async = require('async');
const Op = require('sequelize').Op;

const {UserProvider, UserTransaction, Provider, Wallet} = require('../model');

StellarSdk.Network.useTestNetwork();
/*
TODO fabric chaincode.
End point is called by admin interface to process settlement
of service provider account at the end of each billing cycle(monthly)
Offers given by the service provider based on number of trips 
the person has taken is applied here.
Refund/Discount if any is sent to corresponding user
rest of the amount is settled to the service provider wallet
@
Expects uid, service provider user id
and month for which settlement is to be done.(starts from 1)
*/
router.post('/', common.uidCheck, (req, res, next) => {

  const uid = req.body.uid;
  const month = parseInt(req.body.month);

  Provider.findByPk(uid).then(provider => {
    const info = JSON.parse(provider.info);

    if(info.offers && info.offers.length) {
      const offers = info.offers;

      async.parallel({pWallet: (callback) => {
        common.findWalletForProvider(uid, callback);
      },
      providerRelations: (callback) => {
        UserProvider.findAll({raw: true, where: {contractor: uid}}).then(allWallets => {
          return callback(null, allWallets);
        }).catch(err => {
          return callback(err);
        })
      }}, (aerr, aresults) => {
        if(aerr) {
          res.status(500);
          return res.end();
        }
        let allWallets = aresults.providerRelations;
        if(allWallets.length == 0) {
          return res.jsonp({success: true});
        }

        let wallets = [];
        for(let i = 0; i < allWallets.length; i++) {
          wallets.push(allWallets[i].wallet);
        }

        let dt = new Date();
        let year = dt.getFullYear();
        // let month = dt.getMonth();
        var date = new Date(), y = date.getFullYear(), m = month -1;
        var startDate = new Date(y, m, 1, 0,0,0);
        var endDate = new Date(y, m + 1, 0,0,0,0);

        UserTransaction.findAll({
          raw: true,
          where: {
            createdAt: {
              [Op.gte]: startDate,
              [Op.lte]: endDate
            },
            status: 'done',
            wallet: {
              [Op.in]: wallets
            }
          }}).then(all => {

            batchProcessing(req, res, next, offers, all, aresults.pWallet);
          }).catch(err => {
            console.log(err);
            res.status(500);
            return res.end();
          });
      
      });
    }
      
  }).catch(err => {
    console.log(err);
    res.status(500);
    return res.end();
  });
});

const batchProcessing =(req, res, next, offers, transactions, providerWallet) => {
  let CounterMap = {};
  let providerUserWalletsMap = {};
  let providerWallets = [];
  for(let i = 0; i < transactions.length; i++) {
    let item = transactions[i];
    if(typeof CounterMap[item.by] == 'undefined') {
      CounterMap[item.by] = 0;
      providerWallets.push(item.wallet);
    }
    providerUserWalletsMap[item.by] = item.wallet;
    let cnt = CounterMap[item.by];
    cnt++;
    CounterMap[item.by] = cnt;
  }

  let offerMap = {};
  for(let prop in CounterMap) {
    if(CounterMap.hasOwnProperty(prop)) {
      let item = CounterMap[prop];
      let maxOffer = 0;
      for(let i = 0; i < offers.length; i++) {
        let offer = offers[i];
        if(item >= 1) {
          if(maxOffer < offer.discount) {
            maxOffer = offer.discount;
          }
        }
      }
      if(maxOffer != 0) {
        offerMap[prop] = maxOffer;
      }
    }
  }

  let userWalletIds = [];
  for(let prop in providerUserWalletsMap) {
    if(providerUserWalletsMap.hasOwnProperty(prop)) {
      userWalletIds.push(prop);
    }
  }
  
  async.parallel( {
    users: (callback) => {
      Wallet.findAll({
        raw: true,
        where: {
          user: { 
            [Op.in]: userWalletIds
          },
          kind: 'end'
        }
      }).then(all => {
        return callback(null, all);
      }).catch(err => {
        console.log(err);
        return callback(err);
      });
    },
    providersWallet: (callback) => {
      Wallet.findAll({
        raw: true,
        where: {
          user: { 
            [Op.in]: providerWallets
          },
          kind: 'provider-vault'
        }
      }).then(all => {
        return callback(null, all);
      }).catch(err => {
        console.log(err);
        return callback(err);
      });
    },
    providers: (callback) => {
      UserProvider.findAll({
        raw: true,
        where: {
          wallet:{
            [Op.in]: providerWallets
          }
        }
      }).then(all => {
        return callback(null, all);
      }).catch(err => {
        console.log(err);
        return callback(err);
      })
    }
  }, (err, allResult) => {
    if(err) {
      console.log(err);
      res.status(500);
      return res.end();
    }
    console.log(allResult);
    doTransfers(req, res, next, allResult, offerMap, providerWallet);

  });
}

function genMap(map, pro) {
  let om = {};
  for(let i = 0; i < map.length; i++) {
    let item = map[i];
    om[item[pro]] = item;
  }
  
  return om;
}

const doTransfers = (req, res, next, all, offerMap, providerWallet) => {
  let usersMap = genMap(all.users, 'user');
  let vaultMap = genMap(all.providersWallet, 'user');
  let providersMap = genMap([providerWallet], 'user');
  let userProviderMap = genMap(all.providers, 'user');  

  for(let prop in offerMap) {
    if(offerMap.hasOwnProperty(prop)) {
      let userId = prop;
      let discount = offerMap[userId];
      const userWallet = usersMap[userId];
      let userProviderRelation = userProviderMap[userId];
      let vaultId = userProviderRelation['wallet'];
      const vaultWallet = vaultMap[vaultId];
      const serviceWallet = providersMap[userProviderRelation['contractor']];
      settle(req, res, next, userWallet, vaultWallet, serviceWallet, discount);
    }
  }
}

const monthsConstants = ['Jan', 'Feb', 'Mar', 'Apr','May','Jun','Jul','Aug','Sep', 'Oct', 'Nov','Dec'];

const settle = (req, res, next, userWallet, vaultWallet, providerWallet, percent) => {
  common.loadRealBalanceForWallet(vaultWallet.public, (err, result) => {
    if(err) {
      console.log(err);
      res.status(500);
      return res.end();
    }
    if(!result) {
      //nothing to do
      return res.jsonp({success: true});
    }

    let realBal = result.balance;
    let avaBal = realBal - 1; // need something to keep it open and transactions

    let userRefund = (avaBal * (percent / 100));
    let providerAmount = avaBal -  userRefund;

    // settle to user
    async.series({
      user: (ck)=> {
        userRefund = userRefund.toFixed(5);
        const usrMemo = 'Monthly rewards';
        common.doPayment(vaultWallet, userWallet, userRefund, usrMemo, ck);
      },
      provider: (ck) => {
        providerAmount = providerAmount.toFixed(5);
        let mnth = parseInt(req.body.month) - 1;
        const proMemeo = 'Settlement - ' + monthsConstants[ mnth ];
        common.doPayment(vaultWallet, providerWallet, providerAmount, proMemeo, ck);
      }
    }, (err, results) => {
      if(err) {
        console.log(err);
        res.status(500);
        return res.end();
      }
      return res.jsonp({success: true});
    });
    

  });
}

module.exports = router;